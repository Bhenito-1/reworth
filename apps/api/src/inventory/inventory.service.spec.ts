import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';

type Listing = {
  id: string;
  sellerId: string;
  status: string;
  sellingMode: string;
  quantityTotal: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
};

function memory(initial: Listing) {
  let listing = { ...initial };
  const events: unknown[] = [];
  const tx = {
    listing: {
      findUnique: async () => ({ ...listing }),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          quantityAvailable?: { gte: number };
          quantityReserved?: { gte: number };
          status?: { in: string[] };
        };
        data: Record<string, { decrement?: number; increment?: number }>;
      }) => {
        if (where.quantityAvailable && listing.quantityAvailable < where.quantityAvailable.gte) {
          return { count: 0 };
        }
        if (where.quantityReserved && listing.quantityReserved < where.quantityReserved.gte) {
          return { count: 0 };
        }
        if (where.status && !where.status.in.includes(listing.status)) {
          return { count: 0 };
        }
        for (const [key, op] of Object.entries(data)) {
          const current = listing[key as keyof Listing];
          if (typeof current !== 'number') continue;
          const next =
            current -
            (op.decrement ?? 0) +
            (op.increment ?? 0);
          listing = { ...listing, [key]: next };
        }
        return { count: 1 };
      },
      update: async ({ data }: { data: Partial<Listing> }) => {
        listing = { ...listing, ...data };
        return { ...listing };
      },
    },
    listingEvent: {
      create: async ({ data }: { data: unknown }) => {
        events.push(data);
        return data;
      },
    },
  };
  return {
    tx: tx as never,
    snapshot: () => listing,
    events: () => events,
  };
}

describe('InventoryService stock', () => {
  const svc = new InventoryService({} as never);

  it('reserves units and hides the listing when none remain', async () => {
    const db = memory({
      id: 'l1',
      sellerId: 's1',
      status: 'LIVE',
      sellingMode: 'SELL',
      quantityTotal: 3,
      quantityAvailable: 3,
      quantityReserved: 0,
      quantitySold: 0,
    });
    await svc.reserveStock(db.tx, 'l1', 2, 'buyer');
    expect(db.snapshot()).toMatchObject({
      quantityAvailable: 1,
      quantityReserved: 2,
      status: 'LIVE',
    });
    await svc.reserveStock(db.tx, 'l1', 1, 'buyer');
    expect(db.snapshot()).toMatchObject({
      quantityAvailable: 0,
      quantityReserved: 3,
      status: 'RESERVED',
    });
  });

  it('refuses to reserve more than is available', async () => {
    const db = memory({
      id: 'l1',
      sellerId: 's1',
      status: 'LIVE',
      sellingMode: 'SELL',
      quantityTotal: 1,
      quantityAvailable: 1,
      quantityReserved: 0,
      quantitySold: 0,
    });
    await expect(svc.reserveStock(db.tx, 'l1', 2, 'buyer')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns units when an unpaid order is released', async () => {
    const db = memory({
      id: 'l1',
      sellerId: 's1',
      status: 'RESERVED',
      sellingMode: 'SELL',
      quantityTotal: 2,
      quantityAvailable: 0,
      quantityReserved: 2,
      quantitySold: 0,
    });
    await svc.releaseStock(db.tx, 'l1', 2, 'buyer');
    expect(db.snapshot()).toMatchObject({
      quantityAvailable: 2,
      quantityReserved: 0,
      status: 'LIVE',
    });
  });

  it('moves reserved units to sold and marks the listing sold at zero', async () => {
    const db = memory({
      id: 'l1',
      sellerId: 's1',
      status: 'RESERVED',
      sellingMode: 'SELL',
      quantityTotal: 2,
      quantityAvailable: 0,
      quantityReserved: 2,
      quantitySold: 0,
    });
    await svc.commitSale(db.tx, 'l1', 2, null);
    expect(db.snapshot()).toMatchObject({
      quantityReserved: 0,
      quantitySold: 2,
      quantityAvailable: 0,
      status: 'SOLD',
    });
  });

  it('keeps remaining units on the marketplace after a partial sale', async () => {
    const db = memory({
      id: 'l1',
      sellerId: 's1',
      status: 'LIVE',
      sellingMode: 'SELL',
      quantityTotal: 4,
      quantityAvailable: 2,
      quantityReserved: 2,
      quantitySold: 0,
    });
    await svc.commitSale(db.tx, 'l1', 2, null);
    expect(db.snapshot()).toMatchObject({
      quantityAvailable: 2,
      quantityReserved: 0,
      quantitySold: 2,
      status: 'LIVE',
    });
  });

  it('rejects a unit count below units already sold or reserved', async () => {
    const listing: Listing = {
      id: 'l1',
      sellerId: 's1',
      status: 'LIVE',
      sellingMode: 'SELL',
      quantityTotal: 5,
      quantityAvailable: 3,
      quantityReserved: 1,
      quantitySold: 1,
    };
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const db = memory(listing);
        await fn(db.tx);
        Object.assign(listing, db.snapshot());
      },
    };
    const local = new InventoryService(prisma as never);
    await expect(local.adjustListedQuantity('l1', 's1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
