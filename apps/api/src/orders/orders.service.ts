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
  Payment,
  Payout,
  PayoutTransferStatus,
  Prisma,
  Refund,
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
import { newOrderReference } from '../common/transaction-reference';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BULKY_DELIVERY_RATES,
  computeDeliveryFeeKobo,
  DELIVERY_PROVIDER,
  isBulkyDeliveryCategory,
  type DeliveryProvider,
} from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';
import { MockPsp } from '../providers/mock-psp';
import {
  isPspRejection,
  transferReferenceFor,
  type MoneyOpResult,
  type TransferCheck,
} from '../providers/payment.provider';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { ReferralsService } from '../referrals/referrals.service';
import { TrustScoreService } from '../reviews/trust-score.service';
import { LuxuryAuthService } from '../verticals/luxury-auth.service';
import { HomeCache } from '../home/home.cache';
import { SwapProposalsService } from '../swap/swap-proposals.service';
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

/** First transfer is rel_{paymentRef}. A retry uses the next suffix. */
/**
 * Attempt number for the next seller transfer on a payment. The first send is
 * attempt 1 (`rel_<ref>`), retries are `rel_<ref>_2`, `_3`… Anything else
 * (including the old uppercase references) moves straight to a fresh number.
 */
function nextTransferAttempt(
  paymentReference: string,
  previous: string | null,
): number {
  if (!previous) return 1;
  const base = transferReferenceFor(paymentReference);
  if (previous === base) return 2;
  if (previous.startsWith(`${base}_`)) {
    const n = Number(previous.slice(base.length + 1));
    if (Number.isInteger(n) && n >= 2) return n + 1;
  }
  return 2;
}

/** After this long a transfer Paystack has never heard of is treated as not sent. */
const TRANSFER_NOT_FOUND_GRACE_MS = 30 * 60_000;

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
  reference: string;
  listingId: string;
  listingTitle?: string | null;
  buyerId: string;
  sellerId: string;
  /** Payer user id (buyer on standard sales). */
  payerId: string;
  /** Payee user id (seller on standard sales). */
  payeeId: string;
  offerId: string | null;
  orderIntentId: string | null;
  paymentId: string | null;
  paymentReference: string | null;
  amountKobo: number;
  protectionFeeKobo: number;
    deliveryFeeKobo: number;
  swapFeeKobo: number;
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
  swap?: {
    deliveryOn: string | null;
    youReceive: { id: string; title: string; imageUrl: string | null };
    youSend: { id: string; title: string; imageUrl: string | null };
    /** False once either person has paid. The other person then has to pay too. */
    cancellable: boolean;
    /** This viewer's unpaid swap order, including when they opened the other person's order. */
    payableOrderId: string | null;
  } | null;
  /** Escrow journey stages for UI. */
  lifecycle?: OrderLifecycleStage[];
  escrow?: EscrowSnapshot;
  deliveryStatus?: string | null;
  /** Unpaid orders expire at this time (ISO). Null once paid or closed. */
  paymentDueAt?: string | null;
  /** Refunds on this order, newest first. */
  refunds?: {
    id: string;
    amountKobo: number;
    status: string;
    reason: string | null;
    createdAt: Date;
  }[];
  /** True while buyer or seller may cancel a paid order for a full refund. */
  paidCancellable?: boolean;
};

function toOrderDto(
  o: Order & {
    reference?: string;
    paymentId?: string | null;
    payment?: { reference: string } | null;
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
    reference: o.reference,
    listingId: o.listingId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    payerId: o.buyerId,
    payeeId: o.sellerId,
    offerId: o.offerId,
    orderIntentId: o.orderIntentId,
    paymentId: o.paymentId ?? null,
    paymentReference: o.payment?.reference ?? null,
    amountKobo: o.amountKobo,
    protectionFeeKobo: o.protectionFeeKobo,
    deliveryFeeKobo: o.deliveryFeeKobo,
    swapFeeKobo: o.swapFeeKobo ?? 0,
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
  };
}

/** Paid but not yet handed over or shipped: either side may cancel for a full refund. */
const PAID_CANCELLABLE_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'FUNDED',
  'IN_AUTHENTICATION',
]);

/** Payment states escrow can still be paid out from. */
const RELEASABLE_PAYMENT_STATUSES = ['SUCCESS', 'RELEASED', 'PARTIALLY_REFUNDED'];

/** One refund request as recorded on Payment.providerPayload.refunds. */
type RefundTrail = {
  refundId: string;
  providerRef: string | null;
  amountKobo: number;
  statusBefore: string;
  requestedAt: string;
};

