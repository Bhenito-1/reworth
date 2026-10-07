import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FulfilmentMethod, ListingStatus } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CheckoutCartDto, UpsertCartItemDto } from './dto/cart.dto';

const cartListingSelect = {
  id: true,
  title: true,
  priceKobo: true,
  status: true,
  sellingMode: true,
  sellerId: true,
  quantityAvailable: true,
  quantityTotal: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { id: true, variants: true },
  },
} as const;

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

  /**
   * Each cart line becomes its own order. Sellers differ, and escrow is per order.
   * Stock is reserved by order creation — not by sitting in the cart.
   */
  async checkout(userId: string, dto: CheckoutCartDto) {
    const rows = await this.prisma.cartItem.findMany({
      where: {
        userId,
        ...(dto.listingIds?.length
          ? { listingId: { in: dto.listingIds } }
          : {}),
      },
      include: { listing: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

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
            fulfilmentMethod: dto.fulfilmentMethod ?? FulfilmentMethod.PICKUP,
          },
          { skipEmail: true },
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
    return { orders };
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
