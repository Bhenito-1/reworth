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
import {
  DeliveryShipmentStatus,
  FulfilmentMethod,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { SUPPORT } from '../admin/admin-roles';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStateMachine } from '../orders/order-state.machine';
import { PrismaService } from '../prisma/prisma.service';
import {
  DELIVERY_PROVIDER,
  type DeliveryProvider,
} from '../providers/delivery.provider';
import { computeOrderTotalKobo } from '../orders/order-fees';

const STATUS_ORDER: DeliveryShipmentStatus[] = [
  'QUOTED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

function statusRank(s: DeliveryShipmentStatus): number {
  if (s === 'FAILED') return 99;
  return STATUS_ORDER.indexOf(s);
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(DELIVERY_PROVIDER) private readonly provider: DeliveryProvider,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  async listMeetPoints(community?: string) {
    return this.prisma.meetPoint.findMany({
      where: {
        active: true,
        ...(community ? { community } : {}),
      },
      orderBy: [{ community: 'asc' }, { name: 'asc' }],
    });
  }

  async quote(
    orderId: string,
    userId: string,
    toLat: number,
    toLng: number,
  ) {
    const order = await this.requireParticipant(orderId, userId);
    if (order.fulfilmentMethod !== FulfilmentMethod.DELIVERY) {
      throw new BadRequestException('Order fulfilment is not DELIVERY');
    }
    if (
      order.status !== OrderStatus.CREATED &&
      order.status !== OrderStatus.PAYMENT_PENDING
    ) {
      throw new ConflictException('Quote only allowed before payment');
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
    });
    if (!listing) {
      throw new BadRequestException('Listing missing for delivery quote');
    }
    const fromLat = listing.geoLat ?? 6.5244;
    const fromLng = listing.geoLng ?? 3.3792;

    const quote = await this.provider.quote({
      fromLat,
      fromLng,
      toLat,
      toLng,
      city: listing.city,
    });

    const deliveryFeeKobo = quote.feeKobo;
    const totalKobo = computeOrderTotalKobo({
      amountKobo: order.amountKobo,
      protectionFeeKobo: order.protectionFeeKobo,
      deliveryFeeKobo,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: { deliveryFeeKobo, totalKobo },
      });

      const existing = await tx.deliveryShipment.findUnique({
        where: { orderId },
      });
      if (existing) {
        await tx.deliveryShipment.update({
          where: { id: existing.id },
          data: {
            quoteKobo: deliveryFeeKobo,
            distanceKm: quote.distanceKm,
            status: 'QUOTED',
            provider: quote.provider,
          },
        });
        await tx.deliveryEvent.create({
          data: {
            shipmentId: existing.id,
            status: 'QUOTED',
            payload: { toLat, toLng, ...quote },
          },
        });
      } else {
        const shipment = await tx.deliveryShipment.create({
          data: {
            orderId,
            provider: quote.provider,
            quoteKobo: deliveryFeeKobo,
            distanceKm: quote.distanceKm,
            status: 'QUOTED',
          },
        });
        await tx.deliveryEvent.create({
          data: {
            shipmentId: shipment.id,
            status: 'QUOTED',
            payload: { toLat, toLng, ...quote },
          },
        });
      }

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'DELIVERY_QUOTED',
          actorUserId: userId,
          payload: { deliveryFeeKobo, distanceKm: quote.distanceKm, toLat, toLng },
        },
      });

      return row;
    });

    return {
      orderId,
      feeKobo: deliveryFeeKobo,
      distanceKm: quote.distanceKm,
      provider: quote.provider,
      deliveryFeeKobo,
      totalKobo: updated.totalKobo,
    };
  }

  async setMeetPoint(orderId: string, userId: string, meetPointId: string) {
    const order = await this.requireParticipant(orderId, userId);
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can set meet point');
    }
    if (
      order.status !== OrderStatus.CREATED &&
      order.status !== OrderStatus.PAYMENT_PENDING &&
      order.status !== OrderStatus.FUNDED
    ) {
      throw new ConflictException('Cannot change meet point in current status');
    }

    const meetPoint = await this.prisma.meetPoint.findFirst({
      where: { id: meetPointId, active: true },
    });
    if (!meetPoint) throw new NotFoundException('Meet point not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: {
          meetPointId,
          fulfilmentMethod: FulfilmentMethod.MEET_POINT,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'MEET_POINT_SET',
          actorUserId: userId,
          payload: { meetPointId, name: meetPoint.name },
        },
      });
      return row;
    });

    return {
      orderId: updated.id,
      meetPoint,
      fulfilmentMethod: updated.fulfilmentMethod,
    };
  }

  async discloseAddress(orderId: string, sellerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true, addressDisclosure: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can disclose address');
    }
    if (
      order.status === OrderStatus.CREATED ||
      order.status === OrderStatus.PAYMENT_PENDING ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new ConflictException('Order must be FUNDED or later');
    }
    if (order.addressDisclosure) {
      throw new ConflictException('Address already disclosed');
    }

    const snapshot = order.listing.addressPrivate;
    if (!snapshot) {
      throw new BadRequestException('Listing has no private address');
    }

    const disclosure = await this.prisma.addressDisclosure.create({
      data: {
        orderId,
        disclosedById: sellerId,
        addressSnapshot: snapshot,
      },
    });

    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.DELIVERY_UPDATE,
      title: 'Seller shared pickup address',
      body: 'The seller disclosed the meetup/pickup address for your order.',
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, disclosureId: disclosure.id },
    });

    return {
      id: disclosure.id,
      orderId: disclosure.orderId,
      createdAt: disclosure.createdAt,
      // Only returned to seller at disclose time; buyer sees via dedicated get
      addressSnapshot: disclosure.addressSnapshot,
    };
  }

  async getShipment(orderId: string, userId: string) {
    await this.requireParticipant(orderId, userId);
    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  /**
   * After payment funds a DELIVERY order, assign the courier.
   */
  async assignAfterFunding(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { deliveryShipment: true, listing: true },
    });
    if (!order || order.fulfilmentMethod !== FulfilmentMethod.DELIVERY) return;
    if (!order.deliveryShipment) {
      this.logger.warn(`No shipment quote for funded delivery order ${orderId}`);
      return;
    }
    if (order.deliveryShipment.status !== 'QUOTED') return;

    const listing = order.listing;
    const lastQuote = await this.prisma.deliveryEvent.findFirst({
      where: { shipmentId: order.deliveryShipment.id, status: 'QUOTED' },
      orderBy: { createdAt: 'desc' },
    });
    const payload = (lastQuote?.payload ?? {}) as {
      toLat?: number;
      toLng?: number;
    };
    const toLat = payload.toLat ?? listing.geoLat ?? 0;
    const toLng = payload.toLng ?? listing.geoLng ?? 0;

    const created = await this.provider.createShipment({
      orderId,
      quoteKobo: order.deliveryShipment.quoteKobo,
      distanceKm: order.deliveryShipment.distanceKm ?? undefined,
      fromLat: listing.geoLat ?? 0,
      fromLng: listing.geoLng ?? 0,
      toLat,
      toLng,
    });

    await this.applyStatus({
      orderId,
      status: 'ASSIGNED',
      providerRef: created.providerRef,
      etaFrom: created.etaFrom,
      etaTo: created.etaTo,
      source: 'SYSTEM',
    });

    await this.tryAutoAssignDriver(orderId);
  }

  /**
   * Ops / system: bind an active delivery driver to a shipment.
   */
  async assignDriver(orderId: string, driverUserId: string) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverUserId },
      select: { id: true, isDeliveryDriver: true, status: true, deletedAt: true },
    });
    if (
      !driver ||
      driver.deletedAt ||
      driver.status !== 'ACTIVE' ||
      !driver.isDeliveryDriver
    ) {
      throw new BadRequestException('User is not an active delivery driver');
    }

    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    return this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: { assignedDriverId: driverUserId },
      include: {
        assignedDriver: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
  }

  /** Prefer an idle active driver when none assigned yet. */
  async tryAutoAssignDriver(orderId: string): Promise<void> {
    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    if (!shipment || shipment.assignedDriverId) return;

    const driver = await this.prisma.user.findFirst({
      where: {
        isDeliveryDriver: true,
        status: 'ACTIVE',
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!driver) return;

    await this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: { assignedDriverId: driver.id },
    });
  }

  async listDriverAssignments(driverUserId: string) {
    const rows = await this.prisma.deliveryShipment.findMany({
      where: {
        assignedDriverId: driverUserId,
        status: {
          in: [
            'ASSIGNED',
            'PICKED_UP',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
          ],
        },
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            fulfilmentMethod: true,
            listing: { select: { title: true, community: true, city: true } },
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((s) => ({
      orderId: s.orderId,
      shipmentId: s.id,
      status: s.status,
      providerRef: s.providerRef,
      etaFrom: s.etaFrom,
      etaTo: s.etaTo,
      listingTitle: s.order.listing?.title ?? null,
      community: s.order.listing?.community ?? null,
      city: s.order.listing?.city ?? null,
      orderStatus: s.order.status,
      recentEvents: s.events,
    }));
  }

  /**
   * Driver milestone submit — authz = assigned driver only.
   * Handles duplicates (idempotency), delayed (occurredAt / stale), and FAILED.
   */
  async submitDriverMilestone(
    driverUserId: string,
    orderId: string,
    dto: {
      status: DeliveryShipmentStatus;
      failureReason?: string;
      occurredAt?: string;
      note?: string;
    },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header required');
    }
    const key = idempotencyKey.trim().slice(0, 128);

    const existingIdem = await this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });
    if (existingIdem?.operation === 'driver.milestone') {
      return existingIdem.responseJson as Record<string, unknown>;
    }

    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.assignedDriverId !== driverUserId) {
      throw new ForbiddenException('Not assigned to this delivery');
    }

    const allowed: DeliveryShipmentStatus[] = [
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Drivers cannot set status ${dto.status}`);
    }
    if (dto.status === 'FAILED' && !dto.failureReason?.trim()) {
      throw new BadRequestException('failureReason required when status is FAILED');
    }

    let occurredAt: Date | undefined;
    if (dto.occurredAt) {
      occurredAt = new Date(dto.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new BadRequestException('occurredAt must be a valid ISO date');
      }
      // Reject far-future clocks (clock skew > 2h)
      if (occurredAt.getTime() > Date.now() + 2 * 60 * 60 * 1000) {
        throw new BadRequestException('occurredAt is too far in the future');
      }
    }

    const current = shipment.status;
    const isRegression =
      dto.status !== 'FAILED' &&
      current !== 'FAILED' &&
      statusRank(dto.status) < statusRank(current);

    // Delayed / stale: record audit event, do not regress live status
    if (isRegression) {
      await this.prisma.deliveryEvent.create({
        data: {
          shipmentId: shipment.id,
          status: dto.status,
          source: 'DRIVER',
          occurredAt: occurredAt ?? null,
          idempotencyKey: key,
          payload: {
            accepted: false,
            reason: 'stale_or_delayed',
            currentStatus: current,
            note: dto.note,
            failureReason: dto.failureReason,
          } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.idempotencyRecord.upsert({
        where: { key },
        create: {
          key,
          operation: 'driver.milestone',
          responseJson: {
            accepted: false,
            reason: 'stale_or_delayed',
            currentStatus: current,
            shipmentId: shipment.id,
            orderId,
          } as Prisma.InputJsonValue,
        },
        update: {},
      });
      return {
        accepted: false,
        reason: 'stale_or_delayed',
        currentStatus: current,
        shipmentId: shipment.id,
        orderId,
      };
    }

    try {
      await this.provider.updateStatus({
        providerRef: shipment.providerRef ?? shipment.id,
        status: dto.status as Exclude<DeliveryShipmentStatus, 'QUOTED'>,
        failureReason: dto.failureReason,
      });
    } catch (err) {
      this.logger.warn(
        `Provider updateStatus failed for ${orderId}: ${(err as Error).message}`,
      );
    }

    const updated = await this.applyStatus({
      orderId,
      status: dto.status,
      failureReason: dto.failureReason,
      source: 'DRIVER',
      occurredAt,
      idempotencyKey: key,
      note: dto.note,
      actorUserId: driverUserId,
    });

    const response = {
      accepted: true,
      orderId,
      shipmentId: updated.id,
      status: updated.status,
      duplicate: current === dto.status,
    };
    await this.prisma.idempotencyRecord.upsert({
      where: { key },
      create: {
        key,
        operation: 'driver.milestone',
        responseJson: response as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    return response;
  }

  async handleWebhook(dto: {
    orderId?: string;
    providerRef?: string;
    status: string;
    failureReason?: string;
  }) {
    if (!dto.orderId && !dto.providerRef) {
      throw new BadRequestException('orderId or providerRef required');
    }

    const shipment = await this.prisma.deliveryShipment.findFirst({
      where: dto.orderId
        ? { orderId: dto.orderId }
        : { providerRef: dto.providerRef },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const status = dto.status as DeliveryShipmentStatus;
    if (!Object.values(DeliveryShipmentStatus).includes(status)) {
      throw new BadRequestException(`Invalid status ${dto.status}`);
    }

    await this.provider.updateStatus({
      providerRef: shipment.providerRef ?? dto.providerRef ?? shipment.id,
      status: status as Exclude<DeliveryShipmentStatus, 'QUOTED'>,
      failureReason: dto.failureReason,
    });

    return this.applyStatus({
      orderId: shipment.orderId,
      status,
      providerRef: dto.providerRef ?? shipment.providerRef ?? undefined,
      failureReason: dto.failureReason,
      source: 'WEBHOOK',
    });
  }

  /**
   * Advance shipment status (used by webhook + driver + demo script).
   */
  async applyStatus(opts: {
    orderId: string;
    status: DeliveryShipmentStatus;
    providerRef?: string;
    failureReason?: string;
    etaFrom?: Date;
    etaTo?: Date;
    source?: string;
    occurredAt?: Date;
    idempotencyKey?: string;
    note?: string;
    actorUserId?: string;
  }) {
    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId: opts.orderId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const current = shipment.status;
    if (
      opts.status !== 'FAILED' &&
      current !== 'FAILED' &&
      statusRank(opts.status) < statusRank(current)
    ) {
      throw new ConflictException(
        `Cannot regress status from ${current} to ${opts.status}`,
      );
    }
    if (current === opts.status && opts.status !== 'FAILED') {
      return shipment;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.deliveryShipment.update({
        where: { id: shipment.id },
        data: {
          status: opts.status,
          providerRef: opts.providerRef ?? shipment.providerRef,
          failureReason: opts.failureReason ?? null,
          etaFrom: opts.etaFrom ?? shipment.etaFrom,
          etaTo: opts.etaTo ?? shipment.etaTo,
        },
      });
      await tx.deliveryEvent.create({
        data: {
          shipmentId: shipment.id,
          status: opts.status,
          source: opts.source ?? 'SYSTEM',
          occurredAt: opts.occurredAt ?? null,
          idempotencyKey: opts.idempotencyKey ?? null,
          payload: {
            failureReason: opts.failureReason,
            providerRef: opts.providerRef,
            note: opts.note,
            actorUserId: opts.actorUserId,
          } as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: opts.orderId },
    });

    await this.fanOutDeliveryUpdate(order.buyerId, order.sellerId, opts.orderId, opts.status);

    if (opts.status === 'FAILED') {
      const ticket = await this.prisma.supportTicket.create({
        data: {
          orderId: opts.orderId,
          userId: order.buyerId,
          subject: `Delivery failed: ${opts.failureReason ?? 'unknown'}`,
          status: 'OPEN',
        },
      });
      await this.alerts?.notify({
        roles: SUPPORT,
        kind: 'SUPPORT',
        title: 'Delivery failed',
        body: ticket.subject,
        href: '/support',
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    }

    // Sync escrow order lifecycle with courier progress
    await this.syncOrderFromDelivery(order, opts.status, shipment.id);

    return updated;
  }

  /**
   * Advance OrderStatus when delivery progresses (escrow still held until buyer confirms).
   */
  private async syncOrderFromDelivery(
    order: { id: string; status: OrderStatus },
    deliveryStatus: DeliveryShipmentStatus,
    shipmentId: string,
  ) {
    const shipSignal = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(
      deliveryStatus,
    );
    if (
      shipSignal &&
      (order.status === OrderStatus.FUNDED ||
        order.status === OrderStatus.IN_AUTHENTICATION)
    ) {
      if (OrderStateMachine.canTransition(order.status, 'SHIPPED')) {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'SHIPPED' },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'SHIPPED',
              payload: { deliveryStatus, shipmentId },
            },
          });
        });
      }
      return;
    }

    if (deliveryStatus === 'DELIVERED') {
      const from = order.status;
      // Re-read — may already be SHIPPED from earlier transition in same call chain
      const fresh = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      if (
        ['FUNDED', 'IN_AUTHENTICATION', 'SHIPPED', 'HANDED_OVER'].includes(
          fresh.status,
        ) &&
        OrderStateMachine.canTransition(fresh.status, 'DELIVERED')
      ) {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'DELIVERED' },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'DELIVERED',
              payload: { shipmentId, previousStatus: from },
            },
          });
        });
      }
    }
  }

  private async fanOutDeliveryUpdate(
    buyerId: string,
    sellerId: string,
    orderId: string,
    status: DeliveryShipmentStatus,
  ) {
    const title = `Delivery ${status.toLowerCase().replace(/_/g, ' ')}`;
    const body = `Your order delivery status is now ${status}.`;
    const deepLink = `reworth://orders/${orderId}`;
    const meta = { orderId, status };

    for (const userId of [buyerId, sellerId]) {
      await this.notifications.notify({
        userId,
        category: NotificationCategory.DELIVERY_UPDATE,
        title,
        body,
        deepLink,
        meta,
      });
    }
  }

  private async requireParticipant(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    return order;
  }
}
