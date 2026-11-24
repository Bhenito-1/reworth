import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { DISPUTES } from '../admin/admin-roles';
import { AuditService } from '../audit/audit.service';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStateMachine } from '../orders/order-state.machine';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { VehicleInspectionsService } from '../verticals/vehicle-inspections.service';
import {
  DisputeEvidenceDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  SellerResponseDto,
} from './dto/disputes.dto';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    // Kept for DI stability; refunds now go through OrdersService.refundPayment.
    @Inject(PAYMENT_PROVIDER) _psp: PaymentProvider,
    @Optional()
    private readonly inspections?: VehicleInspectionsService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  async open(
    orderId: string,
    openerId: string,
    dto: OpenDisputeDto,
  ) {
    const order = await this.orders.requireOrder(orderId);
    if (order.buyerId !== openerId) {
      throw new ForbiddenException('Only the buyer can open a dispute');
    }
    if (!['RECEIVED', 'COMPLETED'].includes(order.status)) {
      throw new ConflictException(
        'Dispute only allowed after RECEIVED or COMPLETED',
      );
    }
    if (
      order.coverageEndsAt &&
      order.coverageEndsAt.getTime() < Date.now()
    ) {
      throw new ConflictException('Buyer protection coverage window has ended');
    }

    const existing = await this.prisma.dispute.findFirst({
      where: {
        orderId,
        status: { not: 'RESOLVED' },
      },
    });
    if (existing) {
      throw new ConflictException('An open dispute already exists');
    }

    // Race with confirm/complete: claim DISPUTE_HOLD
    OrderStateMachine.assertTransition(order.status, 'DISPUTE_HOLD');
    const sellerRespondBy = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // Attach latest vehicle inspection id on dispute evidence context when present.
    const inspectionId =
      (await this.inspections?.latestInspectionIdForListing(order.listingId)) ??
      null;

    const dispute = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: ['RECEIVED', 'COMPLETED'] },
        },
        data: { status: 'DISPUTE_HOLD' },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Order status changed; cannot open dispute',
        );
      }

      const inspectionNote = inspectionId
        ? `\n[inspectionId=${inspectionId}]`
        : '';

      const d = await tx.dispute.create({
        data: {
          orderId,
          openerId,
          reason: dto.reason,
          detail: `${dto.detail ?? ''}${inspectionNote}`.trim() || null,
          status: 'AWAITING_SELLER',
          sellerRespondBy,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'DISPUTE_OPENED',
          actorUserId: openerId,
          payload: {
            disputeId: d.id,
            reason: dto.reason,
            inspectionId,
          },
        },
      });

      return d;
    });

    await this.alerts?.notify({
      roles: DISPUTES,
      kind: 'DISPUTE',
      title: 'Dispute opened',
      body: `A buyer opened a dispute (${dto.reason}).`,
      href: '/disputes',
      entityType: 'Dispute',
      entityId: dispute.id,
    });

    this.notifications.log('dispute.opened', {
      disputeId: dispute.id,
      orderId,
      sellerId: order.sellerId,
    });
    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.DISPUTE_UPDATE,
      title: 'Dispute opened',
      body: 'A buyer opened a dispute on an order. Please respond within 72 hours.',
      deepLink: `reworth://disputes/${dispute.id}`,
      meta: { orderId, disputeId: dispute.id },
    });

    return dispute;
  }

  async getById(disputeId: string, userId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        evidence: { orderBy: { createdAt: 'asc' } },
        order: true,
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const isParticipant =
      dispute.openerId === userId ||
      dispute.order.buyerId === userId ||
      dispute.order.sellerId === userId;
    // Admins checked at controller via RolesGuard for admin routes;
    // for GET /disputes/:id allow participants only (admin uses same if needed)
    if (!isParticipant) {
      // Allow if user has admin roles — checked loosely via roles on AuthUser
      // Controllers pass through; here we only enforce participant for non-admin paths
      throw new ForbiddenException('Not a dispute participant');
    }

    return dispute;
  }

  async getByIdAdmin(disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        evidence: { orderBy: { createdAt: 'asc' } },
        order: true,
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async addEvidence(
    disputeId: string,
    uploaderId: string,
    dto: DisputeEvidenceDto,
  ) {
    if (!dto.text && !dto.imageKey) {
      throw new BadRequestException('Provide text and/or imageKey');
    }
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true, evidence: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status === 'RESOLVED') {
      throw new ConflictException('Dispute is resolved');
    }
    const isParticipant =
      dispute.openerId === uploaderId ||
      dispute.order.sellerId === uploaderId ||
      dispute.order.buyerId === uploaderId;
    if (!isParticipant) {
      throw new ForbiddenException('Not a dispute participant');
    }
    if (dispute.evidence.length >= 10) {
      throw new ConflictException('Maximum 10 evidence items');
    }

    return this.prisma.disputeEvidence.create({
      data: {
        disputeId,
        uploaderId,
        text: dto.text ?? null,
        imageKey: dto.imageKey ?? null,
      },
    });
  }

  async sellerRespond(
    disputeId: string,
    sellerId: string,
    dto: SellerResponseDto,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.order.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can respond');
    }
    if (
      dispute.status !== 'AWAITING_SELLER' &&
      dispute.status !== 'OPENED'
    ) {
      throw new ConflictException(`Dispute is ${dispute.status}`);
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        sellerResponse: dto.text,
        status: 'AWAITING_ADMIN',
      },
    });

    this.notifications.log('dispute.seller_responded', {
      disputeId,
      orderId: dispute.orderId,
    });

    return updated;
  }

  async resolve(
    disputeId: string,
    adminUserId: string,
    dto: ResolveDisputeDto,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status === 'RESOLVED') {
      throw new ConflictException('Dispute already resolved');
    }

    const order = dispute.order;
    const resolution = dto.resolution;
    const moneyBack = resolution !== 'RELEASE_TO_SELLER';

    // Payouts wait for buyer protection to end, so a dispute normally finds
    // the money still held. If the seller was paid anyway (orders completed
    // before payouts were held), escrow cannot fund a refund.
    if (moneyBack && (await this.orders.sellerPaidOut(order.id))) {
      throw new ConflictException(
        'The seller has already been paid for this order, so ReWorth cannot refund it from escrow. Resolve it as RELEASE_TO_SELLER and settle the refund off-platform.',
      );
    }

    let outcome: Record<string, unknown> = {};

    if (resolution === 'CANCEL') {
      const { owed } = await this.orders.cancelAfterDispute(
        order.id,
        adminUserId,
        dto.note ?? null,
      );
      outcome = { refundedKobo: owed, orderStatus: 'CANCELLED' };
    } else if (resolution === 'RELEASE_TO_SELLER') {
      await this.orders.releaseEscrow(order.id, adminUserId, 'dispute_release');
      outcome = { orderStatus: 'COMPLETED' };
    } else {
      if (
        resolution === 'PARTIAL_REFUND' &&
        (!dto.amountKobo || dto.amountKobo <= 0)
      ) {
        throw new BadRequestException('amountKobo required for partial refund');
      }
      const payment = await this.orders.fundingPayment(order, [
        'SUCCESS',
        'PARTIALLY_REFUNDED',
      ]);
      if (!payment) {
        throw new ConflictException('No payment found for dispute resolution');
      }
      // What the payer can still get back: the charge, less earlier refunds.
      // For swaps the charge is the delivery + swap fee, not order.totalKobo.
      const idemKey = `refund:${disputeId}:${resolution}`;
      const existingRefund = await this.prisma.refund.findUnique({
        where: { idempotencyKey: idemKey },
      });
      const earlier = await this.prisma.refund.findMany({
        where: { paymentId: payment.id, status: { not: 'FAILED' } },
        select: { amountKobo: true, idempotencyKey: true },
      });
      const refundedSoFar = earlier
        .filter((r) => r.idempotencyKey !== idemKey)
        .reduce((sum, r) => sum + r.amountKobo, 0);
      const refundable = payment.amountKobo - refundedSoFar;
      const amountKobo = existingRefund
        ? existingRefund.amountKobo
        : resolution === 'FULL_REFUND'
          ? refundable
          : (dto.amountKobo ?? 0);
      if (amountKobo <= 0) {
        throw new ConflictException('Nothing left to refund on this payment');
      }
      if (amountKobo > refundable) {
        throw new BadRequestException('Refund exceeds order total');
      }

      await this.orders.refundPayment({
        payment,
        amountKobo,
        reason: dto.note ?? resolution,
        idempotencyKey: idemKey,
      });

      // Partial: the refund comes out of the seller's share; ReWorth keeps
      // its fees. Whatever is left of the item price goes to the seller now.
      const sellerShareKobo =
        resolution === 'PARTIAL_REFUND'
          ? Math.max(0, order.amountKobo - (refundedSoFar + amountKobo))
          : 0;
      outcome = { refundedKobo: amountKobo, sellerShareKobo };

      if (sellerShareKobo > 0) {
        try {
          await this.orders.releaseEscrow(
            order.id,
            adminUserId,
            'dispute_partial_refund',
          );
          outcome.orderStatus = 'COMPLETED';
        } catch (err) {
          // e.g. no verified bank account. Park it as RECEIVED with cover
          // already over, so the payout job keeps retrying.
          this.logger.warn(
            `Partial-refund payout deferred for ${order.id}: ${(err as Error).message}`,
          );
          await this.prisma.$transaction(async (tx) => {
            await tx.order.updateMany({
              where: { id: order.id, status: 'DISPUTE_HOLD' },
              data: { status: 'RECEIVED', coverageEndsAt: new Date() },
            });
            await tx.orderEvent.create({
              data: {
                orderId: order.id,
                type: 'PAYOUT_DEFERRED',
                actorUserId: adminUserId,
                payload: {
                  disputeId,
                  sellerShareKobo,
                  error: (err as Error).message,
                },
              },
            });
          });
          outcome.orderStatus = 'RECEIVED';
          outcome.payoutDeferred = true;
        }
      } else {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.updateMany({
            where: { id: order.id, status: 'DISPUTE_HOLD' },
            data: { status: 'REFUND_ISSUED' },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'REFUND_ISSUED',
              actorUserId: adminUserId,
              payload: { disputeId, amountKobo, resolution },
            },
          });
        });
        outcome.orderStatus = 'REFUND_ISSUED';
      }
    }

    const before = {
      status: dispute.status,
      resolution: dispute.resolution,
    };
    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED',
        resolution,
        resolutionNote: dto.note ?? null,
        resolvedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: adminUserId,
      action: 'DISPUTE_RESOLVED',
      entityType: 'Dispute',
      entityId: disputeId,
      beforeJson: before,
      afterJson: {
        status: 'RESOLVED',
        resolution,
        resolutionNote: dto.note ?? null,
        amountKobo: dto.amountKobo ?? null,
        orderId: order.id,
        ...outcome,
      },
    });

    this.notifications.log('dispute.resolved', {
      disputeId,
      resolution,
      orderId: order.id,
    });
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.DISPUTE_UPDATE,
      title: 'Dispute resolved',
      body: buyerResolutionText(resolution, outcome),
      deepLink: `reworth://disputes/${disputeId}`,
      meta: { orderId: order.id, disputeId, resolution },
    });
    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.DISPUTE_UPDATE,
      title: 'Dispute resolved',
      body: sellerResolutionText(resolution, outcome),
      deepLink: `reworth://disputes/${disputeId}`,
      meta: { orderId: order.id, disputeId, resolution },
    });

    return updated;
  }

  async expireSellerResponses(now = new Date()): Promise<number> {
    const due = await this.prisma.dispute.findMany({
      where: {
        status: 'AWAITING_SELLER',
        sellerRespondBy: { lte: now },
      },
    });

    let count = 0;
    for (const d of due) {
      await this.prisma.dispute.update({
        where: { id: d.id },
        data: { status: 'AWAITING_ADMIN' },
      });
      this.notifications.log('dispute.seller_response_expired', {
        disputeId: d.id,
        orderId: d.orderId,
      });
      count++;
    }
    if (count > 0) {
      this.logger.log(`Escalated ${count} dispute(s) to AWAITING_ADMIN`);
    }
    return count;
  }
}

