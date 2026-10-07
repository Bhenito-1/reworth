import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryAnalyticsService } from '../discovery/discovery-analytics.service';
import {
  toPublicListing,
  type PublicListingDto,
} from '../listings/public-listing.mapper';
import { MovingSalesService } from '../moving-sales/moving-sales.service';
import { CommunityVisibilityService } from '../communities/community-visibility.service';
import { haversineKm } from '../providers/search.provider';
import { HomeCache } from './home.cache';
import { RecommendationService } from './recommendation.service';

export type MovingSaleRailItem = {
  id: string;
  title: string;
  itemCount: number;
  combinedPriceKobo: number;
  deadline: Date;
  community: string;
  coverListingId?: string;
};

export type HomeRail = {
  id: string;
  title: string;
  items: PublicListingDto[];
  emptyMessage?: string;
  movingSales?: MovingSaleRailItem[];
};

export type HomeResponse = {
  rails: HomeRail[];
  community?: string;
  radiusKm?: number;
};

const listingInclude = {
  category: true,
  subcategory: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  estateCommunity: true,
  movingSale: true,
  seller: {
    include: {
      profile: true,
      verifications: true,
    },
  },
} satisfies Prisma.ListingInclude;

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: HomeCache,
    private readonly recommendations: RecommendationService,
    private readonly analytics: DiscoveryAnalyticsService,
    private readonly movingSales: MovingSalesService,
    private readonly visibility: CommunityVisibilityService,
  ) {}

  async getHome(query: {
    community?: string;
    radiusKm?: number;
    lat?: number;
    lng?: number;
    viewerId?: string | null;
  }): Promise<HomeResponse> {
    const community = query.community ?? '';
    const radiusKm = query.radiusKm;
    const grid = this.cache.gridCell(query.lat, query.lng);
    const key = this.cache.buildKey(
      community,
      radiusKm ?? 'all',
      `${grid}:${query.viewerId ?? 'anon'}`,
    );

    const cached = await this.cache.get<HomeResponse>(key);
    if (cached) return cached;

    const rails = await this.buildRails(query);
    const response: HomeResponse = {
      rails,
      community: community || undefined,
      radiusKm,
    };

    for (const rail of rails) {
      this.analytics.homeRailImpression({
        railId: rail.id,
        count: rail.items.length,
        community,
      });
    }

    await this.cache.set(key, response);
    return response;
  }

  /** Used by price-drops unit tests */
  async priceDropListingIds(minDropPct = 5): Promise<string[]> {
    const events = await this.prisma.listingEvent.findMany({
      where: { type: 'PRICE_CHANGED' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = new Set<string>();
    for (const ev of events) {
      const payload = ev.payload as { from?: number; to?: number } | null;
      if (!payload?.from || payload.to == null) continue;
      if (payload.from <= 0) continue;
      const drop = ((payload.from - payload.to) / payload.from) * 100;
      if (drop >= minDropPct) ids.add(ev.listingId);
    }
    return [...ids];
  }

  private async buildRails(query: {
    community?: string;
    radiusKm?: number;
    lat?: number;
    lng?: number;
    viewerId?: string | null;
  }): Promise<HomeRail[]> {
    const live = await this.prisma.listing.findMany({
      where: {
        status: 'LIVE',
        quantityAvailable: { gt: 0 },
        seller: { status: 'ACTIVE' },
        ...(query.community ? { community: query.community } : {}),
        AND: [this.visibility.visibleListingWhere(query.viewerId)],
      },
      include: {
        ...listingInclude,
        events: {
          where: { type: 'SAVED' },
          select: { type: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 60,
    });

    type Row = (typeof live)[number] & { distanceKm?: number | null };

    const withDistance: Row[] = live.map((row) => {
      let distanceKm: number | null = null;
      if (
        query.lat != null &&
        query.lng != null &&
        row.geoLat != null &&
        row.geoLng != null
      ) {
        distanceKm = haversineKm(
          query.lat,
          query.lng,
          row.geoLat,
          row.geoLng,
        );
      }
      return { ...row, distanceKm };
    });

    const inRadius = (rows: Row[]) => {
      if (query.radiusKm == null || query.lat == null || query.lng == null) {
        return rows;
      }
      return rows.filter(
        (r) => r.distanceKm != null && r.distanceKm <= query.radiusKm!,
      );
    };

    const toItems = (rows: Row[], limit = 12): PublicListingDto[] =>
      rows.slice(0, limit).map((r) =>
        toPublicListing(r, { viewerLat: query.lat, viewerLng: query.lng }),
      );

    const nearbyPool = inRadius(withDistance)
      .filter((r) => r.distanceKm != null)
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));

    const others = (rows: Row[]) =>
      query.viewerId
        ? rows.filter((row) => row.sellerId !== query.viewerId)
        : rows;
    const browse = others(withDistance);

    const justListed = [...browse].sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );

    const priceDropIds = new Set(await this.priceDropListingIds(5));
    const priceDrops = browse.filter((r) => priceDropIds.has(r.id));

    const popularMeta = new Map<
      string,
      { views: number; saves: number; publishedAt: Date | null }
    >();
    for (const r of browse) {
      const saves = r.events.filter((e) => e.type === 'SAVED').length;
      popularMeta.set(r.id, {
        views: r.views,
        saves,
        publishedAt: r.publishedAt,
      });
    }
    const popularNear = this.recommendations.rank(
      toItems(others(inRadius(withDistance)), 40),
      popularMeta,
    );

    const verified = others(withDistance).filter((r) =>
      r.seller?.verifications?.some(
        (v) => v.level === 'L3_IDENTITY' && v.status === 'VERIFIED',
      ),
    );

    let recommended: PublicListingDto[];
    if (query.viewerId) {
      recommended = (
        await this.recommendations.recommend({
          userId: query.viewerId,
          city: 'Lagos',
          limit: 12,
          surface: 'home',
          seed: `${query.viewerId}:home`,
        })
      ).filter((item) => item.seller.id !== query.viewerId);
    } else {
      recommended = this.recommendations
        .rank(toItems(browse, 40), popularMeta)
        .slice(0, 12);
    }

    const movingSaleItems = await this.movingSales.topForHome({
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      limit: 12,
    });

    const nearbyItems = others(nearbyPool);

    return [
      {
        id: 'nearby',
        title: 'Nearby',
        items: toItems(nearbyItems),
        emptyMessage:
          nearbyItems.length === 0
            ? 'No listings nearby — try expanding your radius'
            : undefined,
      },
      {
        id: 'just_listed',
        title: 'Just listed',
        items: toItems(justListed),
      },
      {
        id: 'price_drops',
        title: 'Price drops',
        items: toItems(priceDrops),
        emptyMessage:
          priceDrops.length === 0 ? 'No recent price drops' : undefined,
      },
      {
        id: 'popular_near_you',
        title: 'Popular near you',
        items: popularNear.slice(0, 12),
      },
      {
        id: 'verified_sellers',
        title: 'From verified sellers',
        items: toItems(verified),
      },
      {
        id: 'moving_sales',
        title: 'Moving sales',
        items: [],
        movingSales: movingSaleItems,
        emptyMessage:
          movingSaleItems.length === 0
            ? 'No active moving sales nearby'
            : undefined,
      },
      {
        id: 'recommended_for_you',
        title: 'Recommended for you',
        items: recommended.slice(0, 12),
      },
    ];
  }
}

