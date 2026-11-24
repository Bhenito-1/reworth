import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
import { newPaymentReference } from '../common/transaction-reference';
import {
  nonOrderChargePurpose,
  payReturnUrl,
  type NonOrderChargePurpose,
  type NonOrderChargeResult,
} from '../common/pay-return-url';
import { SellerPromotionsService } from '../monetization/seller-promotions.service';
import { SellerSubscriptionService } from '../monetization/seller-subscription.service';
import { NotificationCategory } from '../notifications/notification-categories';

export type PaymentDto = {
  id: string;
  orderId: string;
  payerId: string;
  payeeId: string;
  provider: string;
  reference: string;
  amountKobo: number;
  status: string;
  checkoutUrl?: string;
  createdAt: Date;
  updatedAt: Date;
};

/** `POST /payments/confirm` for a boost, featured slot or Seller Plus charge. */
export type NonOrderChargeDto = {
  id: string;
  orderId: null;
  purpose: NonOrderChargePurpose;
  listingId?: string;
  reference: string;
  amountKobo: number;
  status: NonOrderChargeResult['status'];
};

/** Order states in which no payment has funded the order. */
const UNFUNDED_ORDER_STATUSES: ReadonlySet<string> = new Set([
  'CREATED',
  'PAYMENT_PENDING',
  'CANCELLED',
]);

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
    @Optional() private readonly promotions?: SellerPromotionsService,
    @Optional() private readonly subscriptions?: SellerSubscriptionService,
  ) {}

  async initiate(buyerId: string, dto: InitiatePaymentDto): Promise<PaymentDto> {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.payerId !== buyerId) {
        throw new ConflictException('Use a new idempotency key');
      }
      await this.prisma.order.updateMany({
        where: { id: existing.orderId, paymentId: null },
        data: { paymentId: existing.id },
      });
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
    const email =
      buyer?.email?.trim() || `payments+${buyerId}@reworth.ng`;
    const reference = newPaymentReference();

    const amountKobo =
      order.transactionType === 'SWAP'
        ? order.deliveryFeeKobo + SWAP_FEE_PER_USER_KOBO
        : order.totalKobo;

    // One open checkout per order. Reusing it stops a buyer from paying the
    // same order twice in two tabs (or after a double click).
    const open = await this.reuseOpenCheckout(order.id, buyerId, amountKobo);
    if (open) return open;

    const result = await this.psp.initiate({
      amountKobo,
      currency: 'NGN',
      reference,
      email,
      metadata: { orderId: order.id, payerId: buyerId },
      idempotencyKey: dto.idempotencyKey,
      callbackUrl: payReturnUrl(this.psp.name),
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.payment.create({
        data: {
          orderId: order.id,
          payerId: buyerId,
          payeeId: order.sellerId,
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
      // Points the order at its latest checkout while it is unpaid.
      // markFunded overwrites this with the payment that actually funds it.
      await tx.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { paymentId: row.id },
      });
      return row;
    });

    this.notifications.log('payment.initiated', {
      paymentId: payment.id,
      orderId: order.id,
      reference: payment.reference,
    });

    return this.toDto(payment, result.checkoutUrl);
  }

  /**
   * Returns the buyer's open checkout for this order when Paystack still
   * shows it unpaid and the amount has not changed. A checkout that already
   * succeeded funds the order instead. A failed one, or one for an old
   * amount, is closed so a new checkout is created; if the buyer pays the old
   * link anyway, markPaymentSuccess refunds it.
   */
  private async reuseOpenCheckout(
    orderId: string,
    buyerId: string,
    amountKobo: number,
  ): Promise<PaymentDto | null> {
    const open = await this.prisma.payment.findFirst({
      where: { orderId, payerId: buyerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!open) return null;

    const verified = await this.psp.verify(open.reference);
    if (verified.status === 'success') {
      await this.markPaymentSuccess(open, { verify: verified });
      const fresh = await this.prisma.payment.findUniqueOrThrow({
        where: { id: open.id },
      });
      return this.toDto(fresh, this.checkoutUrlOf(fresh));
    }
    const checkoutUrl = this.checkoutUrlOf(open);
    if (
      verified.status === 'pending' &&
      open.amountKobo === amountKobo &&
      checkoutUrl
    ) {
      return this.toDto(open, checkoutUrl);
    }
    await this.prisma.payment.updateMany({
      where: { id: open.id, status: 'PENDING' },
      data: {
        status: 'FAILED',
        providerPayload: {
          ...((open.providerPayload as object | null) ?? {}),
          abandonedAt: new Date().toISOString(),
          abandonReason:
            verified.status === 'failed' ? 'psp_failed' : 'amount_changed',
        } as Prisma.InputJsonValue,
      },
    });
    return null;
  }

  private checkoutUrlOf(p: Payment): string | undefined {
    return (p.providerPayload as { checkoutUrl?: string } | null)?.checkoutUrl;
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

  /**
   * Buyer landed back from Paystack. Confirms the charge with the provider
   * so a local callback works before the webhook arrives.
   */
  async confirm(
    userId: string,
    reference: string,
  ): Promise<PaymentDto | NonOrderChargeDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: { order: true },
    });
    if (!payment) {
      const charge = await this.activateNonOrderCharge(reference, userId);
      if (charge) return this.toChargeDto(charge);
      throw new NotFoundException('Payment not found');
    }
    if (payment.order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can confirm payment');
    }

    if (!this.isSettled(payment.status)) {
      const verified = await this.psp.verify(reference);
      if (verified.status === 'success') {
        if (
          this.psp.name === 'paystack' &&
          verified.amountKobo !== payment.amountKobo
        ) {
          throw new ConflictException(
            'Paystack amount does not match this payment',
          );
        }
        await this.markPaymentSuccess(payment, { verify: verified });
      } else if (verified.status === 'failed') {
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
    }

    const fresh = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const payload = fresh.providerPayload as { checkoutUrl?: string } | null;
    return this.toDto(fresh, payload?.checkoutUrl);
  }

  async handleWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
    payload: unknown,
  ): Promise<{ ok: boolean; orderId?: string }> {
    if (!signature || !this.psp.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const event = (payload as { event?: unknown } | null)?.event;
    if (typeof event === 'string' && event.startsWith('transfer.')) {
      return this.applyTransferWebhook(payload);
    }
    if (typeof event === 'string' && event.startsWith('refund.')) {
      const data =
        (payload as {
          data?: {
            id?: number | string;
            transaction_reference?: string;
            transaction?: { reference?: string };
            amount?: number | string;
          };
        }).data ?? {};
      const paymentReference = (
        data.transaction_reference ?? data.transaction?.reference ?? ''
      ).trim();
      if (!paymentReference) {
        this.logger.warn(`${event} without a transaction reference`);
        return { ok: false };
      }
      const amount = Number(data.amount);
      return this.orders.applyRefundWebhook({
        paymentReference,
        event,
        providerRef: data.id != null ? String(data.id) : null,
        amountKobo: Number.isFinite(amount) ? amount : null,
      });
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

  /** Paystack transfer events settle the seller payout. They are not card charges. */
  private async applyTransferWebhook(
    payload: unknown,
  ): Promise<{ ok: boolean; orderId?: string }> {
    const body = payload as {
      event?: string;
      data?: { reference?: string; status?: string; reason?: string };
    };
    const reference = body.data?.reference?.trim() ?? '';
    if (!reference) {
      this.logger.warn('Transfer webhook missing reference');
      return { ok: false };
    }
    const payout = await this.prisma.payout.findFirst({
      where: { pspReference: reference },
      include: { order: { select: { id: true, sellerId: true } } },
    });
    if (!payout) {
      this.logger.warn(`Unknown transfer reference ${reference}`);
      return { ok: false };
    }
    const event = body.event ?? '';
    const failed =
      event === 'transfer.failed' || event === 'transfer.reversed';
    const paid = event === 'transfer.success';
    if (!failed && !paid) {
      return { ok: true, orderId: payout.orderId };
    }
    if (paid) {
      if (payout.status !== 'PAID') {
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: { status: 'PAID', failureReason: null },
        });
      }
      return { ok: true, orderId: payout.orderId };
    }
    if (payout.status !== 'FAILED') {
      const reason =
        body.data?.reason?.trim() ||
        (event === 'transfer.reversed'
          ? 'Paystack reversed the transfer'
          : 'Paystack could not complete the transfer');
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'FAILED', failureReason: reason },
      });
      try {
        await this.notifications.notify({
          userId: payout.order.sellerId,
          category: 'PAYMENT_RELEASED',
          title: 'Payout failed',
          body: 'The bank transfer did not complete. Retry it from the order.',
          deepLink: `reworth://orders/${payout.orderId}`,
          meta: { orderId: payout.orderId },
        });
      } catch (err) {
        this.logger.warn(
          `Payout failure notice failed: ${(err as Error).message}`,
        );
      }
    }
    return { ok: true, orderId: payout.orderId };
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
      // Boosts, featured slots and Seller Plus have no Payment row.
      // Activation re-verifies the charge with the PSP before switching on.
      const charge = await this.activateNonOrderCharge(parsed.reference);
      if (charge) return { ok: true };
      this.logger.warn(`Unknown payment reference ${parsed.reference}`);
      return { ok: false };
    }

    if (this.isSettled(payment.status)) {
      return { ok: true, orderId: payment.orderId };
    }

    if (parsed.status === 'success') {
      // The signature proves Paystack sent it; verify proves the amount.
      let verified: Awaited<ReturnType<PaymentProvider['verify']>> | undefined;
      if (this.psp.name === 'paystack') {
        verified = await this.psp.verify(payment.reference);
        if (verified.status !== 'success') {
          this.logger.warn(
            `Webhook said success but verify says ${verified.status} for ${payment.reference}`,
          );
          return { ok: true, orderId: payment.orderId };
        }
        if (verified.amountKobo !== payment.amountKobo) {
          await this.raiseFinanceAlert(
            'PAYMENT_AMOUNT_MISMATCH',
            `Paystack captured ${verified.amountKobo} kobo for ${payment.reference}; expected ${payment.amountKobo}. Order not funded.`,
            { paymentId: payment.id, orderId: payment.orderId, verified },
          );
          return { ok: true, orderId: payment.orderId };
        }
      }
      await this.markPaymentSuccess(payment, {
        webhook: parsed,
        ...(verified ? { verify: verified } : {}),
      });
      return { ok: true, orderId: payment.orderId };
    }

    if (parsed.status === 'failed') {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return { ok: true, orderId: payment.orderId };
    }

    return { ok: true, orderId: payment.orderId };
  }

  /** Boost, featured slot or Seller Plus charge. Null if the reference is none of those. */
  private async activateNonOrderCharge(
    reference: string,
    expectedOwnerId?: string,
  ): Promise<NonOrderChargeResult | null> {
    const purpose = nonOrderChargePurpose(reference);
    if (purpose === 'SELLER_PLUS') {
      return (
        (await this.subscriptions?.activateFromPayment(
          reference,
          expectedOwnerId,
        )) ?? null
      );
    }
    if (purpose === 'BOOST' || purpose === 'FEATURED') {
      return (
        (await this.promotions?.activateFromPayment(
          reference,
          expectedOwnerId,
        )) ?? null
      );
    }
    return null;
  }

  private toChargeDto(c: NonOrderChargeResult): NonOrderChargeDto {
    return {
      id: c.id,
      orderId: null,
      purpose: c.purpose,
      listingId: c.listingId,
      reference: c.reference,
      amountKobo: c.amountKobo,
      status: c.status,
    };
  }

  private isSettled(status: string): boolean {
    return (
      status === 'SUCCESS' ||
      status === 'RELEASED' ||
      status === 'REFUNDED' ||
      status === 'PARTIALLY_REFUNDED'
    );
  }

  /**
   * First writer wins. Webhook and the buyer return can arrive together.
   *
   * A payment can also succeed when its order cannot take it: the buyer paid
   * twice, or paid an old checkout after cancelling. That money is refunded
   * at once instead of being left captured with nothing to show for it.
   */
  private async markPaymentSuccess(
    payment: Payment,
    extra: Record<string, unknown>,
  ): Promise<void> {
    if (this.psp instanceof MockPsp || this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).simulateWebhookSuccess(payment.reference);
    }

    // FAILED is included: a checkout closed on our side can still be paid.
    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'SUCCESS',
        providerPayload: {
          ...(payment.providerPayload as object),
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) return;

    let fundingError: Error | null = null;
    try {
      await this.orders.markFunded(
        payment.orderId,
        payment.reference,
        payment.id,
      );
    } catch (err) {
      fundingError = err as Error;
    }
    const order = await this.prisma.order.findUnique({
      where: { id: payment.orderId },
      select: { paymentId: true, status: true },
    });
    const fundedByThis =
      !!order &&
      order.paymentId === payment.id &&
      !UNFUNDED_ORDER_STATUSES.has(order.status);
    if (fundingError && fundedByThis) {
      // Funded; a follow-up step (notice, courier booking) failed. Keep the money.
      this.logger.warn(
        `Order ${payment.orderId} funded by ${payment.reference} but a follow-up failed: ${fundingError.message}`,
      );
    }
    if (!fundedByThis) {
      const reason = fundingError
        ? `order_not_payable: ${fundingError.message}`
        : `duplicate_payment: order already funded by ${order?.paymentId ?? 'unknown'}`;
      this.logger.warn(
        `Payment ${payment.reference} cannot fund order ${payment.orderId} (${reason}); refunding`,
      );
      await this.refundCapturedPayment(payment, reason);
      return;
    }

    await this.recordOrderRevenue(payment.orderId, payment.reference);
    this.notifications.log('payment.success', {
      paymentId: payment.id,
      orderId: payment.orderId,
      reference: payment.reference,
    });
  }

  /**
   * Full refund of a captured payment that did not fund its order.
   * Idempotent per payment. If the PSP refuses, the payment is marked FAILED
   * (so escrow release can never pick it) and finance gets a critical alert
   * to refund it by hand.
   */
  private async refundCapturedPayment(
    payment: Payment,
    reason: string,
  ): Promise<void> {
    try {
      const fresh = await this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      await this.orders.refundPayment({
        payment: fresh,
        amountKobo: payment.amountKobo,
        reason,
        idempotencyKey: `auto-refund:${payment.id}`,
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `Auto-refund failed for ${payment.reference}: ${message}`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          providerPayload: {
            ...((payment.providerPayload as object | null) ?? {}),
            capturedButUnapplied: true,
            autoRefund: { reason, error: message },
          } as Prisma.InputJsonValue,
        },
      });
      await this.raiseFinanceAlert(
        'PAYMENT_REFUND_FAILED',
        `Captured ${payment.amountKobo} kobo on ${payment.reference} could not fund its order and the automatic refund failed. Refund it in Paystack.`,
        { paymentId: payment.id, orderId: payment.orderId, reason, error: message },
      );
      return;
    }

    this.notifications.log('payment.auto_refunded', {
      paymentId: payment.id,
      orderId: payment.orderId,
      reference: payment.reference,
      reason,
    });
    try {
      await this.notifications.notify({
        userId: payment.payerId,
        category: NotificationCategory.PAYMENT_RECEIVED,
        title: 'Payment refunded',
        body: reason.startsWith('duplicate_payment')
          ? 'This order was already paid, so your extra payment is being refunded to your card or bank.'
          : 'This order could no longer take your payment, so it is being refunded to your card or bank.',
        deepLink: `reworth://orders/${payment.orderId}`,
        meta: { orderId: payment.orderId, paymentReference: payment.reference },
      });
    } catch (err) {
      this.logger.warn(
        `Refund notice failed for ${payment.reference}: ${(err as Error).message}`,
      );
    }
  }

  private async raiseFinanceAlert(
    kind: string,
    message: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.financeAlert.create({
        data: {
          kind,
          severity: 'critical',
          message,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        `Finance alert ${kind} not saved: ${(err as Error).message} — ${message}`,
      );
    }
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
      payeeId: p.payeeId,
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
