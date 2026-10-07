import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  toPublicListing,
  type PublicListingDto,
} from '../listings/public-listing.mapper';
import { normalizeCity } from './city-scope';
import { FeatureStoreService } from './feature-store.service';
import {
  mulberry32,
  seedFromString,
  type RecContext,
  type RecProvider,
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

type UserFeat = {
  categoryScores?: Record<string, number>;
  brandScores?: Record<string, number>;
  priceMidKobo?: number;
  communityScores?: Record<string, number>;
};

type ListingFeat = {
  views?: number;
  saves?: number;
  offers?: number;
};

@Injectable()
export class WeightedRecProvider implements RecProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureStoreService,
  ) {}

  async recommend(ctx: RecContext): Promise<PublicListingDto[]> {
    const city = normalizeCity(ctx.city);
    const limit = Math.min(Math.max(ctx.limit ?? 12, 1), 40);

    const seedKey =
      ctx.seed != null
        ? String(ctx.seed)
        : `${ctx.userId ?? 'anon'}:${ctx.surface}:${city}:${ctx.listingId ?? ''}`;
    const rng = mulberry32(seedFromString(seedKey));

    let seedListing: {
      categoryId: string | null;
      brand: string | null;
      priceKobo: number;
      community: string;
      city: string;
    } | null = null;

    if (ctx.listingId) {
      seedListing = await this.prisma.listing.findUnique({
        where: { id: ctx.listingId },
        select: {
          categoryId: true,
          brand: true,
          priceKobo: true,
          community: true,
          city: true,
        },
      });
      if (seedListing && seedListing.city !== city) {
        return [];
      }
    }

    const userFeat = ctx.userId
      ? ((await this.features.getUserFeatures(ctx.userId, city)) as UserFeat)
      : ({} as UserFeat);

    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'LIVE',
        seller: { status: 'ACTIVE' },
        city, // HARD city filter
        ...(ctx.listingId ? { id: { not: ctx.listingId } } : {}),
      },
      include: listingInclude,
      take: 200,
      orderBy: { publishedAt: 'desc' },
    });

    const scored = await Promise.all(
      rows.map(async (row) => {
        const lf = (await this.features.getListingFeatures(
          row.id,
          city,
        )) as ListingFeat;
        const score = this.score({
          row,
          userFeat,
          listingFeat: lf,
          seedListing,
          rng,
        });
        return { row, score };
      }),
    );

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.row.id.localeCompare(b.row.id);
    });

    return scored.slice(0, limit).map(({ row }) => toPublicListing(row));
  }

  private score(input: {
    row: {
      id: string;
      categoryId: string | null;
      brand: string | null;
      priceKobo: number;
      community: string;
      publishedAt: Date | null;
      views: number;
      seller?: {
        trustScore?: { avgRating: number | null; tier: string | null } | null;
        verifications?: Array<{ level: string; status: string }>;
      };
    };
    userFeat: UserFeat;
    listingFeat: ListingFeat;
    seedListing: {
      categoryId: string | null;
      brand: string | null;
      priceKobo: number;
      community: string;
    } | null;
    rng: () => number;
  }): number {
    const { row, userFeat, listingFeat, seedListing, rng } = input;
    const now = Date.now();
    const recency = row.publishedAt
      ? Math.max(
          0,
          1 -
            (now - row.publishedAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
        )
      : 0;

    let categorySim = 0;
    if (seedListing?.categoryId && row.categoryId === seedListing.categoryId) {
      categorySim = 1;
    } else if (row.categoryId && userFeat.categoryScores?.[row.categoryId]) {
      categorySim = Math.min(1, userFeat.categoryScores[row.categoryId]!);
    }

    let brandSim = 0;
    const brand = (row.brand ?? '').toLowerCase();
    if (seedListing?.brand && brand === seedListing.brand.toLowerCase()) {
      brandSim = 1;
    } else if (brand && userFeat.brandScores?.[brand]) {
      brandSim = Math.min(1, userFeat.brandScores[brand]!);
    }

    let priceSim = 0.5;
    const refPrice =
      seedListing?.priceKobo ?? userFeat.priceMidKobo ?? row.priceKobo;
    if (refPrice > 0 && row.priceKobo > 0) {
      const ratio =
        Math.min(refPrice, row.priceKobo) / Math.max(refPrice, row.priceKobo);
      priceSim = ratio;
    }

    let communityAffinity = 0;
    if (
      seedListing?.community &&
      row.community &&
      row.community === seedListing.community
    ) {
      communityAffinity = 1;
    } else if (row.community && userFeat.communityScores?.[row.community]) {
      communityAffinity = Math.min(
        1,
        userFeat.communityScores[row.community]!,
      );
    }

    const verified = Boolean(
      row.seller?.verifications?.some(
        (v) => v.level === 'L3_IDENTITY' && v.status === 'VERIFIED',
      ),
    );
    const avg = row.seller?.trustScore?.avgRating ?? 0;
    const sellerTrust = (verified ? 0.5 : 0) + Math.min(0.5, avg / 10);

    const engagement =
      (listingFeat.views ?? row.views) * 0.01 +
      (listingFeat.saves ?? 0) * 0.05 +
      (listingFeat.offers ?? 0) * 0.1;

    // Tiny deterministic jitter so ties break stably under a seed
    const jitter = rng() * 0.01;

    return (
      recency * 10 +
      categorySim * 8 +
      brandSim * 6 +
      priceSim * 4 +
      communityAffinity * 5 +
      sellerTrust * 7 +
      engagement +
      jitter
    );
  }
}
