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
import { computeDeliveryFeeKobo } from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';
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
  quantityAvailable: true,
  quantityTotal: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { id: true, variants: true },
  },
} as const;

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
  };
};

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { listing: { select: cartListingSelect } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
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

    const quantity = Math.min(dto.quantity ?? 1, listing.quantityAvailable);
    const row = await this.prisma.cartItem.upsert({
      where: { userId_listingId: { userId, listingId: listing.id } },
      create: { userId, listingId: listing.id, quantity },
      update: { quantity },
      include: { listing: { select: cartListingSelect } },
    });
    return this.toDto(row);
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
    return this.toDto(row);
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
    const rows = await this.loadCheckoutRows(userId, dto.listingIds);
    const deliveryByListing = this.deliveryFeesByListing(rows, dto.toLat, dto.toLng);
    return this.buildQuotePayload(rows, deliveryByListing, dto.toLat, dto.toLng);
  }

  /**
   * Each cart line becomes its own order. Delivery is charged once per seller
   * (pickup location → buyer address). Stock is reserved by order creation.
   */
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

    const rows = await this.loadCheckoutRows(userId, dto.listingIds);
    const deliveryByListing = this.deliveryFeesByListing(
      rows,
      dto.toLat,
      dto.toLng,
    );

    const checkoutId = randomUUID();
    const orders = [];
    const placed: {
      id: string;
      sellerId: string;
      quantity: number;
      totalKobo: number;
      title: string;
    }[] = [];
    let failed: { title: string; message: string } | null = null;
    for (const row of rows) {
      try {
        const order = await this.orders.create(
          userId,
          {
            listingId: row.listingId,
            quantity: row.quantity,
            buyNow: true,
            fulfilmentMethod: FulfilmentMethod.DELIVERY,
            toLat: dto.toLat,
            toLng: dto.toLng,
            deliveryAddress,
            deliveryFeeKobo: deliveryByListing.get(row.listingId) ?? 0,
          },
          { skipEmail: true, checkoutId },
        );
        await this.prisma.cartItem.delete({ where: { id: row.id } });
        orders.push(order);
        placed.push({
          id: order.id,
          sellerId: order.sellerId,
          quantity: order.quantity,
          totalKobo: order.totalKobo,
          title: row.listing.title,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not place order';
        if (orders.length === 0) throw err;
        failed = { title: row.listing.title || 'Item', message };
        break;
      }
    }
    await this.orders.emailOrdersPlaced(userId, placed);
    if (failed) {
      throw new ConflictException(
        `${failed.title}: ${failed.message}. ${orders.length} other item(s) were ordered.`,
      );
    }
    return {
      checkoutId,
      orders,
      quote: this.buildQuotePayload(
        rows,
        deliveryByListing,
        dto.toLat,
        dto.toLng,
      ),
    };
  }

  private async loadCheckoutRows(
    userId: string,
    listingIds?: string[],
  ): Promise<
    (CartRow & {
      createdAt: Date;
      listing: CartRow['listing'] & { status: ListingStatus; sellingMode: string };
    })[]
  > {
    const rows = await this.prisma.cartItem.findMany({
      where: {
        userId,
        ...(listingIds?.length ? { listingId: { in: listingIds } } : {}),
      },
      include: { listing: { select: cartListingSelect } },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }
    for (const row of rows) {
      if (row.listing.status !== ListingStatus.LIVE) {
        throw new ConflictException(
          `"${row.listing.title || 'Item'}" is no longer available`,
        );
      }
      if (row.listing.geoLat == null || row.listing.geoLng == null) {
        throw new BadRequestException(
          `"${row.listing.title || 'Item'}" cannot be delivered — seller pickup location is missing.`,
        );
      }
    }
    return rows;
  }

  /** First line per seller pays delivery; additional lines from same seller pay 0. */
  private deliveryFeesByListing(
    rows: CartRow[],
    toLat: number,
    toLng: number,
  ): Map<string, number> {
    const chargedSeller = new Set<string>();
    const fees = new Map<string, number>();
    for (const row of rows) {
      const sellerId = row.listing.sellerId;
      if (chargedSeller.has(sellerId)) {
        fees.set(row.listingId, 0);
        continue;
      }
      const fromLat = row.listing.geoLat ?? 6.5244;
      const fromLng = row.listing.geoLng ?? 3.3792;
      const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
      fees.set(row.listingId, computeDeliveryFeeKobo(distanceKm));
      chargedSeller.add(sellerId);
    }
    return fees;
  }

  private buildQuotePayload(
    rows: CartRow[],
    deliveryByListing: Map<string, number>,
    toLat?: number,
    toLng?: number,
  ) {
    const sellerDelivery = new Map<
      string,
      { deliveryFeeKobo: number; distanceKm: number | null }
    >();
    const lines = rows.map((row) => {
      const itemSubtotalKobo = row.listing.priceKobo * row.quantity;
      const deliveryFeeKobo = deliveryByListing.get(row.listingId) ?? 0;
      const protectionFeeKobo = computeProtectionFeeKobo(itemSubtotalKobo);
      const lineTotalKobo =
        itemSubtotalKobo + protectionFeeKobo + deliveryFeeKobo;
      if (deliveryFeeKobo > 0 && !sellerDelivery.has(row.listing.sellerId)) {
        let distanceKm: number | null = null;
        if (toLat != null && toLng != null) {
          const fromLat = row.listing.geoLat ?? 6.5244;
          const fromLng = row.listing.geoLng ?? 3.3792;
          distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
        }
        sellerDelivery.set(row.listing.sellerId, {
          deliveryFeeKobo,
          distanceKm,
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

  private toDto(row: {
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
      images: { id: string; variants: unknown }[];
    };
  }) {
    const available = row.listing.quantityAvailable;
    return {
      id: row.id,
      quantity: row.quantity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      unavailable: row.listing.status !== 'LIVE' || available < 1,
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