function naira(kobo: unknown): string {
  const n = typeof kobo === 'number' ? kobo : 0;
  return `₦${(n / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

function buyerResolutionText(
  resolution: string,
  outcome: Record<string, unknown>,
): string {
  switch (resolution) {
    case 'FULL_REFUND':
    case 'CANCEL':
      return `You are getting ${naira(outcome.refundedKobo)} back to the card or bank you paid with.`;
    case 'PARTIAL_REFUND':
      return `You are getting ${naira(outcome.refundedKobo)} back to the card or bank you paid with.`;
    default:
      return 'The payment has been released to the seller.';
  }
}

function sellerResolutionText(
  resolution: string,
  outcome: Record<string, unknown>,
): string {
  switch (resolution) {
    case 'FULL_REFUND':
      return 'The buyer was refunded in full. No payout is due on this order.';
    case 'CANCEL':
      return 'The order was cancelled and the buyer refunded. Your units are back on sale.';
    case 'PARTIAL_REFUND':
      return Number(outcome.sellerShareKobo) > 0
        ? `The buyer was partly refunded. Your payout of ${naira(outcome.sellerShareKobo)} ${outcome.payoutDeferred ? 'is waiting for a verified bank account' : 'is on its way'}.`
        : 'The buyer was refunded the full item price. No payout is due on this order.';
    default:
      return 'The dispute was resolved in your favour. Your payout is on its way.';
  }
}
