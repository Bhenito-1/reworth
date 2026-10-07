import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingStatus, Prisma } from '@prisma/client';
import { ListingStateMachine } from '../listings/listing-state.machine';
import { PrismaService } from '../prisma/prisma.service';

type StockListing = {
  id: string;
  status: ListingStatus | string;
  quantityTotal?: number | null;
  quantityAvailable?: number | null;
  quantityReserved?: number | null;
  quantitySold?: number | null;
};

/** Listings created before unit counts were added do not carry quantityTotal. */
export function tracksQuantity(listing: {
  quantityTotal?: number | null;
}): boolean {
  return typeof listing.quantityTotal === 'number';
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hold units for an unpaid order. Available drops immediately so nobody else
   * can buy the same units. Cart adds do not call this.
   */
  async reserveStock(
    tx: Prisma.TransactionClient,
    listingId: string,
    quantity: number,
    actorUserId?: string | null,
  ): Promise<void> {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (!tracksQuantity(listing)) return;
    if (!['LIVE', 'RESERVED'].includes(listing.status)) {
      throw new ConflictException('Listing is not available');
    }
    if ((listing.quantityAvailable ?? 0) < quantity) {
      throw new ConflictException(
        `Only ${listing.quantityAvailable ?? 0} unit(s) available`,
      );
    }

    const claimed = await tx.listing.updateMany({
      where: {
        id: listingId,
        quantityAvailable: { gte: quantity },
        status: { in: ['LIVE', 'RESERVED'] },
      },
      data: {
        quantityAvailable: { decrement: quantity },
        quantityReserved: { increment: quantity },
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Not enough units available');
    }
    await this.syncVisibility(tx, listingId, actorUserId, 'reserved');
  }

  /** Return reserved units when an unpaid order is cancelled or rejected. */
  async releaseStock(
    tx: Prisma.TransactionClient,
    listingId: string,
    quantity: number,
    actorUserId?: string | null,
  ): Promise<void> {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || !tracksQuantity(listing)) return;
    const reserved = listing.quantityReserved ?? 0;
    const qty = Math.min(quantity, reserved);
    if (qty <= 0) return;

    const claimed = await tx.listing.updateMany({
      where: { id: listingId, quantityReserved: { gte: qty } },
      data: {
        quantityReserved: { decrement: qty },
        quantityAvailable: { increment: qty },
      },
    });
    if (claimed.count !== 1) return;
    await this.syncVisibility(tx, listingId, actorUserId, 'released');
  }

  /**
   * Move units into sold. Prefers reserved stock (normal paid order).
   * Falls back to available stock for swaps and orders placed before reservation.
   */
  async commitSale(
    tx: Prisma.TransactionClient,
    listingId: string,
    quantity: number,
    actorUserId?: string | null,
  ): Promise<'committed' | 'skipped' | 'legacy'> {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing) return 'skipped';
    if (!tracksQuantity(listing)) return 'legacy';

    const reserved = listing.quantityReserved ?? 0;
    const available = listing.quantityAvailable ?? 0;
    if (reserved >= quantity) {
      const claimed = await tx.listing.updateMany({
        where: { id: listingId, quantityReserved: { gte: quantity } },
        data: {
          quantityReserved: { decrement: quantity },
          quantitySold: { increment: quantity },
        },
      });
      if (claimed.count !== 1) return 'skipped';
    } else if (available >= quantity) {
      const claimed = await tx.listing.updateMany({
        where: { id: listingId, quantityAvailable: { gte: quantity } },
        data: {
          quantityAvailable: { decrement: quantity },
          quantitySold: { increment: quantity },
        },
      });
      if (claimed.count !== 1) return 'skipped';
    } else {
      return 'skipped';
    }

    await this.syncVisibility(tx, listingId, actorUserId, 'sold');
    return 'committed';
  }

  /**
   * Seller sets how many units exist in total. Committed (sold + reserved)
   * units cannot be removed.
   */
  async adjustListedQuantity(
    listingId: string,
    sellerId: string,
    quantityTotal: number,
  ): Promise<void> {
    if (!Number.isInteger(quantityTotal) || quantityTotal < 1 || quantityTotal > 999) {
      throw new BadRequestException('Units must be between 1 and 999');
    }

    await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.sellerId !== sellerId) {
        throw new NotFoundException('Listing not found');
      }
      if (listing.sellingMode !== 'SELL') {
        throw new BadRequestException('Only items for sale have a unit count');
      }
      if (!tracksQuantity(listing)) return;

      const sold = listing.quantitySold ?? 0;
      const reserved = listing.quantityReserved ?? 0;
      if (quantityTotal < sold + reserved) {
        throw new BadRequestException(
          `Cannot list fewer than ${sold + reserved} unit(s) already sold or reserved`,
        );
      }

      await tx.listing.update({
        where: { id: listingId },
        data: {
          quantityTotal,
          quantityAvailable: quantityTotal - sold - reserved,
        },
      });
      await this.syncVisibility(tx, listingId, sellerId, 'quantity_adjusted');
    });
  }

  async syncVisibility(
    tx: Prisma.TransactionClient,
    listingId: string,
    actorUserId?: string | null,
    reason?: string,
  ): Promise<void> {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || !tracksQuantity(listing)) return;
    if (!['LIVE', 'RESERVED', 'SOLD'].includes(listing.status)) return;

    const available = listing.quantityAvailable ?? 0;
    const reserved = listing.quantityReserved ?? 0;
    const sold = listing.quantitySold ?? 0;

    let next: ListingStatus | null = null;
    if (available === 0 && reserved === 0 && sold > 0) {
      next = 'SOLD';
    } else if (available === 0 && listing.status === 'LIVE') {
      next = 'RESERVED';
    } else if (available > 0 && listing.status === 'RESERVED') {
      next = 'LIVE';
    }

    if (!next || next === listing.status) return;
    if (!ListingStateMachine.canTransition(listing.status, next)) return;

    await tx.listing.update({
      where: { id: listingId },
      data: { status: next },
    });
    await tx.listingEvent.create({
      data: {
        listingId,
        type: 'STATUS_CHANGED',
        actorUserId: actorUserId ?? null,
        payload: { from: listing.status, to: next, reason: reason ?? 'inventory' },
      },
    });
  }
}

export type { StockListing };
