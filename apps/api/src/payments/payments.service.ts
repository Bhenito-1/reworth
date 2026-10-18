import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { FulfilmentMethod, Payment, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPsp } from '../providers/mock-psp';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { FeeConfigService } from '../monetization/fee-config.service';
import { RevenueLedgerService } from '../monetization/revenue-ledger.service';
import {
  computeDeliveryMarginKobo,
  computeProtectionFeeKoboFromRates,
} from '../monetization/fee-rates';
import { InitiatePaymentDto } from './dto/payments.dto';
import { SWAP_FEE_PER_USER_KOBO } from '../swap/swap-fees';

export type PaymentDto = {
  id: string;
  orderId: string;
  payerId: string | null;
  provider: string;
  reference: string;
  amountKobo: number;
  status: string;
  checkoutUrl?: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly fees: FeeConfigService,
    private readonly ledger: RevenueLedgerService,
    @Inject(PAYMENT_PROVIDER) private readonly psp: PaymentProvider,
  ) {}

  async initiate(buyerId: string, dto: InitiatePaymentDto): Promise<PaymentDto> {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      const payload = existing.providerPayload as { checkoutUrl?: string } | null;
      return this.toDto(existing, payload?.checkoutUrl);
    }

    const order = await this.orders.requireOrder(dto.orderId);
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can initiate payment');
    }
    if (order.status !== 'PAYMENT_PENDING') {
      throw new ConflictException(
        `Order must be PAYMENT_PENDING (got ${order.status})`,
      );
    }
    if (
      order.fulfilmentMethod === FulfilmentMethod.DELIVERY &&
      order.deliveryFeeKobo <= 0
    ) {
      throw new ConflictException(
        'Delivery quote required before payment — GET /orders/:id/delivery-quote',
      );
    }

    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
    });
    const email = buyer?.email ?? `${buyerId}@reworth.local`;
    const reference = `rw_${order.id.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;

    const amountKobo =
      order.transactionType === 'SWAP'
        ? order.deliveryFeeKobo + SWAP_FEE_PER_USER_KOBO
        : order.totalKobo;

    const result = await this.psp.initiate({
      amountKobo,
      currency: 'NGN',
      reference,
      email,
      metadata: { orderId: order.id, payerId: buyerId },
      idempotencyKey: dto.idempotencyKey,
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        payerId: buyerId,
        provider: this.psp.name,
        reference: result.reference,
        amountKobo,
        status: 'PENDING',
        idempotencyKey: dto.idempotencyKey,
        providerPayload: {
          checkoutUrl: result.checkoutUrl,
          paymentId: result.paymentId,
        },
      },
    });

    this.notifications.log('payment.initiated', {
      paymentId: payment.id,
      orderId: order.id,
      reference: payment.reference,
    });

    return this.toDto(payment, result.checkoutUrl);
  }

  async getById(paymentId: string, userId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (
      payment.order.buyerId !== userId &&
      payment.order.sellerId !== userId
    ) {
      throw new ForbiddenException('Not a participant');
    }
    const payload = payment.providerPayload as { checkoutUrl?: string } | null;
    return this.toDto(payment, payload?.checkoutUrl);
  }

  async handleWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
    payload: unknown,
  ): Promise<{ ok: boolean; orderId?: string }> {
    if (!signature || !this.psp.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return this.applyWebhookPayload(payload);
  }

  /** Mock PSP test endpoint — no signature required when provider is mock. */
  async handleMockWebhook(body: {
    reference: string;
    event?: string;
  }): Promise<{ ok: boolean; orderId?: string }> {
    if (this.psp.name !== 'mock-psp') {
      throw new ForbiddenException('Mock webhook only available for mock PSP');
    }
    const mock = this.psp as MockPsp;
    mock.simulateWebhookSuccess(body.reference);
    return this.applyWebhookPayload({
      event: body.event ?? 'charge.success',
      data: { reference: body.reference, status: 'success' },
    });
  }

  private async applyWebhookPayload(
    payload: unknown,
  ): Promise<{ ok: boolean; orderId?: string }> {
    const parsed = this.psp.parseWebhook(payload);
    if (!parsed.reference) {
      this.logger.warn('Webhook missing reference');
      return { ok: false };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { reference: parsed.reference },
    });
    if (!payment) {
      this.logger.warn(`Unknown payment reference ${parsed.reference}`);
      return { ok: false };
    }

    // Replay-safe: already SUCCESS / RELEASED / REFUNDED
    if (
      payment.status === 'SUCCESS' ||
      payment.status === 'RELEASED' ||
      payment.status === 'REFUNDED' ||
      payment.status === 'PARTIALLY_REFUNDED'
    ) {
      return { ok: true, orderId: payment.orderId };
    }

    if (parsed.status === 'success') {
      if (this.psp instanceof MockPsp || this.psp.name === 'mock-psp') {
        (this.psp as MockPsp).simulateWebhookSuccess(parsed.reference);
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          providerPayload: {
            ...(payment.providerPayload as object),
            webhook: parsed,
          } as Prisma.InputJsonValue,
        },
      });

      try {
        await this.orders.markFunded(payment.orderId, payment.reference);
      } catch (err) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
        throw err;
      }
      await this.recordOrderRevenue(payment.orderId, payment.reference);
      this.notifications.log('payment.success', {
        paymentId: payment.id,
        orderId: payment.orderId,
        reference: payment.reference,
      });
      return { ok: true, orderId: payment.orderId };
    }

    if (parsed.status === 'failed') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      return { ok: true, orderId: payment.orderId };
    }

    return { ok: true, orderId: payment.orderId };
  }

  /** One RevenueLine per fee stream on successful capture. */
  private async recordOrderRevenue(orderId: string, pspReference: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { select: { city: true, categoryId: true } } },
    });
    if (!order) return;
    const { rates, id: feeConfigVersionId } = await this.fees.getActive();
    const city = order.listing?.city ?? 'Lagos';
    const categoryId = order.listing?.categoryId ?? undefined;

    if (order.protectionFeeKobo > 0) {
      const expected = computeProtectionFeeKoboFromRates(
        order.amountKobo,
        rates,
      );
      await this.ledger.record({
        stream: 'PROTECTION_FEE',
        grossKobo: order.protectionFeeKobo,
        netKobo: order.protectionFeeKobo,
        orderId: order.id,
        listingId: order.listingId,
        sellerId: order.sellerId,
        city,
        categoryId,
        pspReference,
        feeConfigVersionId,
        referenceType: 'Order',
        referenceId: `${order.id}:protection`,
        meta: { expectedKobo: expected },
      });
    }

    if (order.deliveryFeeKobo > 0) {
      const margin = computeDeliveryMarginKobo(order.deliveryFeeKobo, rates);
      if (margin > 0) {
        await this.ledger.record({
          stream: 'DELIVERY_MARGIN',
          grossKobo: order.deliveryFeeKobo,
          netKobo: margin,
          orderId: order.id,
          listingId: order.listingId,
          sellerId: order.sellerId,
          city,
          categoryId,
          pspReference,
          feeConfigVersionId,
          referenceType: 'Order',
          referenceId: `${order.id}:delivery_margin`,
        });
      }
    }
  }

  private toDto(p: Payment, checkoutUrl?: string): PaymentDto {
    return {
      id: p.id,
      orderId: p.orderId,
      payerId: p.payerId,
      provider: p.provider,
      reference: p.reference,
      amountKobo: p.amountKobo,
      status: p.status,
      checkoutUrl,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