export type RefundWebhookInput = {
  /** The charge reference (Paystack `transaction_reference`). */
  paymentReference: string;
  /** e.g. `refund.processed`, `refund.failed`, `refund.needs-attention`. */
  event: string;
  /** Paystack refund id, when present. */
  providerRef?: string | null;
  amountKobo?: number | null;
};

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
    @Optional() private readonly inventory?: InventoryService,
    @Optional() private readonly alerts?: AdminAlertsService,
    @Optional() private readonly homeCache?: HomeCache,
    @Optional() private readonly swaps?: SwapProposalsService,
  ) {}

  /** Home rails are cached. Drop that copy after stock changes so the next visit reads the database. */
  private async refreshHomeRails(): Promise<void> {
    await this.homeCache?.clear();
  }

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

  /** Hours a confirmed, unpaid order holds stock before it expires. */
  private paymentWindowHours(): number {
    const n = Number(this.config.get('ORDER_PAYMENT_WINDOW_HOURS') ?? 24);
    return Number.isFinite(n) && n > 0 ? n : 24;
  }

  private coverageDays(): number {
    return Number(this.config.get('BUYER_PROTECTION_COVERAGE_DAYS') ?? 7);
  }

  async create(
    buyerId: string,
    dto: CreateOrderDto,
    opts?: { skipEmail?: boolean; checkoutId?: string },
  ): Promise<OrderDto> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      include: { category: { select: { slug: true } } },
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
    const quantity = Math.min(
      999,
      Math.max(1, dto.quantity ?? 1),
    );
    const unitPriceKobo = amountKobo;
    if (!negotiated && listing.sellingMode !== 'SELL') {
      throw new BadRequestException('This listing is not sold by the unit');
    }
    if (
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

    // Every order ships with ReWorth delivery. Fee is from seller pickup (listing geo) to buyer.
    const fromLat = listing.geoLat ?? 6.5244;
    const fromLng = listing.geoLng ?? 3.3792;
    const toLat = dto.toLat ?? fromLat + 0.02;
    const toLng = dto.toLng ?? fromLng + 0.02;
    const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
    const deliveryFeeKobo = computeDeliveryFeeKobo(
      distanceKm,
      isBulkyDeliveryCategory(listing.category?.slug)
        ? BULKY_DELIVERY_RATES
        : undefined,
    );

    const totalKobo = computeOrderTotalKobo({
      amountKobo,
      protectionFeeKobo,
      deliveryFeeKobo,
    });

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          reference: newOrderReference(),
          listingId: dto.listingId,
          buyerId,
          sellerId: listing.sellerId,
          offerId: offerId ?? null,
          orderIntentId: orderIntentId ?? null,
          checkoutId: opts?.checkoutId ?? null,
          amountKobo,
          quantity,
          unitPriceKobo,
          protectionFeeKobo,
          deliveryFeeKobo,
          totalKobo,
          fulfilmentMethod: FulfilmentMethod.DELIVERY,
          meetPointId: null,
          status: 'PAYMENT_PENDING',
          confirmationStatus: 'CONFIRMED',
          deliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          buyerProtection: true,
        },
      });

      if (deliveryFeeKobo > 0) {
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
            confirmationStatus: 'CONFIRMED',
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

    await this.refreshHomeRails();
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
      body: `You ordered ${quantity} × ${title}. Pay to send it to a rider. Delivery is set for tomorrow.`,
      deepLink: orderLink,
      channels,
      meta: { orderId: order.id, quantity, listingId: listing.id },
    });
    await this.notifications.notify({
      userId: listing.sellerId,
      category: NotificationCategory.ORDER_PLACED,
      title: 'New order',
      body: `A buyer ordered ${quantity} × ${title}. They can pay now. Delivery is set for tomorrow, and the units stay reserved until they pay or cancel.`,
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
          `You placed ${orders.length} orders. Pay each one to send it to a rider. Delivery is set for tomorrow.`,
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
          title: 'New orders',
          body: [
            `A buyer placed ${sellerOrders.length} orders with you. They can pay now. Delivery is set for tomorrow, and the units stay reserved until they pay or cancel.`,
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
        body: `You ordered ${order.quantity} × ${title}. Pay to send it to a rider. Delivery is set for tomorrow.`,
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
      title: 'New order',
      body: `A buyer ordered ${order.quantity} × ${title}. They can pay now. Delivery is set for tomorrow, and the units stay reserved until they pay or cancel.`,
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
    return Promise.all(rows.map((r) => this.toEnrichedOrderDto(r.id, userId)));
  }

  /**
   * Seller wallet. Escrow is the item amount still held. Withdrawn is money
   * Paystack has paid into the seller's bank. Sending and failed stay visible
   * so a transfer does not disappear between those two.
   */
  async sellerWallet(sellerId: string): Promise<{
    escrowKobo: number;
    sendingKobo: number;
    withdrawnKobo: number;
    failedKobo: number;
    entries: {
      orderId: string;
      reference: string;
      title: string;
      amountKobo: number;
      at: string;
      state: 'escrow' | 'sending' | 'paid' | 'failed';
    }[];
  }> {
    const held = await this.prisma.order.findMany({
      where: {
        sellerId,
        status: {
          in: [
            'FUNDED',
            'IN_AUTHENTICATION',
            'SHIPPED',
            'HANDED_OVER',
            'DELIVERED',
            'RECEIVED',
            'DISPUTE_HOLD',
            'REFUND_REQUESTED',
          ],
        },
        payments: { some: { status: 'SUCCESS' } },
      },
      select: {
        id: true,
        reference: true,
        amountKobo: true,
        updatedAt: true,
        listing: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const payouts = await this.prisma.payout.findMany({
      where: { order: { sellerId } },
      select: {
        netKobo: true,
        status: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            reference: true,
            listing: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sumStatus = (status: PayoutTransferStatus) =>
      payouts
        .filter((row) => row.status === status)
        .reduce((total, row) => total + row.netKobo, 0);

    const entries = [
      ...held.map((order) => ({
        orderId: order.id,
        reference: order.reference,
        title: order.listing?.title?.trim() || 'Item',
        amountKobo: order.amountKobo,
        at: order.updatedAt.toISOString(),
        state: 'escrow' as const,
      })),
      ...payouts.map((row) => ({
        orderId: row.order.id,
        reference: row.order.reference,
        title: row.order.listing?.title?.trim() || 'Item',
        amountKobo: row.netKobo,
        at: row.createdAt.toISOString(),
        state:
          row.status === PayoutTransferStatus.PAID
            ? ('paid' as const)
            : row.status === PayoutTransferStatus.FAILED
              ? ('failed' as const)
              : ('sending' as const),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 20);

    return {
      escrowKobo: held.reduce((total, order) => total + order.amountKobo, 0),
      sendingKobo: sumStatus(PayoutTransferStatus.PROCESSING),
      withdrawnKobo: sumStatus(PayoutTransferStatus.PAID),
      failedKobo: sumStatus(PayoutTransferStatus.FAILED),
      entries,
    };
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
    const dto = await this.toEnrichedOrderDto(orderId, userId);
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
      // Conditional so a cancel landing at the same moment cannot be overwritten.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status: nextStatus },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This order changed. Refresh and try again.');
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          type: nextStatus,
          actorUserId: sellerId,
          payload: { fulfilmentMethod: order.fulfilmentMethod },
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
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
    if (order.status === 'RECEIVED') {
      return this.toEnrichedOrderDto(orderId, buyerId);
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
    await this.notifyCoverStarted(order, coverageEndsAt, false);
    // The seller is paid when buyer protection ends (releaseAfterCover).
    return this.toEnrichedOrderDto(orderId, buyerId);
  }

  /** Tell both sides the protection window started and when the seller gets paid. */
  private async notifyCoverStarted(
    order: Order,
    coverageEndsAt: Date,
    deemed: boolean,
  ): Promise<void> {
    const when = coverageEndsAt.toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    const deepLink = `reworth://orders/${order.id}`;
    try {
      await this.notifications.notify({
        userId: order.buyerId,
        category: NotificationCategory.DELIVERY_UPDATE,
        title: deemed ? 'Order marked as received' : 'Thanks for confirming',
        body: deemed
          ? `We marked your order as received because it was handed over ${this.autoReleaseDays()} days ago. If something is wrong, report a problem before ${when}.`
          : `Buyer protection covers this order until ${when}. Report a problem before then if anything is wrong.`,
        deepLink,
        meta: { orderId: order.id, coverageEndsAt: coverageEndsAt.toISOString() },
      });
      await this.notifications.notify({
        userId: order.sellerId,
        category: NotificationCategory.PAYMENT_RELEASED,
        title: deemed ? 'Order marked as received' : 'Buyer confirmed receipt',
        body: `Your payout of ${formatNaira(order.amountKobo)} is sent on ${when} if the buyer does not report a problem.`,
        deepLink,
        meta: { orderId: order.id, coverageEndsAt: coverageEndsAt.toISOString() },
      });
    } catch (err) {
      this.logger.warn(
        `Cover notice failed for ${order.id}: ${(err as Error).message}`,
      );
    }
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
      title: 'Awaiting payment',
      body: note
        ? `The seller accepted ${order.quantity} × ${title}. Delivery date: ${when}. Note: ${note}. Pay within ${this.paymentWindowHours()} hours or the order expires.`
        : `The seller accepted ${order.quantity} × ${title}. Delivery date: ${when}. Pay within ${this.paymentWindowHours()} hours or the order expires.`,
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

    await this.refreshHomeRails();
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

  /**
   * Cancel an order.
   * - Before payment: buyer only (sellers reject instead); stock is released.
   * - Paid, before handover/shipping: buyer or seller; full refund.
   * - Swaps: either participant, before payment only.
   */
  async cancel(
    orderId: string,
    userId: string,
    reason?: string,
  ): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (
      order.transactionType === 'SWAP' &&
      order.swapProposalId &&
      this.swaps
    ) {
      if (order.buyerId !== userId && order.sellerId !== userId) {
        throw new ForbiddenException('Not a swap participant');
      }
      if (!['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
        throw new ConflictException('Can only cancel before payment');
      }
      await this.abandonPendingPayments(orderId);
      await this.swaps.cancel(order.swapProposalId, userId);
      await this.refreshHomeRails();
      return toOrderDto(await this.requireOrder(orderId));
    }
    if (PAID_CANCELLABLE_STATUSES.has(order.status)) {
      return this.cancelPaid(order, userId, reason);
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can cancel');
    }
    if (!['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
      throw new ConflictException(
        'This order has already been handed over or shipped. Open a dispute if something is wrong.',
      );
    }
    OrderStateMachine.assertTransition(order.status, 'CANCELLED');
    await this.abandonPendingPayments(orderId);
    return this.cancelUnpaid(order, userId);
  }

  /**
   * Close an unpaid order and give its reserved units back.
   * `actorUserId` null means the payment window ran out.
   */
  private async cancelUnpaid(
    order: Order,
    actorUserId: string | null,
  ): Promise<OrderDto> {
    const orderId = order.id;
    const expired = actorUserId === null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['CREATED', 'PAYMENT_PENDING'] } },
        data: { status: 'CANCELLED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This order is no longer awaiting payment');
      }
      if (this.inventory && !order.inventoryCommitted) {
        await this.inventory.releaseStock(
          tx,
          order.listingId,
          order.quantity ?? 1,
          actorUserId,
        );
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          type: expired ? 'PAYMENT_EXPIRED' : 'CANCELLED',
          actorUserId,
          ...(expired
            ? { payload: { windowHours: this.paymentWindowHours() } }
            : {}),
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });

    await this.refreshHomeRails();
    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { title: true },
    });
    const title = listing?.title?.trim() || 'a listing';
    const qty = order.quantity ?? 1;
    await this.notifications.notify({
      userId: order.sellerId,
      category: NotificationCategory.ORDER_CANCELLED,
      title: expired ? 'Order expired' : 'Order cancelled',
      body: expired
        ? `The buyer did not pay for ${qty} × ${title} in time. Those units are available again.`
        : `The buyer cancelled ${qty} × ${title} before paying. Those units are available again.`,
      deepLink: `reworth://orders/${orderId}`,
      meta: { orderId },
    });
    if (expired) {
      await this.notifications.notify({
        userId: order.buyerId,
        category: NotificationCategory.ORDER_CANCELLED,
        title: 'Order expired',
        body: `Your order for ${title} was not paid within ${this.paymentWindowHours()} hours, so it was cancelled. You have not been charged.`,
        deepLink: `reworth://orders/${orderId}`,
        meta: { orderId },
      });
    }

    this.notifications.log(expired ? 'order.payment_expired' : 'order.cancelled', {
      orderId,
      buyerId: order.buyerId,
    });
    return toOrderDto(updated);
  }

  /**
   * Buyer or seller cancels a paid order before handover / shipping.
   * The status claim is conditional, so it cannot race a handover: whichever
   * lands first wins. Units go back on sale, the courier job is stopped and
   * the buyer gets everything back (item, protection and delivery fees).
   * If the refund cannot be sent, the order still cancels and finance gets a
   * critical alert to refund by hand.
   */
  private async cancelPaid(
    order: Order,
    userId: string,
    reason?: string,
  ): Promise<OrderDto> {
    const role =
      order.buyerId === userId
        ? 'buyer'
        : order.sellerId === userId
          ? 'seller'
          : null;
    if (!role) throw new ForbiddenException('Not a participant');
    if (order.transactionType === 'SWAP') {
      throw new ConflictException(
        'A paid swap cannot be cancelled here. Open a dispute instead.',
      );
    }
    const note = reason?.trim().slice(0, 500) || null;
    const { refund, owed } = await this.cancelWithRefund(order, {
      fromStatuses: [...PAID_CANCELLABLE_STATUSES],
      actorUserId: userId,
      by: role,
      reason: note,
      notAllowedMessage:
        'This order has already been handed over or shipped. Open a dispute if something is wrong.',
    });

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { title: true },
    });
    const title = listing?.title?.trim() || 'your item';
    const otherParty = role === 'buyer' ? order.sellerId : order.buyerId;
    await this.notifications.notify({
      userId: otherParty,
      category: NotificationCategory.ORDER_CANCELLED,
      title: 'Order cancelled',
      body:
        role === 'buyer'
          ? `The buyer cancelled their paid order for ${title}. Do not hand it over. The units are back on sale.`
          : `The seller cancelled your order for ${title}${note ? `: ${note}` : '.'}`,
      deepLink: `reworth://orders/${order.id}`,
      meta: { orderId: order.id, by: role },
    });
    await this.notifyBuyerRefund(order, refund, owed);
    this.notifications.log('order.cancelled_after_payment', {
      orderId: order.id,
      by: role,
      refundId: refund?.id ?? null,
    });
    return this.toEnrichedOrderDto(order.id, userId);
  }

  /**
   * Dispute resolved as CANCEL: full refund of whatever is left on the charge,
   * units back on sale, courier stopped. Refuses once the seller has been paid.
   * The dispute service notifies both sides.
   */
  async cancelAfterDispute(
    orderId: string,
    adminUserId: string,
    note: string | null,
  ): Promise<{ refund: Refund | null; owed: number }> {
    const order = await this.requireOrder(orderId);
    if (order.transactionType === 'SWAP') {
      throw new ConflictException(
        'A swap dispute cannot be resolved as CANCEL. Use a refund instead.',
      );
    }
    if (await this.sellerPaidOut(orderId)) {
      throw new ConflictException(
        'The seller has already been paid for this order, so it cannot be refunded from escrow.',
      );
    }
    const result = await this.cancelWithRefund(order, {
      fromStatuses: ['DISPUTE_HOLD'],
      actorUserId: adminUserId,
      by: 'admin',
      reason: note,
      notAllowedMessage: 'The order is no longer on dispute hold',
    });
    await this.notifyBuyerRefund(order, result.refund, result.owed);
    return result;
  }

  /**
   * Shared by buyer/seller cancellation and the dispute CANCEL resolution.
   * Claims the status (conditional), puts units back, stops the courier and
   * refunds what is left on the funding payment.
   */
  private async cancelWithRefund(
    order: Order,
    opts: {
      fromStatuses: OrderStatus[];
      actorUserId: string;
      by: 'buyer' | 'seller' | 'admin';
      reason: string | null;
      notAllowedMessage: string;
    },
  ): Promise<{ refund: Refund | null; owed: number }> {
    const payment = await this.fundingPayment(order, [
      'SUCCESS',
      'PARTIALLY_REFUNDED',
    ]);
    if (!payment) {
      throw new ConflictException('No captured payment found for this order');
    }
    const orderId = order.id;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: { in: opts.fromStatuses } },
        data: { status: 'CANCELLED', autoReleaseAt: null },
      });
      if (claimed.count === 0) {
        throw new ConflictException(opts.notAllowedMessage);
      }
      if (this.inventory) {
        await this.inventory.reverseSale(
          tx,
          order.listingId,
          order.quantity ?? 1,
          opts.actorUserId,
        );
      } else {
        const listing = await tx.listing.findUnique({
          where: { id: order.listingId },
        });
        if (listing?.status === 'RESERVED') {
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: 'LIVE' },
          });
        }
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          type:
            opts.by === 'admin' ? 'DISPUTE_CANCELLED' : 'CANCELLED_AFTER_PAYMENT',
          actorUserId: opts.actorUserId,
          payload: {
            by: opts.by,
            reason: opts.reason,
            previousStatus: order.status,
            paymentReference: payment.reference,
          },
        },
      });
    });

    try {
      await this.delivery?.cancelForOrder(orderId, opts.actorUserId);
    } catch (err) {
      this.logger.warn(
        `Courier cancel failed for ${orderId}: ${(err as Error).message}`,
      );
    }

    let refund: Refund | null = null;
    const owed =
      payment.amountKobo - (await this.refundedOrPendingKobo(payment.id));
    if (owed > 0) {
      try {
        refund = await this.refundPayment({
          payment,
          amountKobo: owed,
          reason:
            opts.by === 'admin'
              ? 'dispute_cancel'
              : `order_cancelled_by_${opts.by}`,
          idempotencyKey: `cancel-refund:${orderId}`,
        });
      } catch (err) {
        const message = (err as Error).message;
        this.logger.error(`Cancel refund failed for ${orderId}: ${message}`);
        await this.raiseFinanceAlert(
          'REFUND_REQUEST_FAILED',
          `Order ${order.reference} was cancelled (${opts.by}) but the ${owed} kobo refund on ${payment.reference} could not be sent. Refund it in Paystack.`,
          { orderId, paymentId: payment.id, error: message },
        );
      }
    }
    await this.refreshHomeRails();
    return { refund, owed };
  }

  private async notifyBuyerRefund(
    order: Order,
    refund: Refund | null,
    owed: number,
  ): Promise<void> {
    if (owed <= 0) return;
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.PAYMENT_RECEIVED,
      title: refund ? 'Refund on the way' : 'Refund being arranged',
      body: refund
        ? `We have asked Paystack to return ${formatNaira(owed)} to the card or bank you paid with.`
        : 'Your order was cancelled. Our team is arranging your refund and will update you.',
      deepLink: `reworth://orders/${order.id}`,
      meta: { orderId: order.id },
    });
  }

  /**
   * The payment that funded this order: the one stored on the order, else the
   * oldest captured payment. Never a later duplicate that is being refunded.
   */
  async fundingPayment(
    order: Pick<Order, 'id' | 'paymentId'>,
    statuses: string[] = ['SUCCESS', 'RELEASED'],
  ): Promise<Payment | null> {
    if (order.paymentId) {
      const linked = await this.prisma.payment.findUnique({
        where: { id: order.paymentId },
      });
      if (linked && statuses.includes(linked.status)) return linked;
    }
    return this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        status: { in: statuses as Payment['status'][] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async refundedOrPendingKobo(paymentId: string): Promise<number> {
    const rows = await this.prisma.refund.findMany({
      where: { paymentId, status: { not: 'FAILED' } },
      select: { amountKobo: true },
    });
    return rows.reduce((sum, r) => sum + r.amountKobo, 0);
  }

  /**
   * The one way money goes back to a payer. Used by cancellations, the
   * duplicate-payment auto-refund and dispute resolutions.
   *
   * Idempotent per `idempotencyKey`. The payment's status moves to
   * REFUNDED / PARTIALLY_REFUNDED as soon as the PSP accepts, so escrow
   * release never picks it. The Refund row stays PENDING until Paystack's
   * `refund.processed` webhook (mock PSP settles at once). Throws if the PSP
   * refuses; callers decide how to surface that.
   */
  async refundPayment(input: {
    payment: Payment;
    amountKobo: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<Refund> {
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    const { payment } = input;
    if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }
    const already = await this.refundedOrPendingKobo(payment.id);
    if (already + input.amountKobo > payment.amountKobo) {
      throw new BadRequestException('Refund exceeds what was paid');
    }

    if (this.psp instanceof MockPsp || this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).ensureFunded({
        reference: payment.reference,
        amountKobo: payment.amountKobo,
      });
    }
    const result = await this.psp.refund({
      reference: payment.reference,
      amountKobo: input.amountKobo,
      idempotencyKey: input.idempotencyKey,
    });
    const settled =
      result.status === 'refunded' || result.status === 'partially_refunded';
    const full = already + input.amountKobo >= payment.amountKobo;

    const refund = await this.prisma.$transaction(async (tx) => {
      const row = await tx.refund.create({
        data: {
          orderId: payment.orderId,
          paymentId: payment.id,
          amountKobo: input.amountKobo,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          status: settled ? 'REFUNDED' : 'PENDING',
        },
      });
      const payload = (payment.providerPayload as Record<string, unknown> | null) ?? {};
      const trail = Array.isArray(payload.refunds)
        ? (payload.refunds as RefundTrail[])
        : [];
      const entry: RefundTrail = {
        refundId: row.id,
        providerRef: result.providerRef ?? null,
        amountKobo: input.amountKobo,
        statusBefore: payment.status,
        requestedAt: new Date().toISOString(),
      };
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          providerPayload: {
            ...payload,
            refunds: [...trail, entry],
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    this.notifications.log('refund.requested', {
      refundId: refund.id,
      paymentReference: payment.reference,
      amountKobo: input.amountKobo,
      reason: input.reason,
      settled,
    });
    if (settled) await this.onRefundSettled(refund, payment);
    return refund;
  }

  /** Refund reached the payer. Marks this payment's revenue refunded once fully returned. */
  private async onRefundSettled(refund: Refund, payment: Payment) {
    const rows = await this.prisma.refund.findMany({
      where: { paymentId: payment.id, status: 'REFUNDED' },
      select: { amountKobo: true },
    });
    const returned = rows.reduce((sum, r) => sum + r.amountKobo, 0);
    if (returned >= payment.amountKobo) {
      await this.prisma.revenueLine.updateMany({
        where: { pspReference: payment.reference, status: 'SETTLED' },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
    }
    this.notifications.log('refund.settled', {
      refundId: refund.id,
      paymentReference: payment.reference,
    });
  }

  /**
   * Paystack `refund.*` webhook. Finds our Refund by Paystack refund id (kept
   * on the payment's refund trail), else the oldest PENDING refund of that
   * amount on the charge.
   */
  async applyRefundWebhook(
    input: RefundWebhookInput,
  ): Promise<{ ok: boolean; orderId?: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { reference: input.paymentReference },
    });
    if (!payment) {
      this.logger.warn(`Refund webhook for unknown charge ${input.paymentReference}`);
      return { ok: false };
    }
    const payload = (payment.providerPayload as Record<string, unknown> | null) ?? {};
    const trail = Array.isArray(payload.refunds)
      ? (payload.refunds as RefundTrail[])
      : [];
    let entry = input.providerRef
      ? trail.find((t) => t.providerRef === input.providerRef)
      : undefined;
    let refund: Refund | null = entry
      ? await this.prisma.refund.findUnique({ where: { id: entry.refundId } })
      : null;
    if (!refund) {
      const pending = await this.prisma.refund.findMany({
        where: { paymentId: payment.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      refund =
        pending.find(
          (r) => input.amountKobo == null || r.amountKobo === input.amountKobo,
        ) ?? null;
      entry = refund ? trail.find((t) => t.refundId === refund!.id) : undefined;
    }
    if (!refund) {
      await this.raiseFinanceAlert(
        'REFUND_UNMATCHED',
        `Paystack sent ${input.event} for ${input.paymentReference} but no matching ReWorth refund is pending (refunded from the dashboard?).`,
        { ...input },
        'warning',
      );
      return { ok: true, orderId: payment.orderId };
    }

    if (input.event === 'refund.processed') {
      const claimed = await this.prisma.refund.updateMany({
        where: { id: refund.id, status: 'PENDING' },
        data: { status: 'REFUNDED' },
      });
      if (claimed.count === 1) {
        await this.onRefundSettled(refund, payment);
        await this.notifications.notify({
          userId: payment.payerId,
          category: NotificationCategory.PAYMENT_RECEIVED,
          title: 'Refund completed',
          body: `Paystack has returned ${formatNaira(refund.amountKobo)} to the card or bank you paid with.`,
          deepLink: `reworth://orders/${payment.orderId}`,
          meta: { orderId: payment.orderId, refundId: refund.id },
        });
      }
      return { ok: true, orderId: payment.orderId };
    }

    if (input.event === 'refund.failed') {
      const claimed = await this.prisma.refund.updateMany({
        where: { id: refund.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      if (claimed.count === 1) {
        const stillOut = await this.refundedOrPendingKobo(payment.id);
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status:
              stillOut <= 0
                ? ((entry?.statusBefore as Payment['status']) ?? 'SUCCESS')
                : stillOut >= payment.amountKobo
                  ? 'REFUNDED'
                  : 'PARTIALLY_REFUNDED',
          },
        });
        await this.raiseFinanceAlert(
          'REFUND_FAILED',
          `Paystack could not complete the ${refund.amountKobo} kobo refund on ${payment.reference} (order ${payment.orderId}). Refund it by hand.`,
          { refundId: refund.id, paymentId: payment.id, orderId: payment.orderId },
        );
      }
      return { ok: true, orderId: payment.orderId };
    }

    if (input.event === 'refund.needs-attention') {
      await this.raiseFinanceAlert(
        'REFUND_NEEDS_ATTENTION',
        `Paystack needs the customer's bank details to finish the ${refund.amountKobo} kobo refund on ${payment.reference}. Complete it in the Paystack dashboard.`,
        { refundId: refund.id, paymentId: payment.id, orderId: payment.orderId },
        'warning',
      );
    }
    // refund.pending / refund.processing: nothing to change.
    return { ok: true, orderId: payment.orderId };
  }

  private async raiseFinanceAlert(
    kind: string,
    message: string,
    payload: Record<string, unknown>,
    severity: 'critical' | 'warning' = 'critical',
  ): Promise<void> {
    try {
      await this.prisma.financeAlert.create({
        data: {
          kind,
          severity,
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

  /** When an unpaid order expires: seller confirmation (or creation) + window. */
  private async paymentDueAt(order: Pick<Order, 'id' | 'createdAt'>): Promise<Date> {
    const confirmed = await this.prisma.orderEvent.findFirst({
      where: { orderId: order.id, type: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const from = confirmed?.createdAt ?? order.createdAt;
    return new Date(from.getTime() + this.paymentWindowHours() * 3_600_000);
  }

  /**
   * Cancels confirmed orders nobody paid for within the window and frees the
   * stock. An open checkout that Paystack says was paid is left alone: the
   * webhook or buyer return funds it. Swaps are left to their own expiry.
   */
  async expireUnpaid(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.paymentWindowHours() * 3_600_000);
    const candidates = await this.prisma.order.findMany({
      where: {
        status: 'PAYMENT_PENDING',
        transactionType: { not: 'SWAP' },
        createdAt: { lte: cutoff },
      },
      take: 200,
      orderBy: { createdAt: 'asc' },
    });
    let count = 0;
    for (const order of candidates) {
      try {
        if ((await this.paymentDueAt(order)).getTime() > now.getTime()) continue;
        await this.abandonPendingPayments(order.id);
        await this.cancelUnpaid(order, null);
        count++;
      } catch (err) {
        this.logger.warn(
          `Unpaid expiry skipped ${order.id}: ${(err as Error).message}`,
        );
      }
    }
    if (count > 0) this.logger.log(`Expired ${count} unpaid order(s)`);
    return count;
  }

  /**
   * Before a buyer cancels, check every open checkout with the PSP.
   * A charge that already went through blocks the cancel: the webhook or the
   * buyer return funds the order. Open checkouts are marked FAILED; if the
   * buyer pays one later anyway, PaymentsService refunds it.
   */
  private async abandonPendingPayments(orderId: string): Promise<void> {
    const pending = await this.prisma.payment.findMany({
      where: { orderId, status: 'PENDING' },
    });
    for (const payment of pending) {
      const verified = await this.psp.verify(payment.reference);
      if (verified.status === 'success') {
        throw new ConflictException(
          'This order has already been paid, so it cannot be cancelled. Refresh the order.',
        );
      }
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          providerPayload: {
            ...((payment.providerPayload as object | null) ?? {}),
            abandonedAt: new Date().toISOString(),
            abandonReason: 'order_cancelled',
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  /**
   * Called from payment webhook on success. Idempotent.
   *
   * `paymentId` is the payment that captured the money. The first payment to
   * fund the order is stored on `order.paymentId`; a later payment for the same
   * order finds the order already funded by another payment and is refunded
   * by PaymentsService.
   */
  async markFunded(
    orderId: string,
    paymentReference: string,
    paymentId?: string,
  ): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.status === 'FUNDED' || this.isPostFunded(order.status)) {
      return toOrderDto(order);
    }
    OrderStateMachine.assertTransition(order.status, 'FUNDED');

    const autoReleaseAt = new Date(
      Date.now() + this.autoReleaseDays() * 24 * 60 * 60 * 1000,
    );
    const fundedAt = new Date();

    const funded = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: 'PAYMENT_PENDING' },
        data: {
          status: 'FUNDED',
          fundedAt,
          autoReleaseAt,
          ...(paymentId ? { paymentId } : {}),
          ...(this.inventory ? { inventoryCommitted: true } : {}),
        },
      });
      if (claimed.count === 0) {
        // Another payment or request funded it first. Do not repeat side effects.
        return {
          claimed: false as const,
          row: await tx.order.findUniqueOrThrow({ where: { id: orderId } }),
        };
      }

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'FUNDED',
          payload: {
            paymentReference,
            payerId: order.buyerId,
            autoReleaseAt,
          },
        },
      });

      if (order.transactionType === TransactionType.GIVEAWAY) {
        const qty = 1;
        const taken = await tx.listing.updateMany({
          where: {
            id: order.listingId,
            quantityAvailable: { gte: qty },
            status: { in: ['LIVE', 'RESERVED'] },
          },
          data: {
            quantityAvailable: { decrement: qty },
            quantitySold: { increment: qty },
          },
        });
        if (taken.count !== 1) {
          throw new ConflictException('This gift has already been claimed');
        }
        if (order.giveawayClaimId) {
          await tx.giveawayClaim.update({
            where: { id: order.giveawayClaimId },
            data: { status: 'APPROVED', reviewedAt: fundedAt },
          });
        }
        await tx.orderEvent.create({
          data: {
            orderId,
            type: 'GIFT_UNIT_DEDUCTED',
            actorUserId: order.buyerId,
            payload: {
              payerId: order.buyerId,
              listingId: order.listingId,
              units: qty,
              paymentReference,
            },
          },
        });
        if (this.inventory) {
          await this.inventory.syncVisibility(
            tx,
            order.listingId,
            order.buyerId,
            'gift_paid',
          );
        }
      } else if (this.inventory) {
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

      return {
        claimed: true as const,
        row: await tx.order.findUniqueOrThrow({ where: { id: orderId } }),
      };
    });
    if (!funded.claimed) return toOrderDto(funded.row);
    const updated = funded.row;

    await this.refreshHomeRails();
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

    const listing = await this.prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { title: true },
    });
    const title = listing?.title?.trim() || 'Your item';
    const qty = order.quantity ?? 1;
    const receiptLines = [
      `Order reference (give this to your courier): ${order.reference}`,
      '',
      `${qty} × ${title}`,
      `Items (${formatNaira(order.unitPriceKobo || Math.round(order.amountKobo / qty))} per unit): ${formatNaira(order.amountKobo)}`,
      `Buyer protection: ${formatNaira(order.protectionFeeKobo)}`,
      `Delivery: ${formatNaira(order.deliveryFeeKobo)}`,
      `Total paid: ${formatNaira(order.totalKobo)}`,
      '',
      `Payment reference: ${paymentReference}`,
    ];
    await this.notifications.notify({
      userId: order.buyerId,
      category: NotificationCategory.PAYMENT_RECEIVED,
      title: `Receipt — ${order.reference}`,
      body: receiptLines.join('\n'),
      deepLink: `reworth://orders/${orderId}`,
      channels: [NotificationChannel.EMAIL],
      forceDelivery: true,
      meta: { orderId, paymentReference, orderReference: order.reference },
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

    if (this.luxuryAuth) {
      const refreshed = await this.requireOrder(orderId);
      if (refreshed.status === 'IN_AUTHENTICATION') {
        return toOrderDto(refreshed);
      }
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
      if (existingPayout.status === PayoutTransferStatus.FAILED) {
        // A refund may have landed since; the seller's retry must pay the new share.
        const pay = await this.fundingPayment(order, RELEASABLE_PAYMENT_STATUSES);
        if (pay) {
          const net = Math.max(
            0,
            order.amountKobo - (await this.refundedOrPendingKobo(pay.id)),
          );
          if (net !== existingPayout.netKobo) {
            await this.prisma.payout.update({
              where: { id: existingPayout.id },
              data: { netKobo: net, feesKobo: existingPayout.grossKobo - net },
            });
          }
        }
      }
      if (order.status !== 'COMPLETED') {
        return this.finalizeCompleted(orderId, actorUserId, reason);
      }
      return toOrderDto(order);
    }

    const order = await this.requireOrder(orderId);
    // Money leaves escrow only after buyer protection (RECEIVED, cover over)
    // or by an admin dispute decision (DISPUTE_HOLD).
    if (order.status !== 'RECEIVED' && order.status !== 'DISPUTE_HOLD') {
      throw new ConflictException(
        `Escrow cannot be released while the order is ${order.status}`,
      );
    }
    if (
      reason === 'cover_ended' &&
      order.coverageEndsAt &&
      order.coverageEndsAt.getTime() > Date.now()
    ) {
      throw new ConflictException('Buyer protection has not ended yet');
    }
    const payment = await this.fundingPayment(order, RELEASABLE_PAYMENT_STATUSES);
    if (!payment) {
      throw new ConflictException('No successful payment to release');
    }
    if (payment.status === 'RELEASED') {
      return this.finalizeCompleted(orderId, actorUserId, reason);
    }
    // A partial dispute refund comes out of the seller's share.
    const sellerNetKobo = Math.max(
      0,
      order.amountKobo - (await this.refundedOrPendingKobo(payment.id)),
    );
    if (sellerNetKobo <= 0) {
      throw new ConflictException('Nothing is left to pay the seller');
    }

    if (this.psp instanceof MockPsp || this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).ensureFunded({
        reference: payment.reference,
        amountKobo: payment.amountKobo,
      });
    }

    const account = await this.prisma.sellerPayoutAccount.findUnique({
      where: { userId: order.sellerId },
    });
    if (!account?.verifiedAt) {
      await this.notifyPayoutBlockedOncePerDay(order.sellerId, orderId);
      throw new ConflictException(
        'The seller has no verified bank account, so this payout was not sent.',
      );
    }

    const bankChanged =
      account.paystackRecipientCode != null &&
      (account.paystackRecipientBankCode !== account.bankCode ||
        account.paystackRecipientAccountNumber !== account.accountNumber);
    const accountName =
      account.nibssAccountName.trim() ||
      [account.firstName, account.middleName, account.lastName]
        .filter(Boolean)
        .join(' ');

    const netKobo = sellerNetKobo;
    const grossKobo = order.amountKobo + order.protectionFeeKobo;
    const feesKobo = grossKobo - netKobo;
    const transferReference = transferReferenceFor(payment.reference);

    // A transfer may already exist from an attempt that crashed before it was
    // recorded (including the old uppercase reference). Never send twice.
    // If Paystack cannot be reached this throws and the job tries later.
    const earlier = await this.findExistingTransfer([
      `rel_${payment.reference}`,
      transferReference,
    ]);

    // Write-ahead: record the payout (PROCESSING) and claim the order before
    // any money moves. The unique claim key stops two releases racing.
    let payout: Payout;
    try {
      payout = await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyRecord.create({
          data: {
            key: `payout-claim:${orderId}`,
            operation: 'payout_claim',
            responseJson: {
              transferReference: earlier?.reference ?? transferReference,
              netKobo,
            } as Prisma.InputJsonValue,
          },
        });
        return tx.payout.create({
          data: {
            orderId,
            grossKobo,
            feesKobo,
            netKobo,
            status: PayoutTransferStatus.PROCESSING,
            pspReference: earlier?.reference ?? transferReference,
          },
        });
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        // Another release holds the claim; it finishes the order.
        return toOrderDto(await this.requireOrder(orderId));
      }
      throw err;
    }

    if (earlier) {
      this.logger.warn(
        `Order ${orderId}: transfer ${earlier.reference} already at Paystack (${earlier.check.status}); recording it instead of sending again`,
      );
      await this.applyTransferCheck(payout, earlier.check, { notFoundFails: false });
      await this.markPaymentReleased(payment, { recoveredTransfer: earlier });
      return this.finalizeCompleted(orderId, actorUserId, reason);
    }

    let releaseResult: MoneyOpResult;
    try {
      releaseResult = await this.psp.release({
        reference: payment.reference,
        amountKobo: netKobo,
        idempotencyKey: idemKey,
        transferReference,
        recipient: {
          recipientCode: bankChanged
            ? undefined
            : (account.paystackRecipientCode ?? undefined),
          accountName,
          accountNumber: account.accountNumber,
          bankCode: account.bankCode,
        },
      });
    } catch (err) {
      const outcome = await this.settleUncertainTransfer(payout, err);
      await this.markPaymentReleased(payment, {
        releaseError: (err as Error).message,
      });
      if (outcome === PayoutTransferStatus.FAILED) {
        await this.onPayoutFailed(payout, order.sellerId, (err as Error).message);
      }
      // The money is committed to the seller either way; the payout row
      // tracks the transfer (retry button on FAILED, reconciler on PROCESSING).
      return this.finalizeCompleted(orderId, actorUserId, reason);
    }

    const payoutStatus =
      this.psp.name === 'mock-psp' || releaseResult.status === 'released'
        ? PayoutTransferStatus.PAID
        : PayoutTransferStatus.PROCESSING;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.payout.update({
          where: { id: payout.id },
          data: {
            status: payoutStatus,
            pspReference: releaseResult.providerRef ?? transferReference,
            failureReason: null,
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            // Keep PARTIALLY_REFUNDED visible after a split dispute.
            status:
              payment.status === 'PARTIALLY_REFUNDED'
                ? 'PARTIALLY_REFUNDED'
                : 'RELEASED',
            providerPayload: {
              ...(payment.providerPayload as object),
              release: releaseResult,
            } as Prisma.InputJsonValue,
          },
        });
        if (
          releaseResult.recipientCode &&
          releaseResult.recipientCode !== account.paystackRecipientCode
        ) {
          await tx.sellerPayoutAccount.update({
            where: { id: account.id },
            data: {
              paystackRecipientCode: releaseResult.recipientCode,
              paystackRecipientBankCode: account.bankCode,
              paystackRecipientAccountNumber: account.accountNumber,
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
    } catch (err) {
      // Paystack has the transfer; the PROCESSING payout row already carries
      // its reference, so the reconciler / transfer webhook will settle it
      // and the next release run finishes the order. Never resend.
      this.logger.error(
        `Payout ${payout.id} sent (${transferReference}) but saving the result failed: ${(err as Error).message}`,
      );
      throw err;
    }

    return this.finalizeCompleted(orderId, actorUserId, reason);
  }

  /** First of `references` Paystack already has a transfer for, if any. */
  private async findExistingTransfer(
    references: string[],
  ): Promise<{ reference: string; check: TransferCheck } | null> {
    for (const reference of [...new Set(references)]) {
      const check = await this.psp.verifyTransfer(reference);
      if (check.status !== 'not_found') return { reference, check };
    }
    return null;
  }

  /**
   * release() threw. A definite rejection marks the payout FAILED. Anything
   * else (timeout, 5xx) may still have created the transfer, so ask Paystack;
   * if it cannot say, the payout stays PROCESSING for the reconciler.
   */
  private async settleUncertainTransfer(
    payout: Payout,
    err: unknown,
  ): Promise<PayoutTransferStatus> {
    const message = (err as Error)?.message ?? String(err);
    this.logger.warn(`Payout ${payout.id} transfer error: ${message}`);
    if (isPspRejection(err)) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutTransferStatus.FAILED, failureReason: message },
      });
      return PayoutTransferStatus.FAILED;
    }
    let check: TransferCheck;
    try {
      check = await this.psp.verifyTransfer(payout.pspReference ?? '');
    } catch (verifyErr) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { failureReason: `unconfirmed: ${message}` },
      });
      return PayoutTransferStatus.PROCESSING;
    }
    return this.applyTransferCheck(payout, check, { notFoundFails: false });
  }

  /**
   * Writes what Paystack says about a payout's transfer onto the row.
   * `not_found` only fails the payout once it has been missing for the grace
   * period (`notFoundFails`), so a transfer still in flight is not resent.
   */
  private async applyTransferCheck(
    payout: Payout,
    check: TransferCheck,
    opts: { notFoundFails: boolean },
  ): Promise<PayoutTransferStatus> {
    if (check.status === 'success') {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutTransferStatus.PAID, failureReason: null },
      });
      return PayoutTransferStatus.PAID;
    }
    if (check.status === 'failed' || check.status === 'reversed') {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutTransferStatus.FAILED,
          failureReason: `Paystack transfer ${check.raw ?? check.status}`,
        },
      });
      return PayoutTransferStatus.FAILED;
    }
    if (check.status === 'not_found') {
      const marker = /^not_found_since:(.+)$/.exec(payout.failureReason ?? '');
      const since = marker ? new Date(marker[1]) : null;
      if (
        opts.notFoundFails &&
        since &&
        Date.now() - since.getTime() >= TRANSFER_NOT_FOUND_GRACE_MS
      ) {
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: PayoutTransferStatus.FAILED,
            failureReason: 'Paystack has no record of this transfer',
          },
        });
        return PayoutTransferStatus.FAILED;
      }
      if (!since) {
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: { failureReason: `not_found_since:${new Date().toISOString()}` },
        });
      }
      return PayoutTransferStatus.PROCESSING;
    }
    // pending / otp
    return PayoutTransferStatus.PROCESSING;
  }

  private async markPaymentReleased(
    payment: Payment,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status:
          payment.status === 'PARTIALLY_REFUNDED' ? 'PARTIALLY_REFUNDED' : 'RELEASED',
        providerPayload: {
          ...((payment.providerPayload as object | null) ?? {}),
          release: extra,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async onPayoutFailed(
    payout: Payout,
    sellerId: string,
    reason: string,
  ): Promise<void> {
    await this.notifyPayoutProblem(
      sellerId,
      payout.orderId,
      'Payout was not sent',
      'The bank transfer did not go through. Check your bank details, then tap Retry payout on the order.',
    );
    await this.raiseFinanceAlert(
      'PAYOUT_FAILED',
      `Seller payout ${payout.id} (${payout.netKobo} kobo, order ${payout.orderId}) failed: ${reason}. Check the Paystack balance and transfer settings.`,
      { payoutId: payout.id, orderId: payout.orderId, reason },
      'warning',
    );
  }

  /**
   * Settles payouts left PROCESSING: transfers still pending at Paystack,
   * transfer webhooks that never arrived, and sends whose result could not be
   * saved. Finishes orders a crashed release left unfinished.
   */
  async reconcileProcessingPayouts(now = new Date()): Promise<number> {
    const rows = await this.prisma.payout.findMany({
      where: {
        status: PayoutTransferStatus.PROCESSING,
        createdAt: { lte: new Date(now.getTime() - 5 * 60_000) },
        pspReference: { not: null },
      },
      include: { order: { select: { sellerId: true, status: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    let settled = 0;
    for (const row of rows) {
      try {
        const check = await this.psp.verifyTransfer(row.pspReference!);
        const outcome = await this.applyTransferCheck(row, check, {
          notFoundFails: true,
        });
        if (outcome === PayoutTransferStatus.PROCESSING) continue;
        settled++;
        if (outcome === PayoutTransferStatus.FAILED) {
          await this.onPayoutFailed(row, row.order.sellerId, check.raw ?? check.status);
        }
        if (row.order.status !== 'COMPLETED') {
          await this.finalizeCompleted(row.orderId, null, 'payout_reconciled');
        }
      } catch (err) {
        this.logger.warn(
          `Payout reconcile skipped ${row.id}: ${(err as Error).message}`,
        );
      }
    }
    if (settled > 0) this.logger.log(`Reconciled ${settled} payout(s)`);
    return settled;
  }

  /**
   * Send a failed seller transfer again. Does not charge the buyer.
   * Uses a new Paystack reference so the failed one is not reused.
   */
  async retryPayout(orderId: string, sellerId: string): Promise<OrderDto> {
    const order = await this.requireOrder(orderId);
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can retry this payout');
    }
    if (order.status !== 'COMPLETED') {
      throw new ConflictException('Payout retry is only for a completed order');
    }
    const payout = await this.prisma.payout.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (!payout || payout.status !== PayoutTransferStatus.FAILED) {
      throw new ConflictException('There is no failed payout to retry');
    }
    const payment = await this.fundingPayment(order, RELEASABLE_PAYMENT_STATUSES);
    if (!payment) {
      throw new ConflictException('No payment to pay out');
    }
    const account = await this.prisma.sellerPayoutAccount.findUnique({
      where: { userId: sellerId },
    });
    if (!account?.verifiedAt) {
      throw new ConflictException(
        'Verify a bank account before retrying this payout.',
      );
    }
    const bankChanged =
      account.paystackRecipientCode != null &&
      (account.paystackRecipientBankCode !== account.bankCode ||
        account.paystackRecipientAccountNumber !== account.accountNumber);
    const accountName =
      account.nibssAccountName.trim() ||
      [account.firstName, account.middleName, account.lastName]
        .filter(Boolean)
        .join(' ');
    // Mock PSP keeps funded charges per process; the DB is the record.
    if (this.psp instanceof MockPsp || this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).ensureFunded({
        reference: payment.reference,
        amountKobo: payment.amountKobo,
      });
    }
    // Never resend if the last attempt actually went through.
    if (payout.pspReference) {
      let previous: TransferCheck;
      try {
        previous = await this.psp.verifyTransfer(payout.pspReference);
      } catch {
        throw new ConflictException(
          'Could not check the last transfer with Paystack. Try again shortly.',
        );
      }
      if (previous.status === 'success' || previous.status === 'pending') {
        await this.applyTransferCheck(payout, previous, { notFoundFails: false });
        return this.toEnrichedOrderDto(orderId, sellerId);
      }
    }
    const transferReference = transferReferenceFor(
      payment.reference,
      nextTransferAttempt(payment.reference, payout.pspReference),
    );
    // Claim the retry before sending: a double tap sends once.
    const claimed = await this.prisma.payout.updateMany({
      where: { id: payout.id, status: PayoutTransferStatus.FAILED },
      data: {
        status: PayoutTransferStatus.PROCESSING,
        pspReference: transferReference,
        failureReason: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This payout is already being retried');
    }
    const claimedPayout: Payout = {
      ...payout,
      status: PayoutTransferStatus.PROCESSING,
      pspReference: transferReference,
      failureReason: null,
    };

    let releaseResult: MoneyOpResult;
    try {
      releaseResult = await this.psp.release({
        reference: payment.reference,
        amountKobo: payout.netKobo,
        idempotencyKey: `release-retry:${payout.id}:${transferReference}`,
        transferReference,
        recipient: {
          recipientCode: bankChanged
            ? undefined
            : (account.paystackRecipientCode ?? undefined),
          accountName,
          accountNumber: account.accountNumber,
          bankCode: account.bankCode,
        },
      });
    } catch (err) {
      const outcome = await this.settleUncertainTransfer(claimedPayout, err);
      if (outcome === PayoutTransferStatus.FAILED) {
        throw new ConflictException('Paystack did not accept the payout retry.');
      }
      return this.toEnrichedOrderDto(orderId, sellerId);
    }
    const status =
      this.psp.name === 'mock-psp' || releaseResult.status === 'released'
        ? PayoutTransferStatus.PAID
        : PayoutTransferStatus.PROCESSING;
    await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status,
        pspReference: releaseResult.providerRef ?? transferReference,
        failureReason: null,
      },
    });
    if (
      releaseResult.recipientCode &&
      releaseResult.recipientCode !== account.paystackRecipientCode
    ) {
      await this.prisma.sellerPayoutAccount.update({
        where: { id: account.id },
        data: {
          paystackRecipientCode: releaseResult.recipientCode,
          paystackRecipientBankCode: account.bankCode,
          paystackRecipientAccountNumber: account.accountNumber,
        },
      });
    }
    return this.toEnrichedOrderDto(orderId, sellerId);
  }

  /** "Add a bank account" at most once a day per order, with an event as the marker. */
  private async notifyPayoutBlockedOncePerDay(
    sellerId: string,
    orderId: string,
  ): Promise<void> {
    const recent = await this.prisma.orderEvent.findFirst({
      where: {
        orderId,
        type: 'PAYOUT_BLOCKED',
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
      select: { id: true },
    });
    if (recent) return;
    await this.prisma.orderEvent.create({
      data: {
        orderId,
        type: 'PAYOUT_BLOCKED',
        payload: { reason: 'no_verified_bank_account' },
      },
    });
    await this.notifyPayoutProblem(
      sellerId,
      orderId,
      'Add a bank account to get paid',
      'Your payout is ready, but there is no verified bank account to send it to. We will retry once you add one.',
    );
  }

  private async notifyPayoutProblem(
    sellerId: string,
    orderId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notifications.notify({
        userId: sellerId,
        category: NotificationCategory.PAYMENT_RELEASED,
        title,
        body,
        deepLink: `reworth://orders/${orderId}`,
        meta: { orderId },
      });
    } catch (err) {
      this.logger.warn(
        `Payout notice failed for ${orderId}: ${(err as Error).message}`,
      );
    }
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
    if (order.legBStatus != null) {
      if (order.swapListingAId) listingIds.add(order.swapListingAId);
      if (order.swapListingBId) listingIds.add(order.swapListingBId);
    }

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
          await tx.favourite.deleteMany({ where: { listingId: listing.id } });
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

    await this.refreshHomeRails();
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

  private legsFullyReceived(order: Order): boolean {
    if (order.transactionType === TransactionType.GIVEAWAY) {
      return order.legAStatus === 'RECEIVED';
    }
    if (order.transactionType === TransactionType.SWAP) {
      if (order.legBStatus == null) return order.legAStatus === 'RECEIVED';
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
   * Complete a swap or give-away once the required legs are received.
   * Delivery is paid on its own and is not released as a seller payout.
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
    return this.finalizeCompleted(orderId, actorUserId, 'swap_legs_complete');
  }

  /**
   * Buyer went quiet after handover: once `autoReleaseAt` passes, the order
   * counts as received and the buyer-protection window starts. No money moves
   * here; `releaseAfterCover` pays the seller when the window ends.
   */
  async autoReleaseDue(now = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: {
        status: { in: ['SHIPPED', 'HANDED_OVER', 'DELIVERED'] },
        autoReleaseAt: { lte: now },
      },
      take: 200,
    });

    let count = 0;
    for (const order of due) {
      try {
        const coverageEndsAt = new Date(
          now.getTime() + this.coverageDays() * 86_400_000,
        );
        const moved = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, status: order.status },
            data: { status: 'RECEIVED', coverageEndsAt },
          });
          if (claimed.count === 0) return false;
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'RECEIVED',
              actorUserId: null,
              payload: {
                coverageEndsAt,
                previousStatus: order.status,
                reason: 'auto_received',
              },
            },
          });
          return true;
        });
        if (!moved) continue;
        await this.notifyCoverStarted(order, coverageEndsAt, true);
        count++;
      } catch (err) {
        this.logger.warn(
          `Auto-receive failed for ${order.id}: ${(err as Error).message}`,
        );
      }
    }
    if (count > 0) {
      this.logger.log(`Marked ${count} order(s) received after silence`);
    }
    return count;
  }

  /**
   * Pays sellers whose buyer-protection window has ended with no dispute.
   * A dispute moves the order to DISPUTE_HOLD, so it is never picked here.
   */
  async releaseAfterCover(now = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: { status: 'RECEIVED', coverageEndsAt: { lte: now } },
      select: { id: true },
      take: 200,
      orderBy: { coverageEndsAt: 'asc' },
    });
    let count = 0;
    for (const row of due) {
      try {
        await this.releaseEscrow(row.id, null, 'cover_ended');
        count++;
      } catch (err) {
        this.logger.warn(
          `Release after cover failed for ${row.id}: ${(err as Error).message}`,
        );
      }
    }
    if (count > 0) this.logger.log(`Released ${count} order(s) after cover`);
    return count;
  }

  /** True once money has gone (or is going) to the seller's bank. */
  async sellerPaidOut(orderId: string): Promise<boolean> {
    const payout = await this.prisma.payout.findFirst({
      where: {
        orderId,
        status: { in: [PayoutTransferStatus.PAID, PayoutTransferStatus.PROCESSING] },
      },
      select: { id: true },
    });
    return Boolean(payout);
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
  async toEnrichedOrderDto(
    orderId: string,
    viewerId?: string,
  ): Promise<OrderDto> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        meetPoint: true,
        addressDisclosure: true,
        payment: { select: { id: true, reference: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        payouts: { orderBy: { createdAt: 'desc' }, take: 1 },
        deliveryShipment: { select: { status: true } },
        listing: { select: { title: true } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    const paymentStatus = order.payments?.[0]?.status ?? null;
    const payoutStatus = order.payouts?.[0]?.status ?? null;
    const deliveryStatus = order.deliveryShipment?.status ?? null;
    const linkedPayment = order.payment ?? order.payments?.[0] ?? null;
    const base = toOrderDto({
      ...order,
      payment: linkedPayment
        ? { reference: linkedPayment.reference }
        : order.payment,
    });
    if (!base.paymentReference && order.payments?.[0]?.reference) {
      base.paymentReference = order.payments[0].reference;
    }
    if (!base.paymentId && linkedPayment?.id) {
      base.paymentId = linkedPayment.id;
    }
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
      swap: await this.swapPairForOrder(order, viewerId),
      paymentDueAt:
        order.status === 'PAYMENT_PENDING' && order.transactionType !== 'SWAP'
          ? (await this.paymentDueAt(order)).toISOString()
          : null,
      refunds: (order.refunds ?? []).map((r) => ({
        id: r.id,
        amountKobo: r.amountKobo,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
      paidCancellable:
        PAID_CANCELLABLE_STATUSES.has(order.status) &&
        order.transactionType !== 'SWAP' &&
        (!viewerId || viewerId === order.buyerId || viewerId === order.sellerId),
    };
  }

  /** Both items on a swap order: what this payer sends and what they receive. */
  private async swapPairForOrder(
    order: {
      transactionType: string;
      listingId: string;
      buyerId: string;
      swapProposalId?: string | null;
      swapListingAId: string | null;
      swapListingBId: string | null;
      deliveryDate: Date | null;
    },
    viewerId?: string,
  ): Promise<OrderDto['swap']> {
    if (
      order.transactionType !== 'SWAP' ||
      !order.swapListingAId ||
      !order.swapListingBId
    ) {
      return null;
    }
    const rows = await this.prisma.listing.findMany({
      where: { id: { in: [order.swapListingAId, order.swapListingBId] } },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });
    const card = (row: (typeof rows)[number]) => {
      const image = row.images[0];
      const variants = (image?.variants ?? {}) as {
        original?: string;
        w640?: { webp?: string };
        w1080?: { webp?: string };
      };
      const imageUrl =
        variants.w1080?.webp ?? variants.w640?.webp ?? variants.original ?? null;
      return {
        id: row.id,
        title: row.title?.trim() || 'Item',
        imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
      };
    };
    const byId = new Map(rows.map((row) => [row.id, card(row)]));
    const buyerReceives = byId.get(order.listingId);
    const sendId =
      order.listingId === order.swapListingAId
        ? order.swapListingBId
        : order.swapListingAId;
    const buyerSends = byId.get(sendId);
    if (!buyerReceives || !buyerSends) return null;
    const viewerIsSeller = Boolean(viewerId && viewerId !== order.buyerId);
    const youReceive = viewerIsSeller ? buyerSends : buyerReceives;
    const youSend = viewerIsSeller ? buyerReceives : buyerSends;
    const legs = order.swapProposalId
      ? await this.prisma.order.findMany({
          where: { swapProposalId: order.swapProposalId },
          select: { id: true, status: true, buyerId: true },
        })
      : [];
    const cancellable =
      legs.length > 0 &&
      legs.every(
        (leg) => leg.status === 'CREATED' || leg.status === 'PAYMENT_PENDING',
      );
    const payable = viewerId
      ? legs.find(
          (leg) =>
            leg.buyerId === viewerId && leg.status === 'PAYMENT_PENDING',
        )
      : undefined;
    return {
      deliveryOn: order.deliveryDate
        ? order.deliveryDate.toISOString().slice(0, 10)
        : null,
      youReceive,
      youSend,
      cancellable,
      payableOrderId: payable?.id ?? null,
    };
  }
}
