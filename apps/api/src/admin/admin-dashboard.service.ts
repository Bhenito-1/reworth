import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DashboardKpis = {
  days: number;
  mau: number;
  newListings: number;
  activeListings: number;
  transactionsCompleted: number;
  gmvKobo: number;
  sellThroughRate: number;
  medianTimeToSaleHours: number | null;
  fraudRate: number;
  openDisputes: number;
  byCommunity: { community: string; listings: number; gmvKobo: number }[];
};

@Injectable()
export class AdminDashboardService {
  /** Concurrent dashboard loads (React strict mode) share one read. */
  private readonly inflight = new Map<number, Promise<DashboardKpis>>();

  constructor(private readonly prisma: PrismaService) {}

  kpis(days = 30): Promise<DashboardKpis> {
    const existing = this.inflight.get(days);
    if (existing) return existing;
    const pending = this.computeKpis(days).finally(() => {
      this.inflight.delete(days);
    });
    this.inflight.set(days, pending);
    return pending;
  }

  private async computeKpis(days: number): Promise<DashboardKpis> {
    const since = new Date(Date.now() - days * 86_400_000);
    const completedWhere = {
      status: 'COMPLETED' as const,
      completedAt: { gte: since },
    };

    const [
      listingActors,
      orderBuyers,
      orderSellers,
      messageActors,
      newListings,
      activeListings,
      soldOrLive,
      sold,
      completedOrders,
      openDisputes,
      riskEvents,
      communityListings,
    ] = await Promise.all([
      this.prisma.listingEvent.groupBy({
        by: ['actorUserId'],
        where: { createdAt: { gte: since }, actorUserId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['buyerId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['sellerId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['senderId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.listing.count({ where: { createdAt: { gte: since } } }),
      this.prisma.listing.count({ where: { status: 'LIVE' } }),
      this.prisma.listing.count({
        where: {
          createdAt: { gte: since },
          status: { in: ['SOLD', 'LIVE', 'RESERVED'] },
        },
      }),
      this.prisma.listing.count({
        where: { createdAt: { gte: since }, status: 'SOLD' },
      }),
      this.prisma.order.findMany({
        where: completedWhere,
        select: {
          totalKobo: true,
          createdAt: true,
          completedAt: true,
          listing: { select: { community: true } },
        },
      }),
      this.prisma.dispute.count({
        where: { status: { not: 'RESOLVED' } },
      }),
      this.prisma.riskEvent.count({ where: { createdAt: { gte: since } } }),
      this.prisma.listing.groupBy({
        by: ['community'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const mauSet = new Set<string>();
    for (const r of listingActors) {
      if (r.actorUserId) mauSet.add(r.actorUserId);
    }
    for (const o of orderBuyers) mauSet.add(o.buyerId);
    for (const o of orderSellers) mauSet.add(o.sellerId);
    for (const m of messageActors) mauSet.add(m.senderId);

    const gmvKobo = completedOrders.reduce((s, o) => s + o.totalKobo, 0);
    const transactionsCompleted = completedOrders.length;
    const sellThroughRate = soldOrLive > 0 ? sold / soldOrLive : 0;

    const durations = completedOrders
      .filter((o) => o.completedAt)
      .map(
        (o) =>
          (o.completedAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60),
      )
      .sort((a, b) => a - b);
    const medianTimeToSaleHours =
      durations.length === 0
        ? null
        : durations.length % 2 === 1
          ? durations[(durations.length - 1) / 2]!
          : (durations[durations.length / 2 - 1]! +
              durations[durations.length / 2]!) /
            2;

    const fraudRate = newListings > 0 ? riskEvents / newListings : 0;

    const byCommunityMap = new Map<
      string,
      { community: string; listings: number; gmvKobo: number }
    >();
    for (const row of communityListings) {
      byCommunityMap.set(row.community || 'unknown', {
        community: row.community || 'unknown',
        listings: row._count._all,
        gmvKobo: 0,
      });
    }
    for (const o of completedOrders) {
      const c = o.listing.community || 'unknown';
      const cur = byCommunityMap.get(c) ?? {
        community: c,
        listings: 0,
        gmvKobo: 0,
      };
      cur.gmvKobo += o.totalKobo;
      byCommunityMap.set(c, cur);
    }

    return {
      days,
      mau: mauSet.size,
      newListings,
      activeListings,
      transactionsCompleted,
      gmvKobo,
      sellThroughRate,
      medianTimeToSaleHours,
      fraudRate,
      openDisputes,
      byCommunity: [...byCommunityMap.values()].sort(
        (a, b) => b.listings - a.listings,
      ),
    };
  }
}

/** Test helper — compute KPI shape from injected aggregates (no DB). */
export function buildKpiShape(
  input: Partial<DashboardKpis> & { days?: number },
): DashboardKpis {
  return {
    days: input.days ?? 30,
    mau: input.mau ?? 0,
    newListings: input.newListings ?? 0,
    activeListings: input.activeListings ?? 0,
    transactionsCompleted: input.transactionsCompleted ?? 0,
    gmvKobo: input.gmvKobo ?? 0,
    sellThroughRate: input.sellThroughRate ?? 0,
    medianTimeToSaleHours: input.medianTimeToSaleHours ?? null,
    fraudRate: input.fraudRate ?? 0,
    openDisputes: input.openDisputes ?? 0,
    byCommunity: input.byCommunity ?? [],
  };
}

export type PrismaLike = {
  listingEvent: { groupBy: (args: unknown) => Promise<unknown[]> };
  order: {
    groupBy: (args: unknown) => Promise<unknown[]>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  message: { groupBy: (args: unknown) => Promise<unknown[]> };
  listing: {
    count: (args: unknown) => Promise<number>;
    groupBy: (args: unknown) => Promise<unknown[]>;
  };
  dispute: { count: (args: unknown) => Promise<number> };
  riskEvent: { count: (args: unknown) => Promise<number> };
};

void Prisma;
