import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FulfilmentMethod, ListingStatus } from '@prisma/client';
import { computeProtectionFeeKobo } from '../orders/order-fees';
import { OrdersService } from '../orders/orders.service';
import { listingHasPickupGeo } from '../delivery/delivery-pricing';
import {
  DeliveryPricingService,
  PICKUP_ADDRESS_QUOTE_SELECT,
} from '../delivery/delivery-pricing.service';
import { buyerCanCheckoutOnListing } from '../common/buyer-listing-checkout';
import { PrismaService } from '../prisma/prisma.service';
import type { CartQuoteDto, CheckoutCartDto, UpsertCartItemDto } from './dto/cart.dto';

const cartListingSelect = {
  id: true,
  title: true,
  priceKobo: true,
  status: true,
  sellingMode: true,
  sellerId: true,
  geoLat: true,
  geoLng: true,
  city: true,
  pickupAddress: { select: PICKUP_ADDRESS_QUOTE_SELECT },
  quantityAvailable: true,
  quantityReserved: true,
  category: { select: { slug: true } },
  quantityTotal: true,
  quantitySold: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { id: true, variants: true },
  },
} as const;

const CART_ONE_ITEM_MESSAGE =
  'Checkout or clear your cart before adding another item.';

type CartRow = {
  id: string;
  quantity: number;
  listingId: string;
  listing: {
    id: string;
    title: string;
    priceKobo: number;
    sellerId: string;
    geoLat: number | null;
    geoLng: number | null;
    city?: string | null;
    category?: { slug: string } | null;
  };
};

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly deliveryPricing: DeliveryPricingService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { listing: { select: cartListingSelect } },
      orderBy: { updatedAt: 'desc' },
    });
    const synced: typeof rows = [];
    for (const row of rows) {
      const ready = await this.cartLineCheckoutReady(userId, row.listing);
      if (!ready) {
        await this.prisma.cartItem.delete({ where: { id: row.id } });
        continue;
      }
      const available = row.listing.quantityAvailable;
      if (row.quantity > available) {
        const updated = await this.prisma.cartItem.update({
          where: { id: row.id },
          data: { quantity: available },
          include: { listing: { select: cartListingSelect } },
        });
        synced.push(updated);
        continue;
      }
      synced.push(row);
    }
    if (synced.length > 1) {
      synced.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
      const [keep, ...extra] = synced;
      for (const row of extra) {
        await this.prisma.cartItem.delete({ where: { id: row.id } });
      }
      return [await this.toDtoForUser(userId, keep)];
    }
    return Promise.all(synced.map((row) => this.toDtoForUser(userId, row)));
  }

  async upsert(userId: string, dto: UpsertCartItemDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === userId) {
      throw new BadRequestException('You cannot add your own listing to the cart');
    }
    if (listing.sellingMode === 'GIVE_AWAY') {
      throw new BadRequestException(
        'A gift is not reserved in the cart. Pay the delivery fee to receive one unit.',
      );
    }
    if (listing.sellingMode !== 'SELL') {
      throw new BadRequestException('Only items for sale can be added to the cart');
    }
    if (listing.status !== ListingStatus.LIVE || listing.quantityAvailable < 1) {
      throw new ConflictException('This item is not available');
    }

    const other = await this.prisma.cartItem.findFirst({
      where: { userId, listingId: { not: listing.id } },
    });
    if (other) {
      throw new ConflictException(CART_ONE_ITEM_MESSAGE);
    }

    const quantity = Math.min(dto.quantity ?? 1, listing.quantityAvailable);
    const row = await this.prisma.cartItem.upsert({
      where: { userId_listingId: { userId, listingId: listing.id } },
      create: { userId, listingId: listing.id, quantity },
      update: { quantity },
      include: { listing: { select: cartListingSelect } },
    });
    return await this.toDtoForUser(userId, row);
  }

  async updateQuantity(userId: string, listingId: string, quantity: number) {
    const existing = await this.prisma.cartItem.findUnique({
      where: { userId_listingId: { userId, listingId } },
      include: { listing: { select: cartListingSelect } },
    });
    if (!existing) throw new NotFoundException('Cart item not found');
    const capped = Math.min(quantity, Math.max(existing.listing.quantityAvailable, 1));
    if (existing.listing.quantityAvailable < 1) {
      throw new ConflictException('This item is no longer available');
    }
    const row = await this.prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: Math.min(capped, existing.listing.quantityAvailable) },
      include: { listing: { select: cartListingSelect } },
    });
    return await this.toDtoForUser(userId, row);
  }

  async remove(userId: string, listingId: string) {
    const existing = await this.prisma.cartItem.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (!existing) return { removed: false };
    await this.prisma.cartItem.delete({ where: { id: existing.id } });
    return { removed: true };
  }

  async quote(userId: string, dto: CartQuoteDto) {
    const rows = await this.loadCheckoutRows(userId);
    const drop = await this.resolveBuyerDropoff(userId, dto);
    const deliveryLegs = await this.deliveryLegsByListing(
      userId,
      rows,
      drop,
      this.dropoffAddressFromDto(dto),
    );
    return this.buildQuotePayload(rows, deliveryLegs);
  }

  /** Places one order for the single cart line. Stock is reserved by order creation. */
  async checkout(userId: string, dto: CheckoutCartDto) {
    if (dto.fulfilmentMethod !== FulfilmentMethod.DELIVERY) {
      throw new BadRequestException('Cart checkout is delivery only');
    }
    if (dto.toLat == null || dto.toLng == null) {
      throw new BadRequestException('Delivery destination is required');
    }
    const deliveryAddress = dto.deliveryAddress?.trim() ?? '';
    if (!deliveryAddress) {
      throw new BadRequestException('Delivery address is required');
    }

    const rows = await this.loadCheckoutRows(userId);
    const drop = await this.resolveBuyerDropoff(userId, dto);
    const deliveryLegs = await this.deliveryLegsByListing(
      userId,
      rows,
      drop,
      this.dropoffAddressFromDto(dto),
    );
    const deliveryByListing = new Map(
      [...deliveryLegs.entries()].map(([id, leg]) => [id, leg.deliveryFeeKobo]),
    );

    const row = rows[0]!;
    const checkoutId = randomUUID();
    const order = await this.orders.create(
      userId,
      {
        listingId: row.listingId,
        quantity: row.quantity,
        buyNow: true,
        fulfilmentMethod: FulfilmentMethod.DELIVERY,
        toLat: drop.lat,
        toLng: drop.lng,
        deliveryAddress,
        deliveryLine1: dto.deliveryLine1,
        deliveryCommunity: dto.deliveryCommunity,
        deliveryCity: dto.deliveryCity,
        deliveryFeeKobo: deliveryByListing.get(row.listingId) ?? 0,
      },
      { skipEmail: true, checkoutId },
    );
    const placed = [
      {
        id: order.id,
        sellerId: order.sellerId,
        quantity: order.quantity,
        amountKobo: order.amountKobo,
        totalKobo: order.totalKobo,
        title: row.listing.title,
      },
    ];
    await this.orders.emailOrdersPlaced(userId, placed);
    return {
      checkoutId,
      orders: [order],
      quote: this.buildQuotePayload(rows, deliveryLegs),
    };
  }

  private async loadCheckoutRows(
    userId: string,
  ): Promise<
    (CartRow & {
      createdAt: Date;
      listing: CartRow['listing'] & { status: ListingStatus; sellingMode: string };
    })[]
  > {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { listing: { select: cartListingSelect } },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });
    if (rows.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }
    for (const row of rows) {
      const ready = await this.cartLineCheckoutReady(userId, row.listing);
      if (!ready) {
        throw new ConflictException(
          `"${row.listing.title || 'Item'}" is no longer available`,
        );
      }
      if (!listingHasPickupGeo(row.listing)) {
        throw new BadRequestException(
          `"${row.listing.title || 'Item'}" cannot be delivered — seller pickup location is missing.`,
        );
      }
    }
    return rows;
  }

  private dropoffAddressFromDto(dto: {
    deliveryLine1?: string;
    deliveryCommunity?: string;
    deliveryCity?: string;
  }) {
    const line1 = dto.deliveryLine1?.trim() ?? '';
    const community = dto.deliveryCommunity?.trim() ?? '';
    if (line1.length < 3 || community.length < 2) return null;
    return {
      line1,
      community,
      city: dto.deliveryCity?.trim() || 'Lagos',
      country: 'NG',
    };
  }

  private async resolveBuyerDropoff(
    userId: string,
    dto: {
      toLat?: number;
      toLng?: number;
      deliveryLine1?: string;
      deliveryCommunity?: string;
      deliveryCity?: string;
    },
  ) {
    if (dto.toLat == null || dto.toLng == null) {
      throw new BadRequestException('Delivery destination is required');
    }
    const hint = { lat: dto.toLat, lng: dto.toLng };
    const parts = this.dropoffAddressFromDto(dto);
    if (parts) {
      return this.deliveryPricing.resolveDropoffForUser(userId, parts, hint);
    }
    return hint;
  }

  private async deliveryLegsByListing(
    buyerUserId: string,
    rows: CartRow[],
    dropoff: { lat: number; lng: number },
    dropoffAddress?: {
      line1: string;
      community: string;
      city: string;
      country: string;
    } | null,
  ) {
    const legs = new Map<
      string,
      { deliveryFeeKobo: number; distanceKm: number | null }
    >();
    const row = rows[0];
    if (!row) return legs;
    const priced = await this.deliveryPricing.quoteLegForListing(
      row.listing,
      dropoff,
      dropoffAddress,
      buyerUserId,
    );
    legs.set(row.listingId, {
      deliveryFeeKobo: priced.deliveryFeeKobo,
      distanceKm: priced.distanceKm,
    });
    return legs;
  }

  private buildQuotePayload(
    rows: CartRow[],
    deliveryLegs: Map<
      string,
      { deliveryFeeKobo: number; distanceKm: number | null }
    >,
  ) {
    const sellerDelivery = new Map<
      string,
      { deliveryFeeKobo: number; distanceKm: number | null }
    >();
    const lines = rows.map((row) => {
      const itemSubtotalKobo = row.listing.priceKobo * row.quantity;
      const legMeta = deliveryLegs.get(row.listingId);
      const deliveryFeeKobo = legMeta?.deliveryFeeKobo ?? 0;
      const protectionFeeKobo = computeProtectionFeeKobo(itemSubtotalKobo);
      const lineTotalKobo =
        itemSubtotalKobo + protectionFeeKobo + deliveryFeeKobo;
      if (deliveryFeeKobo > 0 && !sellerDelivery.has(row.listing.sellerId)) {
        sellerDelivery.set(row.listing.sellerId, {
          deliveryFeeKobo,
          distanceKm: legMeta?.distanceKm ?? null,
        });
      }
      return {
        listingId: row.listingId,
        sellerId: row.listing.sellerId,
        title: row.listing.title,
        quantity: row.quantity,
        unitPriceKobo: row.listing.priceKobo,
        itemSubtotalKobo,
        deliveryFeeKobo,
        protectionFeeKobo,
        lineTotalKobo,
      };
    });

    const itemsSubtotalKobo = lines.reduce((s, l) => s + l.itemSubtotalKobo, 0);
    const deliveryTotalKobo = lines.reduce((s, l) => s + l.deliveryFeeKobo, 0);
    const protectionTotalKobo = lines.reduce(
      (s, l) => s + l.protectionFeeKobo,
      0,
    );
    const grandTotalKobo =
      itemsSubtotalKobo + deliveryTotalKobo + protectionTotalKobo;

    const deliveryBySeller = [...sellerDelivery.entries()].map(
      ([sellerId, v]) => ({
        sellerId,
        deliveryFeeKobo: v.deliveryFeeKobo,
        distanceKm: v.distanceKm,
      }),
    );

    return {
      lines,
      deliveryBySeller,
      itemsSubtotalKobo,
      deliveryTotalKobo,
      protectionTotalKobo,
      grandTotalKobo,
    };
  }

  private async cartLineCheckoutReady(
    userId: string,
    listing: {
      id: string;
      status: ListingStatus;
      quantityAvailable: number;
      quantityReserved: number;
      quantityTotal: number;
      quantitySold: number;
    },
  ): Promise<boolean> {
    if (listing.status === ListingStatus.LIVE) {
      return listing.quantityAvailable >= 1;
    }
    if (listing.status === ListingStatus.RESERVED) {
      const lane = await buyerCanCheckoutOnListing(
        this.prisma,
        listing,
        userId,
      );
      if (!lane) return false;
      if (listing.quantityAvailable >= 1) return true;
      return (
        listing.quantityAvailable < 1 && (listing.quantityReserved ?? 0) < 1
      );
    }
    return false;
  }

  private async toDtoForUser(
    userId: string,
    row: Parameters<CartService['toDto']>[0],
  ) {
    const checkoutReady = await this.cartLineCheckoutReady(userId, {
      id: row.listing.id,
      status: row.listing.status,
      quantityAvailable: row.listing.quantityAvailable,
      quantityReserved: row.listing.quantityReserved ?? 0,
      quantityTotal: row.listing.quantityTotal,
      quantitySold: row.listing.quantitySold ?? 0,
    });
    return this.toDto(row, checkoutReady);
  }

  private toDto(
    row: {
    id: string;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
    listing: {
      id: string;
      title: string;
      priceKobo: number;
      status: ListingStatus;
      sellingMode: string;
      sellerId: string;
      geoLat: number | null;
      geoLng: number | null;
      quantityAvailable: number;
      quantityTotal: number;
      quantityReserved?: number;
      quantitySold?: number;
      images: { id: string; variants: unknown }[];
    };
  },
    checkoutReady: boolean,
  ) {
    const available = row.listing.quantityAvailable;
    return {
      id: row.id,
      quantity: row.quantity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      unavailable: !checkoutReady,
      listing: {
        id: row.listing.id,
        title: row.listing.title,
        priceKobo: row.listing.priceKobo,
        status: row.listing.status,
        sellingMode: row.listing.sellingMode,
        sellerId: row.listing.sellerId,
        geoLat: row.listing.geoLat,
        geoLng: row.listing.geoLng,
        quantityAvailable: available,
        quantityTotal: row.listing.quantityTotal,
        images: row.listing.images.map((img) => ({
          id: img.id,
          variants: (img.variants as Record<string, unknown>) ?? {},
        })),
      },
    };
  }
}
