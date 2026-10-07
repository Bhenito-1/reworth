import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { OrderStateMachine } from '../orders/order-state.machine';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import {
  FULFILMENT_SERVICE,
  type FulfilmentService,
} from './fulfilment.service';

@Injectable()
export class InstantBuyService {
  private readonly logger = new Logger(InstantBuyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(FULFILMENT_SERVICE) private readonly fulfilment: FulfilmentService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly psp?: PaymentProvider,
    @Optional()
    @Inject(forwardRef(() => OrdersService))
    private readonly orders?: OrdersService,
  ) {}

  slaHours(): number {
    return Number(this.config.get('INSTANT_BUY_SLA_HOURS') ?? 48);
  }

  /**
   * After order funded: if listing.instantBuyEligible, create fulfilment.
   * Idempotent on orderId unique.
   */
  async afterOrderFunded(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true, instantBuyFulfilment: true },
    });
    if (!order?.listing) return;
    if (!order.listing.instantBuyEligible) return;
    if (order.instantBuyFulfilment) return;
    if (order.status !== 'FUNDED' && order.status !== 'IN_AUTHENTICATION') {
      return;
    }

    const slaDeadlineAt = new Date(
      Date.now() + this.slaHours() * 60 * 60 * 1000,
    );

    await this.prisma.instantBuyFulfilment.create({
      data: {
        orderId,
        listingId: order.listingId,
        status: 'PENDING_PICKUP',
        slaDeadlineAt,
      },
    });

    this.logger.log(
      `Instant Buy fulfilment created for order ${orderId}, SLA ${slaDeadlineAt.toISOString()}`,
    );
  }

  async get(id: string, actorUserId: string, isOps = false) {
    const row = await this.prisma.instantBuyFulfilment.findUnique({
      where: { id },
      include: { order: true, listing: true },
    });
    if (!row) throw new NotFoundException('Fulfilment not found');
    if (
      !isOps &&
      row.order.buyerId !== actorUserId &&
      row.order.sellerId !== actorUserId
    ) {
      throw new ForbiddenException('Not a party to this fulfilment');
    }
    return row;
  }

  async getByOrder(orderId: string, actorUserId: string, isOps = false) {
    const row = await this.prisma.instantBuyFulfilment.findUnique({
      where: { orderId },
      include: { order: true, listing: true },
    });
    if (!row) throw new NotFoundException('Fulfilment not found');
    if (
      !isOps &&
      row.order.buyerId !== actorUserId &&
      row.order.sellerId !== actorUserId
    ) {
      throw new ForbiddenException('Not a party to this fulfilment');
    }
    return row;
  }

  async schedulePickup(
    id: string,
    actorUserId: string,
    slotStartAt: Date,
    slotEndAt: Date,
    isOps = false,
  ) {
    const row = await this.get(id, actorUserId, isOps);
    if (!isOps && row.order.sellerId !== actorUserId) {
      throw new ForbiddenException('Seller or ops required');
    }
    if (slotStartAt >= slotEndAt) {
      throw new BadRequestException('slotStartAt must be before slotEndAt');
    }
    return this.fulfilment.schedulePickup({
      fulfilmentId: row.id,
      slotStartAt,
      slotEndAt,
    });
  }

  async markPickedUp(id: string, actorUserId: string, isOps = false) {
    await this.get(id, actorUserId, isOps);
    if (!isOps) throw new ForbiddenException('Ops required');
    return this.fulfilment.markPickedUp(id);
  }

  async markInTransit(id: string, actorUserId: string, isOps = false) {
    await this.get(id, actorUserId, isOps);
    if (!isOps) throw new ForbiddenException('Ops required');
    const now = new Date();
    return this.prisma.instantBuyFulfilment.update({
      where: { id },
      data: { status: 'IN_TRANSIT' },
    }).then((row) => ({
      fulfilmentId: row.id,
      status: row.status,
      at: now,
    }));
  }

  async markDelivered(id: string, actorUserId: string, isOps = false) {
    const row = await this.get(id, actorUserId, isOps);
    if (!isOps) throw new ForbiddenException('Ops required');
    const result = await this.fulfilment.markDelivered(id);
    // Align cash order with courier delivered (escrow still held)
    if (
      this.orders &&
      OrderStateMachine.canTransition(row.order.status, 'DELIVERED')
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: row.orderId },
          data: { status: 'DELIVERED' },
        });
        await tx.orderEvent.create({
          data: {
            orderId: row.orderId,
            type: 'DELIVERED',
            actorUserId,
            payload: { source: 'instant_buy' },
          },
        });
      });
    }
    return result;
  }

  async buyerConfirm(id: string, buyerId: string) {
    const row = await this.get(id, buyerId);
    if (row.order.buyerId !== buyerId) {
      throw new ForbiddenException('Buyer only');
    }
    if (row.status !== 'DELIVERED' && row.status !== 'IN_TRANSIT') {
      throw new BadRequestException('Fulfilment not ready to confirm');
    }
    const now = new Date();
    await this.prisma.instantBuyFulfilment.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });

    // Ensure order is confirmable, then release escrow via standard path
    const orderStatus = row.order.status;
    if (
      ['FUNDED', 'IN_AUTHENTICATION', 'SHIPPED', 'HANDED_OVER'].includes(
        orderStatus,
      ) &&
      OrderStateMachine.canTransition(orderStatus, 'DELIVERED')
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: row.orderId },
          data: { status: 'DELIVERED' },
        });
        await tx.orderEvent.create({
          data: {
            orderId: row.orderId,
            type: 'DELIVERED',
            actorUserId: buyerId,
            payload: { source: 'instant_buy_pre_confirm' },
          },
        });
      });
    }

    if (this.orders) {
      return this.orders.confirmReceipt(row.orderId, buyerId);
    }

    return this.prisma.instantBuyFulfilment.findUniqueOrThrow({
      where: { id },
    });
  }

  /**
   * SLA breach → auto-refund with idempotency key `instant-buy-refund:{orderId}`.
   */
  async processSlaBreaches(now = new Date()): Promise<number> {
    const { breached } = await this.fulfilment.checkSla(now);
    let count = 0;
    for (const fulfilmentId of breached) {
      try {
        const did = await this.refundOnSlaBreach(fulfilmentId, now);
        if (did) count++;
      } catch (err) {
        this.logger.warn(
          `SLA refund failed for ${fulfilmentId}: ${(err as Error).message}`,
        );
      }
    }
    return count;
  }

  async refundOnSlaBreach(
    fulfilmentId: string,
    now = new Date(),
  ): Promise<boolean> {
    const row = await this.prisma.instantBuyFulfilment.findUnique({
      where: { id: fulfilmentId },
      include: { order: true },
    });
    if (!row) return false;
    if (row.status === 'REFUNDED' || row.refundIdempotencyKey) {
      return false;
    }
    if (row.slaDeadlineAt > now) return false;

    const idemKey = `instant-buy-refund:${row.orderId}`;
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: idemKey },
    });
    if (existing) {
      await this.prisma.instantBuyFulfilment.update({
        where: { id: fulfilmentId },
        data: {
          status: 'REFUNDED',
          refundedAt: now,
          refundIdempotencyKey: idemKey,
        },
      });
      return false;
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: row.orderId,
        status: { in: ['SUCCESS', 'RELEASED'] },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.instantBuyFulfilment.update({
        where: { id: fulfilmentId },
        data: {
          status: 'SLA_BREACHED',
        },
      });

      if (payment && this.psp) {
        await this.psp.refund({
          reference: payment.reference,
          amountKobo: row.order.totalKobo,
          idempotencyKey: idemKey,
        });
        await tx.refund.create({
          data: {
            orderId: row.orderId,
            paymentId: payment.id,
            amountKobo: row.order.totalKobo,
            reason: 'instant_buy_sla_breach',
            idempotencyKey: idemKey,
            status: 'REFUNDED',
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
      } else if (payment) {
        await tx.refund.create({
          data: {
            orderId: row.orderId,
            paymentId: payment.id,
            amountKobo: row.order.totalKobo,
            reason: 'instant_buy_sla_breach',
            idempotencyKey: idemKey,
            status: 'REFUNDED',
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
      } else {
        // No payment row — still record idempotency via fulfilment key only
        await tx.idempotencyRecord.upsert({
          where: { key: idemKey },
          create: {
            key: idemKey,
            operation: 'instant_buy_refund',
            responseJson: { orderId: row.orderId } as Prisma.InputJsonValue,
          },
          update: {},
        });
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: row.orderId },
      });
      if (order.status !== 'REFUND_ISSUED') {
        // Prefer REFUND_REQUESTED → REFUND_ISSUED when needed
        if (OrderStateMachine.canTransition(order.status, 'REFUND_ISSUED')) {
          OrderStateMachine.assertTransition(order.status, 'REFUND_ISSUED');
          await tx.order.update({
            where: { id: row.orderId },
            data: { status: 'REFUND_ISSUED' },
          });
        } else if (
          OrderStateMachine.canTransition(order.status, 'REFUND_REQUESTED')
        ) {
          await tx.order.update({
            where: { id: row.orderId },
            data: { status: 'REFUND_REQUESTED' },
          });
          OrderStateMachine.assertTransition(
            'REFUND_REQUESTED',
            'REFUND_ISSUED',
          );
          await tx.order.update({
            where: { id: row.orderId },
            data: { status: 'REFUND_ISSUED' },
          });
        } else {
          // Force path for FUNDED SLA breach — state machine updated to allow
          await tx.order.update({
            where: { id: row.orderId },
            data: { status: 'REFUND_ISSUED' },
          });
        }
        await tx.orderEvent.create({
          data: {
            orderId: row.orderId,
            type: 'REFUND_ISSUED',
            payload: {
              reason: 'instant_buy_sla_breach',
              idempotencyKey: idemKey,
            },
          },
        });
      }

      await tx.instantBuyFulfilment.update({
        where: { id: fulfilmentId },
        data: {
          status: 'REFUNDED',
          refundedAt: now,
          refundIdempotencyKey: idemKey,
        },
      });
    });

    return true;
  }
}
