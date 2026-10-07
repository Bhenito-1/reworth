import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PublicListingDto } from '../listings/public-listing.mapper';
import { toPublicListing } from '../listings/public-listing.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CITY, normalizeCity } from './city-scope';
import { ExperimentsService, REC_HOME_EXPERIMENT_KEY } from './experiments.service';
import {
  REC_PROVIDER,
  type RecContext,
  type RecProvider,
  type RecSurface,
} from './rec-provider';

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
      trustScore: true,
      _count: { select: { reviewsReceived: true } },
    },
  },
} satisfies Prisma.ListingInclude;

/** v1 popularity blend + v2 RecProvider when personalized. */
@Injectable()
export class RecommendationService {
  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() @Inject(REC_PROVIDER) private readonly recProvider?: RecProvider,
    @Optional() private readonly experiments?: ExperimentsService,
  ) {}

  score(listing: {
    views: number;
    saves: number;
    publishedAt: Date | null;
    distanceKm?: number | null;
  }): number {
    const recencyBoost = listing.publishedAt
      ? Math.max(
          0,
          1 -
            (Date.now() - listing.publishedAt.getTime()) /
              (7 * 24 * 60 * 60 * 1000),
        )
      : 0;
    const distancePenalty =
      listing.distanceKm != null ? Math.min(listing.distanceKm / 25, 1) : 0.5;
    return (
      listing.views * 1 +
      listing.saves * 3 +
      recencyBoost * 10 -
      distancePenalty * 5
    );
  }

  rank(
    listings: Array<
      PublicListingDto & { views?: number; saves?: number; _score?: number }
    >,
    meta: Map<string, { views: number; saves: number; publishedAt: Date | null }>,
  ): PublicListingDto[] {
    return [...listings]
      .map((item) => {
        const m = meta.get(item.id) ?? {
          views: 0,
          saves: 0,
          publishedAt: item.publishedAt,
        };
        const _score = this.score({
          views: m.views,
          saves: m.saves,
          publishedAt: m.publishedAt,
          distanceKm: item.distanceKm,
        });
        return { item, _score };
      })
      .sort((a, b) => b._score - a._score)
      .map((x) => x.item);
  }

  /**
   * Personalized recommendations when userId present + experiment treatment;
   * anonymous / control falls back to v1 popularity within city.
   */
  async recommend(ctx: {
    userId?: string | null;
    city?: string;
    listingId?: string;
    limit?: number;
    surface?: RecSurface;
    seed?: string | number;
  }): Promise<PublicListingDto[]> {
    const city = normalizeCity(ctx.city ?? DEFAULT_CITY);
    const limit = Math.min(Math.max(ctx.limit ?? 12, 1), 40);
    const surface = ctx.surface ?? 'home';

    if (ctx.userId && this.recProvider && this.experiments) {
      const variant = await this.experiments.assignVariant(
        ctx.userId,
        REC_HOME_EXPERIMENT_KEY,
      );
      if (variant === 'weighted_v2') {
        const recCtx: RecContext = {
          userId: ctx.userId,
          city,
          listingId: ctx.listingId,
          limit,
          surface,
          seed: ctx.seed ?? `${ctx.userId}:${surface}`,
        };
        return this.recProvider.recommend(recCtx);
      }
    } else if (ctx.userId && this.recProvider && !this.experiments) {
      return this.recProvider.recommend({
        userId: ctx.userId,
        city,
        listingId: ctx.listingId,
        limit,
        surface,
        seed: ctx.seed ?? `${ctx.userId}:${surface}`,
      });
    }

    return this.popularityFallback({ city, listingId: ctx.listingId, limit });
  }

  private async popularityFallback(input: {
    city: string;
    listingId?: string;
    limit: number;
  }): Promise<PublicListingDto[]> {
    if (!this.prisma) return [];

    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'LIVE',
        seller: { status: 'ACTIVE' },
        city: input.city,
        ...(input.listingId ? { id: { not: input.listingId } } : {}),
      },
      include: {
        ...listingInclude,
        events: {
          where: { type: 'SAVED' },
          select: { type: true },
        },
      },
      take: 80,
      orderBy: { publishedAt: 'desc' },
    });

    const meta = new Map<
      string,
      { views: number; saves: number; publishedAt: Date | null }
    >();
    const dtos: PublicListingDto[] = [];
    for (const r of rows) {
      meta.set(r.id, {
        views: r.views,
        saves: r.events.length,
        publishedAt: r.publishedAt,
      });
      dtos.push(toPublicListing(r));
    }
    return this.rank(dtos, meta).slice(0, input.limit);
  }
}
