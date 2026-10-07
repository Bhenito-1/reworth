import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FulfilmentMethod,
  NotificationChannel,
  Order,
  OrderConfirmationStatus,
  OrderStatus,
  Prisma,
  SwapLegStatus,
  TransactionType,
} from '@prisma/client';
import {
  buildEscrowSnapshot,
  buildOrderLifecycle,
  type EscrowSnapshot,
  type OrderLifecycleStage,
} from '@reworth/shared';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { SUPPORT } from '../admin/admin-roles';
import { DeliveryService } from '../delivery/delivery.service';
import { ListingStateMachine } from '../listings/listing-state.machine';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeDeliveryFeeKobo,
  DELIVERY_PROVIDER,
  type DeliveryProvider,
} from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';
import { MockPsp } from '../providers/mock-psp';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { ReferralsService } from '../referrals/referrals.service';
import { TrustScoreService } from '../reviews/trust-score.service';
import { InstantBuyService } from '../platform-services/instant-buy.service';
import { LuxuryAuthService } from '../verticals/luxury-auth.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  ConfirmOrderDto,
  CreateOrderDto,
  RejectOrderDto,
} from './dto/orders.dto';
import {
  computeOrderTotalKobo,
  computeProtectionFeeKobo,
} from './order-fees';
import { OrderStateMachine } from './order-state.machine';

export type AddressDisclosureDto = {
  id: string;
  createdAt: Date;
  addressSnapshot: string;
};

export type MeetPointSummaryDto = {
  id: string;
  community: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
};

/** One placed order, enough to describe it in a combined email. */
export type PlacedOrderMail = {
  id: string;
  sellerId: string;
  quantity: number;
  totalKobo: number;
  title: string;
};

const NO_EMAIL: NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.PUSH,
];

function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(kobo / 100);
}

function orderMailLine(order: PlacedOrderMail): string {
  const title = order.title.trim() || 'Item';
  return `${order.quantity} × ${title} — ${formatNaira(order.totalKobo)}`;
}

export type OrderDto = {
  id: string;
  listingId: string;
  listingTitle?: string | null;
  buyerId: string;
  sellerId: string;
  offerId: string | null;
  orderIntentId: string | null;
  amountKobo: number;
  protectionFeeKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  quantity: number;
  unitPriceKobo: number;
  fulfilmentMethod: FulfilmentMethod;
  status: OrderStatus;
  confirmationStatus: OrderConfirmationStatus;
  rejectionReason: string | null;
  sellerNote: string | null;
  deliveryDate: Date | null;
  buyerProtection: boolean;
  coverageEndsAt: Date | null;
  autoReleaseAt: Date | null;
  fundedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  meetPointId?: string | null;
  meetPoint?: MeetPointSummaryDto | null;
  addressDisclosure?: AddressDisclosureDto | null;
  transactionType?: TransactionType;
  swapProposalId?: string | null;
  giveawayClaimId?: string | null;
  swapListingAId?: string | null;
  swapListingBId?: string | null;
  legAStatus?: SwapLegStatus | null;
  legBStatus?: SwapLegStatus | null;
  cashRecipientId?: string | null;
  /** Escrow journey stages for UI. */
  lifecycle?: OrderLifecycleStage[];
  escrow?: EscrowSnapshot;
  deliveryStatus?: string | null;
};

