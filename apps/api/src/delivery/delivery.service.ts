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
  BULKY_DELIVERY_RATES,
  computeDeliveryFeeKobo,
  DELIVERY_PROVIDER,
  isBulkyDeliveryCategory,
  type DeliveryProvider,
} from '../providers/delivery.provider';
import { computeOrderTotalKobo } from '../orders/order-fees';

const STATUS_ORDER: DeliveryShipmentStatus[] = [
  'QUOTED',
  'OFFERED',
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

function nextForward(
  current: DeliveryShipmentStatus,
): DeliveryShipmentStatus | null {
  const index = STATUS_ORDER.indexOf(current);
  if (index < 0 || index >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1] ?? null;
}

const DELIVERY_COPY: Record<
  string,
  { title: string; buyer: string; seller: string }
> = {
  QUOTED: {
    title: 'Delivery quoted',
    buyer: 'The fee is locked. Pay to offer this run to a rider.',
    seller: 'The buyer has a quote. Nothing is collected until they pay.',
  },
  OFFERED: {
    title: 'Rider offered',
    buyer: 'Your payment is protected. A rider has been offered this delivery.',
    seller: 'A rider has been asked to collect the item on the day you confirmed.',
  },
  ASSIGNED: {
    title: 'Rider accepted',
    buyer: 'Your rider accepted and will collect from the seller.',
    seller: 'The rider accepted. Have the item packed and easy to reach.',
  },
  PICKED_UP: {
    title: 'Collected from seller',
    buyer: 'The item is with the rider.',
    seller: 'Collected. Payout unlocks after the buyer confirms.',
  },
  IN_TRANSIT: {
    title: 'On the way',
    buyer: 'The rider is heading toward your area.',
    seller: 'The item is on the way to the buyer.',
  },
  OUT_FOR_DELIVERY: {
    title: 'Out for delivery',
    buyer: 'Be available to receive the item.',
    seller: 'The rider is delivering to the buyer.',
  },
  DELIVERED: {
    title: 'Delivered',
    buyer: 'Confirm the item looks right to release payment.',
    seller: 'Delivered. Waiting for the buyer to confirm.',
  },
  FAILED: {
    title: 'Delivery needs attention',
    buyer:
      'The delivery did not finish. You can ask for another attempt or open a dispute. Payment stays protected.',
    seller:
      'The delivery did not finish. Payment stays protected until this is resolved.',
  },
};

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `···${digits.slice(-4)}`;
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
      include: { category: { select: { slug: true } } },
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

    const bulky = isBulkyDeliveryCategory(listing.category?.slug);
    const deliveryFeeKobo = bulky
      ? computeDeliveryFeeKobo(quote.distanceKm, BULKY_DELIVERY_RATES)
      : quote.feeKobo;
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
            payload: {
              toLat,
              toLng,
              ...quote,
              feeKobo: deliveryFeeKobo,
              handling: bulky ? 'bulky' : 'parcel',
            },
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
            payload: {
              toLat,
              toLng,
              ...quote,
              feeKobo: deliveryFeeKobo,
              handling: bulky ? 'bulky' : 'parcel',
            },
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
      handling: bulky ? 'bulky' : 'parcel',
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

    const legs = await this.snapshotLegs(order.buyerId, listing, toLat, toLng);
    await this.prisma.deliveryShipment.update({
      where: { id: order.deliveryShipment.id },
      data: legs,
    });

    await this.applyStatus({
      orderId,
      status: 'OFFERED',
      providerRef: created.providerRef,
      etaFrom: created.etaFrom,
      etaTo: created.etaTo,
      source: 'SYSTEM',
    });

    await this.tryAutoAssignDriver(orderId);
  }

  private async snapshotLegs(
    buyerId: string,
    listing: {
      addressPrivate: string | null;
      community: string;
      city: string;
      geoLat: number | null;
      geoLng: number | null;
    },
    toLat: number,
    toLng: number,
  ) {
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      include: {
        profile: { select: { preferredCommunity: true } },
        addresses: {
          orderBy: [{ isDefault: 'desc' }],
          take: 1,
        },
      },
    });
    const drop = buyer?.addresses[0];
    const dropoffArea =
      drop?.community || buyer?.profile?.preferredCommunity || 'Buyer area';
    const dropoffLine = drop
      ? [drop.line1, drop.line2, drop.community, drop.city]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join(', ')
      : `${dropoffArea}, Lagos`;
    const pickupLine =
      listing.addressPrivate?.trim() ||
      [listing.community, listing.city].filter(Boolean).join(', ');
    return {
      pickupLine,
      pickupLat: listing.geoLat,
      pickupLng: listing.geoLng,
      dropoffLine,
      dropoffLat: drop?.geoLat ?? toLat,
      dropoffLng: drop?.geoLng ?? toLng,
      dropoffArea,
    };
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
      include: { order: { include: { listing: true } } },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const updated = await this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: {
        assignedDriverId: driverUserId,
        driverAcceptedAt: null,
      },
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

    if (shipment.status === 'QUOTED') {
      const listing = shipment.order.listing;
      const legs = await this.snapshotLegs(
        shipment.order.buyerId,
        listing,
        listing.geoLat ?? 0,
        listing.geoLng ?? 0,
      );
      await this.prisma.deliveryShipment.update({
        where: { id: shipment.id },
        data: legs,
      });
      await this.applyStatus({
        orderId,
        status: 'OFFERED',
        source: 'SYSTEM',
      });
    }

    await this.notifyDriverOffer(driverUserId, orderId, shipment.order.listing.title);
    return updated;
  }

  /** Prefer the oldest active rider who has not declined this run. */
  async tryAutoAssignDriver(orderId: string): Promise<void> {
    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
      include: { order: { include: { listing: { select: { title: true } } } } },
    });
    if (!shipment || shipment.assignedDriverId) return;
    if (shipment.status !== 'OFFERED' && shipment.status !== 'QUOTED') return;

    const driver = await this.prisma.user.findFirst({
      where: {
        isDeliveryDriver: true,
        status: 'ACTIVE',
        deletedAt: null,
        id: { notIn: shipment.declinedDriverIds },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!driver) return;

    await this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: { assignedDriverId: driver.id, driverAcceptedAt: null },
    });
    await this.notifyDriverOffer(
      driver.id,
      orderId,
      shipment.order.listing?.title ?? 'a delivery',
    );
  }

  private async notifyDriverOffer(
    driverUserId: string,
    orderId: string,
    title: string,
  ) {
    await this.notifications.notify({
      userId: driverUserId,
      category: NotificationCategory.DELIVERY_UPDATE,
      title: 'Delivery to accept',
      body: `${title} is waiting. Open Driver runs to accept or decline.`,
      deepLink: 'reworth://driver',
      meta: { orderId, status: 'OFFERED' },
    });
  }

  async listDriverAssignments(driverUserId: string) {
    const rows = await this.prisma.deliveryShipment.findMany({
      where: {
        assignedDriverId: driverUserId,
        status: {
          in: [
            'OFFERED',
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
            seller: {
              select: {
                phone: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((s) => {
      const accepted = Boolean(s.driverAcceptedAt);
      return {
        orderId: s.orderId,
        shipmentId: s.id,
        status: s.status,
        accepted,
        providerRef: s.providerRef,
        etaFrom: s.etaFrom,
        etaTo: s.etaTo,
        distanceKm: s.distanceKm,
        quoteKobo: s.quoteKobo,
        listingTitle: s.order.listing?.title ?? null,
        community: s.order.listing?.community ?? null,
        city: s.order.listing?.city ?? null,
        sellerName: s.order.seller.profile?.displayName ?? null,
        dropoffArea: s.dropoffArea,
        pickup: accepted
          ? { line: s.pickupLine, lat: s.pickupLat, lng: s.pickupLng }
          : { area: s.order.listing?.community ?? null },
        dropoff: accepted
          ? { line: s.dropoffLine, lat: s.dropoffLat, lng: s.dropoffLng }
          : { area: s.dropoffArea },
        sellerPhone: accepted ? maskPhone(s.order.seller.phone) : null,
        orderStatus: s.order.status,
        recentEvents: s.events,
      };
    });
  }

  async acceptDelivery(driverUserId: string, orderId: string) {
    const shipment = await this.requireAssignedOffer(driverUserId, orderId);
    if (shipment.status !== 'OFFERED') {
      throw new ConflictException('This delivery is no longer waiting for acceptance');
    }
    await this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: { driverAcceptedAt: new Date() },
    });
    const updated = await this.applyStatus({
      orderId,
      status: 'ASSIGNED',
      source: 'DRIVER',
      actorUserId: driverUserId,
      note: 'Rider accepted',
    });
    return {
      accepted: true,
      orderId,
      shipmentId: updated.id,
      status: updated.status,
    };
  }

  async declineDelivery(driverUserId: string, orderId: string) {
    const shipment = await this.requireAssignedOffer(driverUserId, orderId);
    if (shipment.status !== 'OFFERED') {
      throw new ConflictException('Only an open offer can be declined');
    }
    const declined = Array.from(
      new Set([...shipment.declinedDriverIds, driverUserId]),
    );
    await this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: {
        declinedDriverIds: declined,
        assignedDriverId: null,
        driverAcceptedAt: null,
      },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        shipmentId: shipment.id,
        status: 'OFFERED',
        source: 'DRIVER',
        payload: {
          accepted: false,
          reason: 'rider_declined',
          driverUserId,
        },
      },
    });
    await this.tryAutoAssignDriver(orderId);
    const fresh = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    return {
      accepted: true,
      orderId,
      status: fresh?.status ?? 'OFFERED',
      reassigned: Boolean(fresh?.assignedDriverId),
    };
  }

  /**
   * Buyer asks for another attempt after FAILED. Up to 2 reattempts.
   * The same rider stays on the run and must be available again.
   */
  async reattemptDelivery(buyerId: string, orderId: string) {
    const order = await this.requireParticipant(orderId, buyerId);
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can request another attempt');
    }
    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status !== 'FAILED') {
      throw new ConflictException('Another attempt is only available after a failed delivery');
    }
    if (shipment.attemptCount >= 2) {
      throw new ConflictException('This delivery has used its two reattempts');
    }
    const nextStatus: DeliveryShipmentStatus = shipment.driverAcceptedAt
      ? 'ASSIGNED'
      : 'OFFERED';
    const updated = await this.prisma.deliveryShipment.update({
      where: { id: shipment.id },
      data: {
        status: nextStatus,
        failureReason: null,
        attemptCount: { increment: 1 },
      },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        shipmentId: shipment.id,
        status: nextStatus,
        source: 'BUYER',
        payload: { reason: 'reattempt', attemptCount: updated.attemptCount },
      },
    });
    if (!updated.assignedDriverId) {
      await this.tryAutoAssignDriver(orderId);
    } else {
      await this.notifyDriverOffer(
        updated.assignedDriverId,
        orderId,
        'Another attempt',
      );
    }
    await this.fanOutDeliveryUpdate(
      order.buyerId,
      order.sellerId,
      orderId,
      nextStatus,
    );
    return {
      orderId,
      status: nextStatus,
      attemptCount: updated.attemptCount,
    };
  }

  private async requireAssignedOffer(driverUserId: string, orderId: string) {
    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.assignedDriverId !== driverUserId) {
      throw new ForbiddenException('Not assigned to this delivery');
    }
    return shipment;
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

    const shipment = await this.prisma.deliveryShipment.findUnique({
      where: { orderId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.assignedDriverId !== driverUserId) {
      throw new ForbiddenException('Not assigned to this delivery');
    }

    const existingIdem = await this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });
    if (existingIdem) {
      const stored = (existingIdem.responseJson ?? {}) as {
        orderId?: string;
        driverUserId?: string;
      };
      if (
        existingIdem.operation !== 'driver.milestone' ||
        stored.orderId !== orderId ||
        (stored.driverUserId && stored.driverUserId !== driverUserId)
      ) {
        throw new ConflictException('Idempotency key already used');
      }
      return existingIdem.responseJson as Record<string, unknown>;
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
    if (current === 'OFFERED' && dto.status !== 'FAILED') {
      throw new BadRequestException('Accept the delivery before updating it');
    }
    if (
      dto.status === 'FAILED' &&
      (current === 'DELIVERED' || current === 'QUOTED')
    ) {
      throw new ConflictException('This delivery can no longer be marked failed');
    }
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
            driverUserId,
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
        driverUserId,
      };
    }

    if (
      dto.status !== 'FAILED' &&
      dto.status !== current &&
      dto.status !== nextForward(current)
    ) {
      throw new ConflictException(
        `Cannot skip from ${current} to ${dto.status}. Next is ${nextForward(current) ?? 'none'}`,
      );
    }

    try {
      await this.provider.updateStatus({
        providerRef: shipment.providerRef ?? shipment.id,
        status: dto.status as Exclude<
          DeliveryShipmentStatus,
          'QUOTED' | 'OFFERED'
        >,
        failureReason: dto.failureReason,
      });
    } catch (err) {
      throw new BadRequestException(
        `Courier did not accept this update: ${(err as Error).message}`,
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
      driverUserId,
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

    // An in-app rider owns the live status. The partner event is a mirror.
    if (shipment.assignedDriverId) {
      await this.prisma.deliveryEvent.create({
        data: {
          shipmentId: shipment.id,
          status,
          source: 'WEBHOOK',
          payload: {
            accepted: false,
            reason: 'driver_owns_status',
            currentStatus: shipment.status,
            failureReason: dto.failureReason,
            providerRef: dto.providerRef,
          },
        },
      });
      return {
        accepted: false,
        reason: 'driver_owns_status',
        currentStatus: shipment.status,
        orderId: shipment.orderId,
        shipmentId: shipment.id,
      };
    }

    if (
      status !== 'FAILED' &&
      status !== shipment.status &&
      status !== nextForward(shipment.status)
    ) {
      throw new ConflictException(
        `Cannot skip from ${shipment.status} to ${status}`,
      );
    }

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
    if (
      opts.status !== 'FAILED' &&
      opts.status !== nextForward(current) &&
      opts.source !== 'BUYER'
    ) {
      throw new ConflictException(
        `Cannot skip from ${current} to ${opts.status}`,
      );
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
    const copy = DELIVERY_COPY[status] ?? {
      title: 'Delivery update',
      buyer: 'Your delivery was updated.',
      seller: 'This delivery was updated.',
    };
    const deepLink = `reworth://orders/${orderId}`;
    const meta = { orderId, status };
    await this.notifications.notify({
      userId: buyerId,
      category: NotificationCategory.DELIVERY_UPDATE,
      title: copy.title,
      body: copy.buyer,
      deepLink,
      meta,
    });
    await this.notifications.notify({
      userId: sellerId,
      category: NotificationCategory.DELIVERY_UPDATE,
      title: copy.title,
      body: copy.seller,
      deepLink,
      meta,
    });
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