function toOrderDto(
  o: Order & {
    meetPoint?: MeetPointSummaryDto | null;
    addressDisclosure?: {
      id: string;
      createdAt: Date;
      addressSnapshot: string;
    } | null;
  },
): OrderDto {
  return {
    id: o.id,
    listingId: o.listingId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    offerId: o.offerId,
    orderIntentId: o.orderIntentId,
    amountKobo: o.amountKobo,
    protectionFeeKobo: o.protectionFeeKobo,
    deliveryFeeKobo: o.deliveryFeeKobo,
    totalKobo: o.totalKobo,
    quantity: o.quantity ?? 1,
    unitPriceKobo: o.unitPriceKobo || o.amountKobo,
    fulfilmentMethod: o.fulfilmentMethod,
    status: o.status,
    confirmationStatus: o.confirmationStatus ?? 'CONFIRMED',
    rejectionReason: o.rejectionReason ?? null,
    sellerNote: o.sellerNote ?? null,
    deliveryDate: o.deliveryDate ?? null,
    buyerProtection: o.buyerProtection,
    coverageEndsAt: o.coverageEndsAt,
    autoReleaseAt: o.autoReleaseAt,
    fundedAt: o.fundedAt,
    completedAt: o.completedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    meetPointId: o.meetPointId ?? null,
    meetPoint: o.meetPoint
      ? {
          id: o.meetPoint.id,
          community: o.meetPoint.community,
          name: o.meetPoint.name,
          landmark: o.meetPoint.landmark,
          lat: o.meetPoint.lat,
          lng: o.meetPoint.lng,
        }
      : null,
    addressDisclosure: o.addressDisclosure
      ? {
          id: o.addressDisclosure.id,
          createdAt: o.addressDisclosure.createdAt,
          addressSnapshot: o.addressDisclosure.addressSnapshot,
        }
      : null,
    transactionType: o.transactionType,
    swapProposalId: o.swapProposalId,
    giveawayClaimId: o.giveawayClaimId,
    swapListingAId: o.swapListingAId,
    swapListingBId: o.swapListingBId,
    legAStatus: o.legAStatus,
    legBStatus: o.legBStatus,
    cashRecipientId: o.cashRecipientId,
  };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly psp: PaymentProvider,
    @Optional()
    @Inject(DELIVERY_PROVIDER)
    private readonly deliveryProvider?: DeliveryProvider,
    @Optional()
    @Inject(forwardRef(() => DeliveryService))
    private readonly delivery?: DeliveryService,
    @Optional() private readonly trust?: TrustScoreService,
    @Optional()
    @Inject(forwardRef(() => LuxuryAuthService))
    private readonly luxuryAuth?: LuxuryAuthService,
    @Optional() private readonly referrals?: ReferralsService,
    @Optional()
    @Inject(forwardRef(() => InstantBuyService))
    private readonly instantBuy?: InstantBuyService,
    @Optional() private readonly inventory?: InventoryService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  private feePct(): number {
    return Number(this.config.get('BUYER_PROTECTION_FEE_PCT') ?? 0.025);
  }

  private feeCap(): number {
    return Number(
      this.config.get('BUYER_PROTECTION_FEE_CAP_KOBO') ?? 500_000,
    );
  }

  private autoReleaseDays(): number {
    return Number(this.config.get('ORDER_AUTO_RELEASE_DAYS') ?? 3);
  }

  private coverageDays(): number {
    return Number(this.config.get('BUYER_PROTECTION_COVERAGE_DAYS') ?? 7);
  }

  async create(
    buyerId: string,
    dto: CreateOrderDto,
    opts?: { skipEmail?: boolean },
  ): Promise<OrderDto> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Cannot buy your own listing');
    }
    if (!['LIVE', 'RESERVED'].includes(listing.status)) {
      throw new ConflictException(
        `Listing is not available (status=${listing.status})`,
      );
    }

    let amountKobo = listing.priceKobo;
    let offerId: string | undefined = dto.offerId;
    let orderIntentId: string | undefined = dto.orderIntentId;

    if (dto.orderIntentId) {
      const intent = await this.prisma.orderIntent.findUnique({
        where: { id: dto.orderIntentId },
      });
      if (!intent) throw new NotFoundException('OrderIntent not found');
      if (intent.buyerId !== buyerId) {
        throw new ForbiddenException('OrderIntent belongs to another buyer');
      }
      if (intent.status !== 'PENDING') {
        throw new ConflictException(`OrderIntent is ${intent.status}`);
      }
      if (intent.listingId !== dto.listingId) {
        throw new BadRequestException('OrderIntent listing mismatch');
      }
      amountKobo = intent.amountKobo;
      offerId = intent.offerId ?? offerId;
    } else if (dto.offerId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: dto.offerId },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.buyerId !== buyerId) {
        throw new ForbiddenException('Offer belongs to another buyer');
      }
      if (offer.status !== 'ACCEPTED') {
        throw new ConflictException('Offer must be ACCEPTED');
      }
      if (offer.listingId !== dto.listingId) {
        throw new BadRequestException('Offer listing mismatch');
      }
      amountKobo = offer.amountKobo;
    } else if (!dto.buyNow) {
      throw new BadRequestException(
        'Provide buyNow=true, offerId, or orderIntentId',
      );
    }

    const negotiated = Boolean(dto.offerId || dto.orderIntentId);
    const quantity = negotiated
      ? 1
      : Math.min(999, Math.max(1, dto.quantity ?? 1));
    const unitPriceKobo = amountKobo;
    if (!negotiated && listing.sellingMode !== 'SELL') {
      throw new BadRequestException('This listing is not sold by the unit');
    }
    if (
      !negotiated &&
      typeof listing.quantityAvailable === 'number' &&
      listing.quantityAvailable < quantity
    ) {
      throw new ConflictException(
        `Only ${listing.quantityAvailable} unit(s) available`,
      );
    }
    amountKobo = unitPriceKobo * quantity;

    const protectionFeeKobo = computeProtectionFeeKobo(
      amountKobo,
      this.feePct(),
      this.feeCap(),
    );

    let deliveryFeeKobo = 0;
    let distanceKm: number | undefined;
    let meetPointId: string | null = null;

    if (dto.fulfilmentMethod === FulfilmentMethod.MEET_POINT) {
      if (!dto.meetPointId) {
        throw new BadRequestException('meetPointId required for MEET_POINT');
      }
      const mp = await this.prisma.meetPoint.findFirst({
        where: { id: dto.meetPointId, active: true },
      });
      if (!mp) throw new NotFoundException('Meet point not found');
      meetPointId = mp.id;
    }

    if (dto.fulfilmentMethod === FulfilmentMethod.DELIVERY) {
      if (
        dto.toLat != null &&
        dto.toLng != null &&
        listing.geoLat != null &&
        listing.geoLng != null
      ) {
        distanceKm = haversineKm(
          listing.geoLat,
          listing.geoLng,
          dto.toLat,
          dto.toLng,
        );
        deliveryFeeKobo = computeDeliveryFeeKobo(distanceKm);
      }
      // Quote may also be applied via GET /orders/:id/delivery-quote before pay
    }

    const totalKobo = computeOrderTotalKobo({
      amountKobo,
      protectionFeeKobo,
      deliveryFeeKobo,
    });

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          listingId: dto.listingId,
          buyerId,
          sellerId: listing.sellerId,
          offerId: offerId ?? null,
          orderIntentId: orderIntentId ?? null,
          amountKobo,
          quantity,
          unitPriceKobo,
          protectionFeeKobo,
          deliveryFeeKobo,
          totalKobo,
          fulfilmentMethod: dto.fulfilmentMethod,
          meetPointId,
          status: 'CREATED',
          confirmationStatus: 'PENDING',
          buyerProtection: true,
        },
      });

      if (
        dto.fulfilmentMethod === FulfilmentMethod.DELIVERY &&
        deliveryFeeKobo > 0
      ) {
        const shipment = await tx.deliveryShipment.create({
          data: {
            orderId: created.id,
            provider: this.deliveryProvider?.name ?? 'mock-delivery',
            quoteKobo: deliveryFeeKobo,
            distanceKm: distanceKm ?? null,
            status: 'QUOTED',
          },
        });
        await tx.deliveryEvent.create({
          data: {
            shipmentId: shipment.id,
            status: 'QUOTED',
            payload: {
              toLat: dto.toLat,
              toLng: dto.toLng,
              feeKobo: deliveryFeeKobo,
              distanceKm,
            },
          },
        });
      }

      if (this.inventory) {
        await this.inventory.reserveStock(tx, listing.id, quantity, buyerId);
      }

      await tx.orderEvent.create({
        data: {
          orderId: created.id,
          type: 'CREATED',
          actorUserId: buyerId,
          payload: {
            amountKobo,
            quantity,
            unitPriceKobo,
            protectionFeeKobo,
            totalKobo,
            confirmationStatus: 'PENDING',
          },
        },
      });

      if (orderIntentId) {
        await tx.orderIntent.update({
          where: { id: orderIntentId },
          data: { status: 'CONVERTED', orderId: created.id },
        });
      }

      return created;
    });

    this.notifications.log('order.awaiting_confirmation', {
      orderId: order.id,
      buyerId,
      sellerId: listing.sellerId,
      quantity,
    });

    const title = listing.title?.trim() || 'your listing';
    const orderLink = `reworth://orders/${order.id}`;
    const channels = opts?.skipEmail ? NO_EMAIL : undefined;
    await this.notifications.notify({
      userId: buyerId,
      category: NotificationCategory.ORDER_PLACED,
      title: 'Order placed',
      body: `You ordered ${quantity} × ${title}. The seller will accept or reject it. You can pay after they accept.`,
      deepLink: orderLink,
      channels,
      meta: { orderId: order.id, quantity, listingId: listing.id },
    });
    await this.notifications.notify({
      userId: listing.sellerId,
      category: NotificationCategory.ORDER_PLACED,
      title: 'New order to accept',
      body: `A buyer ordered ${quantity} × ${title}. Open this to accept the order or reject it with a reason. Those units stay reserved until you respond.`,
      deepLink: orderLink,
      channels,
      meta: { orderId: order.id, quantity, listingId: listing.id },
    });

    return toOrderDto(order);
  }

  /**
   * One email per person for orders placed in the same checkout.
   * In-app notices stay per order. A mail failure does not undo the orders.
   */
  async emailOrdersPlaced(
    buyerId: string,
    orders: PlacedOrderMail[],
  ): Promise<void> {
    if (orders.length === 0) return;
    if (orders.length === 1) {
      await this.emailSingleOrderPlaced(buyerId, orders[0]);
      return;
    }

    const total = orders.reduce((sum, order) => sum + order.totalKobo, 0);
    await this.sendOrderMail(buyerId, () =>
      this.notifications.notify({
        userId: buyerId,
        category: NotificationCategory.ORDER_PLACED,
        title: 'Orders placed',
        body: [
          `You placed ${orders.length} orders. Each seller will accept or reject their order. You can pay after they accept.`,
          ...orders.map(orderMailLine),
          `Total ${formatNaira(total)}.`,
        ].join('\n\n'),
        deepLink: 'reworth://orders',
        channels: [NotificationChannel.EMAIL],
        meta: { orderIds: orders.map((order) => order.id) },
      }),
    );

    const bySeller = new Map<string, PlacedOrderMail[]>();
    for (const order of orders) {
      const group = bySeller.get(order.sellerId) ?? [];
      group.push(order);
      bySeller.set(order.sellerId, group);
    }
    for (const [sellerId, sellerOrders] of bySeller) {
      if (sellerOrders.length === 1) {
        await this.sendOrderMail(sellerId, () =>
          this.emailSellerNewOrder(sellerOrders[0]),
        );
        continue;
      }
      await this.sendOrderMail(sellerId, () =>
        this.notifications.notify({
          userId: sellerId,
          category: NotificationCategory.ORDER_PLACED,
          title: 'New orders to accept',
          body: [
            `A buyer placed ${sellerOrders.length} orders with you. Open them to accept or reject. Those units stay reserved until you respond.`,
            ...sellerOrders.map(orderMailLine),
          ].join('\n\n'),
          deepLink: 'reworth://orders',
          channels: [NotificationChannel.EMAIL],
          meta: { orderIds: sellerOrders.map((order) => order.id) },
        }),
      );
    }
  }

  private async sendOrderMail(
    userId: string,
    send: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await send();
    } catch (err) {
      this.logger.warn(
        `Order email failed for ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private async emailSingleOrderPlaced(
    buyerId: string,
    order: PlacedOrderMail,
  ): Promise<void> {
    const title = order.title.trim() || 'your listing';
    const orderLink = `reworth://orders/${order.id}`;
    await this.sendOrderMail(buyerId, () =>
      this.notifications.notify({
        userId: buyerId,
        category: NotificationCategory.ORDER_PLACED,
        title: 'Order placed',
        body: `You ordered ${order.quantity} × ${title}. The seller will accept or reject it. You can pay after they accept.`,
        deepLink: orderLink,
        channels: [NotificationChannel.EMAIL],
        meta: { orderId: order.id, quantity: order.quantity },
      }),
    );
    await this.sendOrderMail(order.sellerId, () =>
      this.emailSellerNewOrder(order),
    );
  }

  private async emailSellerNewOrder(order: PlacedOrderMail): Promise<void> {
    const title = order.title.trim() || 'your listing';
    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.ORDER_PLACED,
      title: 'New order to accept',
      body: `A buyer ordered ${order.quantity} × ${title}. Open this to accept the order or reject it with a reason. Those units stay reserved until you respond.`,
      deepLink: `reworth://orders/${order.id}`,
      channels: [NotificationChannel.EMAIL],
      meta: { orderId: order.id, quantity: order.quantity },
    });
  }

  async listForUser(userId: string): Promise<OrderDto[]> {
    const rows = await this.prisma.order.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.toEnrichedOrderDto(r.id)));
  }

  async getById(
    orderId: string,
    userId: string,
  ): Promise<OrderDto & { events: unknown[] }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        meetPoint: true,
        addressDisclosure: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    const dto = await this.toEnrichedOrderDto(orderId);
    return { ...dto, events: order.events };
  }

  async markHandedOver(orderId: string, sellerId: string): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can mark handed over');
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
    });
    if (listing && this.luxuryAuth) {
      this.luxuryAuth.assertCanHandOver(listing, order.status);
    }

    // Delivery → SHIPPED; meet/pickup → HANDED_OVER
    const nextStatus: OrderStatus =
      order.fulfilmentMethod === FulfilmentMethod.DELIVERY
        ? 'SHIPPED'
        : 'HANDED_OVER';
    OrderStateMachine.assertTransition(order.status, nextStatus);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: nextStatus,
          actorUserId: sellerId,
          payload: { fulfilmentMethod: order.fulfilmentMethod },
        },
      });
      return row;
    });

    this.notifications.log('order.handed_over', {
      orderId,
      buyerId: order.buyerId,
      sellerId,
      status: nextStatus,
    });
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.DELIVERY_UPDATE,
      title:
        nextStatus === 'SHIPPED' ? 'Order shipped' : 'Item handed over',
      body:
        nextStatus === 'SHIPPED'
          ? 'Your order is on the way. Confirm receipt when it arrives.'
          : 'The seller marked the item as handed over. Confirm when you have it.',
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, status: nextStatus },
    });
    return this.toEnrichedOrderDto(updated.id);
  }

  async confirmReceipt(orderId: string, buyerId: string): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can confirm receipt');
    }

    // Race with dispute: if already DISPUTE_HOLD, reject
    if (order.status === 'DISPUTE_HOLD') {
      throw new ConflictException('Order is in dispute hold');
    }
    if (order.status === 'COMPLETED') {
      return toOrderDto(order);
    }
    // A previous attempt may have saved RECEIVED and then failed to release.
    if (order.status === 'RECEIVED') {
      return this.releaseEscrow(orderId, buyerId, 'confirm_receipt');
    }
    OrderStateMachine.assertTransition(order.status, 'RECEIVED');

    const coverageEndsAt = new Date(
      Date.now() + this.coverageDays() * 24 * 60 * 60 * 1000,
    );

    const fromStatuses: OrderStatus[] = [
      'HANDED_OVER',
      'DELIVERED',
      'SHIPPED',
    ];
    if (!fromStatuses.includes(order.status)) {
      throw new ConflictException(
        `Cannot confirm receipt from status ${order.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: { in: fromStatuses } },
        data: {
          status: 'RECEIVED',
          coverageEndsAt,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Order status changed; cannot confirm');
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'RECEIVED',
          actorUserId: buyerId,
          payload: { coverageEndsAt, previousStatus: order.status },
        },
      });
    });

    this.notifications.log('order.received', { orderId, buyerId });

    // Release escrow → COMPLETED + Payout
    return this.releaseEscrow(orderId, buyerId, 'confirm_receipt');
  }

  async confirm(
    orderId: string,
    sellerId: string,
    dto: ConfirmOrderDto,
  ): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can confirm');
    }
    if (order.confirmationStatus === 'CONFIRMED' && order.status === 'PAYMENT_PENDING') {
      return toOrderDto(order);
    }
    if (order.confirmationStatus !== 'PENDING' || order.status !== 'CREATED') {
      throw new ConflictException('This order is not awaiting confirmation');
    }
    const deliveryDate = new Date(dto.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) {
      throw new BadRequestException('Delivery date is invalid');
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (deliveryDate < startOfToday) {
      throw new BadRequestException('Delivery date must be today or later');
    }

    OrderStateMachine.assertTransition('CREATED', 'PAYMENT_PENDING');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAYMENT_PENDING',
          confirmationStatus: 'CONFIRMED',
          deliveryDate,
          sellerNote: dto.sellerNote?.trim() || null,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'CONFIRMED',
          actorUserId: sellerId,
          payload: {
            deliveryDate: deliveryDate.toISOString(),
            sellerNote: dto.sellerNote?.trim() || null,
          },
        },
      });
      return row;
    });

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { title: true },
    });
    const title = listing?.title?.trim() || 'your item';
    const when = deliveryDate.toLocaleDateString('en-NG', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const note = dto.sellerNote?.trim();
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.ORDER_CONFIRMED,
      title: 'Order in progress',
      body: note
        ? `The seller accepted ${order.quantity} × ${title}. Delivery date: ${when}. Note: ${note}. Complete payment to confirm, or cancel.`
        : `The seller accepted ${order.quantity} × ${title}. Delivery date: ${when}. Complete payment to confirm, or cancel.`,
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, deliveryDate: deliveryDate.toISOString() },
    });

    return toOrderDto(updated);
  }

  async reject(
    orderId: string,
    sellerId: string,
    dto: RejectOrderDto,
  ): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can reject');
    }
    if (order.confirmationStatus === 'REJECTED') {
      return toOrderDto(order);
    }
    if (order.confirmationStatus !== 'PENDING' || order.status !== 'CREATED') {
      throw new ConflictException('This order is not awaiting confirmation');
    }
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException('A reason is required');
    }

    OrderStateMachine.assertTransition(order.status, 'CANCELLED');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (this.inventory && !order.inventoryCommitted) {
        await this.inventory.releaseStock(
          tx,
          order.listingId,
          order.quantity ?? 1,
          sellerId,
        );
      }
      const row = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          confirmationStatus: 'REJECTED',
          rejectionReason: reason,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'REJECTED',
          actorUserId: sellerId,
          payload: { reason },
        },
      });
      return row;
    });

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { title: true },
    });
    const title = listing?.title?.trim() || 'your item';
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.ORDER_REJECTED,
      title: 'Order rejected',
      body: `The seller rejected your order for ${title}. Reason: ${reason}`,
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, reason },
    });

    return toOrderDto(updated);
  }

  async cancel(orderId: string, buyerId: string): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can cancel');
    }
    if (!['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
      throw new ConflictException('Can only cancel pre-funding');
    }
    OrderStateMachine.assertTransition(order.status, 'CANCELLED');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (this.inventory && !order.inventoryCommitted) {
        await this.inventory.releaseStock(
          tx,
          order.listingId,
          order.quantity ?? 1,
          buyerId,
        );
      }
      const row = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'CANCELLED',
          actorUserId: buyerId,
        },
      });
      return row;
    });

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { title: true },
    });
    const title = listing?.title?.trim() || 'a listing';
    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.ORDER_CANCELLED,
      title: 'Order cancelled',
      body: `The buyer cancelled ${order.quantity ?? 1} × ${title} before paying. Those units are available again.`,
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId },
    });

    this.notifications.log('order.cancelled', { orderId, buyerId });
    return toOrderDto(updated);
  }

  /**
   * Called from payment webhook on success. Idempotent.
   */
  async markFunded(orderId: string, paymentReference: string): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.status === 'FUNDED' || this.isPostFunded(order.status)) {
      return toOrderDto(order);
    }
    OrderStateMachine.assertTransition(order.status, 'FUNDED');

    const autoReleaseAt = new Date(
      Date.now() + this.autoReleaseDays() * 24 * 60 * 60 * 1000,
    );
    const fundedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: 'PAYMENT_PENDING' },
        data: {
          status: 'FUNDED',
          fundedAt,
          autoReleaseAt,
          ...(this.inventory ? { inventoryCommitted: true } : {}),
        },
      });
      if (claimed.count === 0) {
        return tx.order.findUniqueOrThrow({ where: { id: orderId } });
      }

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'FUNDED',
          payload: { paymentReference, autoReleaseAt },
        },
      });

      if (this.inventory) {
        await this.inventory.commitSale(
          tx,
          order.listingId,
          order.quantity ?? 1,
          null,
        );
      } else {
        const listing = await tx.listing.findUnique({
          where: { id: order.listingId },
        });
        if (listing && listing.status === 'LIVE') {
          ListingStateMachine.assertTransition(listing.status, 'RESERVED');
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: 'RESERVED' },
          });
        }
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });

    this.notifications.log('order.funded', {
      orderId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      paymentReference,
    });

    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.PAYMENT_RECEIVED,
      title: 'Payment received',
      body: 'Buyer payment is in escrow for your listing.',
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, paymentReference },
    });
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.PAYMENT_RECEIVED,
      title: 'Payment confirmed',
      body: 'Your payment is secured in ReWorth escrow.',
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, paymentReference },
    });

    if (updated.fulfilmentMethod === FulfilmentMethod.DELIVERY) {
      await this.delivery?.assignAfterFunding(orderId);
    }

    // Luxury auth gate: FUNDED → IN_AUTHENTICATION when required
    if (this.luxuryAuth) {
      await this.luxuryAuth.afterOrderFunded(orderId).catch((err) =>
        this.logger.warn(
          `Luxury auth after fund failed: ${(err as Error).message}`,
        ),
      );
    }

    // Instant Buy: start platform fulfilment when listing is eligible
    if (this.instantBuy) {
      await this.instantBuy.afterOrderFunded(orderId).catch((err) =>
        this.logger.warn(
          `Instant Buy after fund failed: ${(err as Error).message}`,
        ),
      );
    }

    if (this.luxuryAuth) {
      const refreshed = await this.requireOrder(orderId);
      if (refreshed.status === 'IN_AUTHENTICATION') {
        return toOrderDto(refreshed);
      }
    }

    // Swap+cash: if both legs already RECEIVED, release + complete now
    if (
      updated.transactionType === TransactionType.SWAP_CASH &&
      this.legsFullyReceived(updated)
    ) {
      return this.completeSwapOrGiveaway(orderId, null);
    }

    return this.toEnrichedOrderDto(orderId);
  }

  /**
   * Release escrow to seller: Payment RELEASED, Payout once, order COMPLETED.
   * Idempotent via IdempotencyRecord + payout uniqueness check.
   */
  async releaseEscrow(
    orderId: string,
    actorUserId: string | null,
    reason: string,
  ): Promise<OrderDto> {
    const idemKey = `release:${orderId}`;
    const existingIdem = await this.prisma.idempotencyRecord.findUnique({
      where: { key: idemKey },
    });
    if (existingIdem) {
      const order = await this.requireOrder(orderId);
      return toOrderDto(order);
    }

    const existingPayout = await this.prisma.payout.findFirst({
      where: { orderId },
    });
    if (existingPayout) {
      const order = await this.requireOrder(orderId);
      if (order.status !== 'COMPLETED') {
        return this.finalizeCompleted(orderId, actorUserId, reason);
      }
      return toOrderDto(order);
    }

    const order = await this.requireOrder(orderId);
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: ['SUCCESS', 'RELEASED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      throw new ConflictException('No successful payment to release');
    }
    if (payment.status === 'RELEASED') {
      return this.finalizeCompleted(orderId, actorUserId, reason);
    }

    if (this.psp instanceof MockPsp || this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).ensureFunded({
        reference: payment.reference,
        amountKobo: payment.amountKobo,
      });
    }

    const releaseResult = await this.psp.release({
      reference: payment.reference,
      amountKobo: order.amountKobo,
      idempotencyKey: idemKey,
    });

    const feesKobo = order.protectionFeeKobo;
    const netKobo = order.amountKobo;
    const grossKobo = order.amountKobo + order.protectionFeeKobo;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'RELEASED',
          providerPayload: {
            ...(payment.providerPayload as object),
            release: releaseResult,
          } as Prisma.InputJsonValue,
        },
      });

      const payoutExists = await tx.payout.findFirst({ where: { orderId } });
      if (!payoutExists) {
        await tx.payout.create({
          data: {
            orderId,
            grossKobo,
            feesKobo,
            netKobo,
            pspReference: releaseResult.providerRef ?? null,
          },
        });
      }

      await tx.idempotencyRecord.upsert({
        where: { key: idemKey },
        create: {
          key: idemKey,
          operation: 'escrow_release',
          responseJson: releaseResult as unknown as Prisma.InputJsonValue,
        },
        update: {},
      });
    });

    return this.finalizeCompleted(orderId, actorUserId, reason);
  }

  private async finalizeCompleted(
    orderId: string,
    actorUserId: string | null,
    reason: string,
  ): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.status === 'COMPLETED') return toOrderDto(order);

    if (
      order.status !== 'RECEIVED' &&
      order.status !== 'HANDED_OVER' &&
      order.status !== 'SHIPPED' &&
      order.status !== 'DELIVERED' &&
      order.status !== 'FUNDED' &&
      order.status !== 'DISPUTE_HOLD' &&
      order.status !== 'CREATED'
    ) {
      // From RECEIVED path we already set RECEIVED; allow COMPLETED from RECEIVED
      if (!OrderStateMachine.canTransition(order.status, 'COMPLETED')) {
        OrderStateMachine.assertTransition(order.status, 'COMPLETED');
      }
    }

    if (
      order.status === 'RECEIVED' ||
      order.status === 'DISPUTE_HOLD' ||
      order.status === 'CREATED'
    ) {
      OrderStateMachine.assertTransition(order.status, 'COMPLETED');
    } else if (
      order.status === 'HANDED_OVER' ||
      order.status === 'SHIPPED' ||
      order.status === 'DELIVERED' ||
      order.status === 'FUNDED'
    ) {
      // Auto-release may skip RECEIVED
      OrderStateMachine.assertTransition(order.status, 'COMPLETED');
    }

    const completedAt = new Date();
    const coverageEndsAt =
      order.coverageEndsAt ??
      new Date(Date.now() + this.coverageDays() * 24 * 60 * 60 * 1000);

    const listingIds = new Set<string>([order.listingId]);
    if (order.swapListingAId) listingIds.add(order.swapListingAId);
    if (order.swapListingBId) listingIds.add(order.swapListingBId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          completedAt,
          coverageEndsAt,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'COMPLETED',
          actorUserId,
          payload: { reason },
        },
      });

      for (const listingId of listingIds) {
        const qty = listingId === order.listingId ? (order.quantity ?? 1) : 1;
        if (this.inventory) {
          if (!order.inventoryCommitted) {
            await this.inventory.commitSale(tx, listingId, qty, actorUserId);
          } else if (listingId === order.listingId) {
            await this.inventory.syncVisibility(
              tx,
              listingId,
              actorUserId,
              'order_completed',
            );
          }
          continue;
        }
        const listing = await tx.listing.findUnique({
          where: { id: listingId },
        });
        if (listing && listing.status !== 'SOLD') {
          ListingStateMachine.assertTransition(listing.status, 'SOLD');
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: 'SOLD' },
          });
          await tx.listingEvent.create({
            data: {
              listingId: listing.id,
              type: 'STATUS_CHANGED',
              actorUserId,
              payload: {
                from: listing.status,
                to: 'SOLD',
                reason: 'order_completed',
              },
            },
          });
        }
      }

      if (this.inventory && !order.inventoryCommitted) {
        await tx.order.update({
          where: { id: orderId },
          data: { inventoryCommitted: true },
        });
      }

      if (order.swapProposalId) {
        await tx.swapProposal.updateMany({
          where: { id: order.swapProposalId, status: 'ACCEPTED' },
          data: { status: 'COMPLETED' },
        });
      }
      if (order.giveawayClaimId) {
        await tx.giveawayClaim.updateMany({
          where: { id: order.giveawayClaimId, status: 'APPROVED' },
          data: { status: 'COMPLETED' },
        });
      }

      return row;
    });

    this.notifications.log('order.completed', {
      orderId,
      reason,
      sellerId: order.sellerId,
    });
    if (order.amountKobo > 0) {
      await this.notifications.notify({
        userId: order.sellerId,
        category: NotificationCategory.PAYMENT_RELEASED,
        title: 'Payout released',
        body: 'Escrow has been released to you.',
        deepLink: `reworth://orders/${orderId}`,
        meta: { orderId, reason },
      });
    } else {
      await this.notifications.notify({
        userId: order.sellerId,
        category: NotificationCategory.ITEM_SOLD,
        title: 'Order completed',
        body: 'Your swap / give-away order is complete.',
        deepLink: `reworth://orders/${orderId}`,
        meta: { orderId, reason },
      });
    }

    void Promise.all([
      this.trust?.recompute(order.buyerId, 'order_completed'),
      this.trust?.recompute(order.sellerId, 'order_completed'),
    ]).catch((err) =>
      this.logger.warn(
        `Trust recompute after complete failed: ${(err as Error).message}`,
      ),
    );

    if (this.referrals) {
      void this.referrals
        .onOrderCompleted(order.buyerId, orderId)
        .catch((err) =>
          this.logger.warn(
            `Referral reward after complete failed: ${(err as Error).message}`,
          ),
        );
    }

    return toOrderDto(updated);
  }

  private isNonCashTransaction(order: Order): boolean {
    return (
      order.transactionType === TransactionType.SWAP ||
      order.transactionType === TransactionType.GIVEAWAY ||
      (order.transactionType === TransactionType.SWAP_CASH &&
        order.amountKobo === 0)
    );
  }

  private legsFullyReceived(order: Order): boolean {
    if (order.transactionType === TransactionType.GIVEAWAY) {
      return order.legAStatus === 'RECEIVED';
    }
    if (
      order.transactionType === TransactionType.SWAP ||
      order.transactionType === TransactionType.SWAP_CASH
    ) {
      return order.legAStatus === 'RECEIVED' && order.legBStatus === 'RECEIVED';
    }
    return false;
  }

  private parseLeg(leg: string): 'A' | 'B' {
    const upper = leg.toUpperCase();
    if (upper !== 'A' && upper !== 'B') {
      throw new BadRequestException('leg must be A or B');
    }
    return upper;
  }

  /**
   * Dual-leg hand-over for swap / give-away orders.
   * Leg A = target listing (seller → buyer). Leg B = offered (buyer → seller).
   */
  async markLegHandedOver(
    orderId: string,
    legParam: string,
    userId: string,
  ): Promise<OrderDto> {
    const leg = this.parseLeg(legParam);
    const order = await this.requireOrder(orderId);
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    if (
      order.transactionType !== TransactionType.SWAP &&
      order.transactionType !== TransactionType.SWAP_CASH &&
      order.transactionType !== TransactionType.GIVEAWAY
    ) {
      throw new BadRequestException('Order is not a swap/give-away');
    }
    if (leg === 'B' && order.transactionType === TransactionType.GIVEAWAY) {
      throw new BadRequestException('Give-away orders only have leg A');
    }

    const expectedActor = leg === 'A' ? order.sellerId : order.buyerId;
    if (userId !== expectedActor) {
      throw new ForbiddenException(
        leg === 'A'
          ? 'Only the seller can hand over leg A'
          : 'Only the buyer can hand over leg B',
      );
    }

    const statusField = leg === 'A' ? 'legAStatus' : 'legBStatus';
    const current = order[statusField];
    if (current === 'HANDED_OVER' || current === 'RECEIVED') {
      return toOrderDto(order); // idempotent
    }
    if (current !== 'PENDING') {
      throw new ConflictException(`Leg ${leg} is ${current}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: { [statusField]: 'HANDED_OVER' },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: `LEG_${leg}_HANDED_OVER`,
          actorUserId: userId,
        },
      });
      return row;
    });

    this.notifications.log('order.leg_handed_over', {
      orderId,
      leg,
      userId,
    });
    return toOrderDto(updated);
  }

  async confirmLegReceipt(
    orderId: string,
    legParam: string,
    userId: string,
  ): Promise<OrderDto> {
    const leg = this.parseLeg(legParam);
    const order = await this.requireOrder(orderId);
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    if (
      order.transactionType !== TransactionType.SWAP &&
      order.transactionType !== TransactionType.SWAP_CASH &&
      order.transactionType !== TransactionType.GIVEAWAY
    ) {
      throw new BadRequestException('Order is not a swap/give-away');
    }
    if (leg === 'B' && order.transactionType === TransactionType.GIVEAWAY) {
      throw new BadRequestException('Give-away orders only have leg A');
    }

    // Receiver confirms: leg A → buyer; leg B → seller
    const expectedActor = leg === 'A' ? order.buyerId : order.sellerId;
    if (userId !== expectedActor) {
      throw new ForbiddenException(
        leg === 'A'
          ? 'Only the buyer can confirm receipt of leg A'
          : 'Only the seller can confirm receipt of leg B',
      );
    }

    const statusField = leg === 'A' ? 'legAStatus' : 'legBStatus';
    const current = order[statusField];
    if (current === 'RECEIVED') {
      return toOrderDto(order); // idempotent
    }
    if (current !== 'HANDED_OVER') {
      throw new ConflictException(
        `Leg ${leg} must be HANDED_OVER before confirm (got ${current})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: { [statusField]: 'RECEIVED' },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: `LEG_${leg}_RECEIVED`,
          actorUserId: userId,
        },
      });
      return row;
    });

    this.notifications.log('order.leg_received', { orderId, leg, userId });

    if (this.legsFullyReceived(updated)) {
      return this.completeSwapOrGiveaway(orderId, userId);
    }
    return toOrderDto(updated);
  }

  async failLeg(
    orderId: string,
    legParam: string,
    userId: string,
    reason?: string,
  ): Promise<OrderDto> {
    const leg = this.parseLeg(legParam);
    const order = await this.requireOrder(orderId);
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    if (
      order.transactionType !== TransactionType.SWAP &&
      order.transactionType !== TransactionType.SWAP_CASH &&
      order.transactionType !== TransactionType.GIVEAWAY
    ) {
      throw new BadRequestException('Order is not a swap/give-away');
    }
    if (order.status === 'COMPLETED' || order.status === 'DISPUTE_HOLD') {
      throw new ConflictException(`Order is ${order.status}`);
    }

    OrderStateMachine.assertTransition(order.status, 'DISPUTE_HOLD');

    const statusField = leg === 'A' ? 'legAStatus' : 'legBStatus';
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: {
          [statusField]: 'FAILED',
          status: 'DISPUTE_HOLD',
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: `LEG_${leg}_FAILED`,
          actorUserId: userId,
          payload: { reason: reason ?? null },
        },
      });
      await tx.supportTicket.create({
        data: {
          orderId,
          userId,
          subject: `SWAP_LEG_FAILURE leg ${leg}`,
          status: 'OPEN',
        },
      });
      await tx.riskEvent.create({
        data: {
          userId,
          listingId: order.listingId,
          kind: 'SWAP_LEG_FAILURE',
          detail: {
            orderId,
            leg,
            reason: reason ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    await this.alerts?.notify({
      roles: SUPPORT,
      kind: 'SUPPORT',
      title: 'Swap leg failed',
      body: `Leg ${leg} failed and needs support.`,
      href: '/support',
      entityType: 'Order',
      entityId: orderId,
    });

    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.DISPUTE_UPDATE,
      title: 'Swap fulfilment issue',
      body: `Leg ${leg} was marked failed. Support will follow up.`,
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, leg, reason },
    });
    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.DISPUTE_UPDATE,
      title: 'Swap fulfilment issue',
      body: `Leg ${leg} was marked failed. Support will follow up.`,
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId, leg, reason },
    });

    return toOrderDto(updated);
  }

  /**
   * Complete swap/give-away when required legs are RECEIVED.
   * Pure swap / give-away: skip payment release.
   * SWAP_CASH with funded escrow: release then complete.
   */
  async completeSwapOrGiveaway(
    orderId: string,
    actorUserId: string | null,
  ): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (!this.legsFullyReceived(order)) {
      throw new ConflictException('Not all required legs are RECEIVED');
    }
    if (order.status === 'COMPLETED') return toOrderDto(order);

    if (this.isNonCashTransaction(order) || order.amountKobo === 0) {
      // Pure swap / give-away — no PaymentsService calls
      return this.finalizeCompleted(orderId, actorUserId, 'swap_legs_complete');
    }

    // SWAP_CASH: release escrow if funded; otherwise wait for payment
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: ['SUCCESS', 'RELEASED'] } },
    });
    if (payment && payment.status !== 'RELEASED') {
      return this.releaseEscrow(orderId, actorUserId, 'swap_legs_complete');
    }
    if (payment?.status === 'RELEASED') {
      return this.finalizeCompleted(orderId, actorUserId, 'swap_legs_complete');
    }

    // Legs done but cash not funded yet — leave PAYMENT_PENDING; complete after fund
    this.notifications.log('order.swap_legs_awaiting_payment', {
      orderId,
      status: order.status,
    });
    return toOrderDto(order);
  }

  async autoReleaseDue(now = new Date()): Promise<number> {
    // Only after dispatch/delivery progress — never release from FUNDED alone
    // (buyer must have had a chance to receive, or seller marked handover).
    const due = await this.prisma.order.findMany({
      where: {
        status: { in: ['SHIPPED', 'HANDED_OVER', 'DELIVERED'] },
        autoReleaseAt: { lte: now },
      },
      select: { id: true },
    });

    let count = 0;
    for (const row of due) {
      try {
        await this.releaseEscrow(row.id, null, 'auto_release');
        count++;
      } catch (err) {
        this.logger.warn(
          `Auto-release failed for ${row.id}: ${(err as Error).message}`,
        );
      }
    }
    if (count > 0) {
      this.logger.log(`Auto-released ${count} order(s)`);
    }
    return count;
  }

  async requireOrder(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private isPostFunded(status: OrderStatus): boolean {
    return [
      'IN_AUTHENTICATION',
      'SHIPPED',
      'HANDED_OVER',
      'DELIVERED',
      'RECEIVED',
      'COMPLETED',
      'DISPUTE_HOLD',
      'REFUND_REQUESTED',
      'REFUND_ISSUED',
    ].includes(status);
  }

  /** Load order with escrow/lifecycle enrichment for API responses. */
  async toEnrichedOrderDto(orderId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        meetPoint: true,
        addressDisclosure: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        payouts: { orderBy: { createdAt: 'desc' }, take: 1 },
        deliveryShipment: { select: { status: true } },
        listing: { select: { title: true } },
      },
    });
    const paymentStatus = order.payments?.[0]?.status ?? null;
    const payoutStatus = order.payouts?.[0] ? 'RELEASED' : null;
    const deliveryStatus = order.deliveryShipment?.status ?? null;
    const base = toOrderDto(order);
    return {
      ...base,
      listingTitle: order.listing?.title?.trim() || null,
      deliveryStatus,
      lifecycle: buildOrderLifecycle({
        status: order.status,
        fulfilmentMethod: order.fulfilmentMethod,
        deliveryStatus,
      }),
      escrow: buildEscrowSnapshot({
        orderStatus: order.status,
        paymentStatus,
        payoutStatus,
      }),
    };
  }
}
