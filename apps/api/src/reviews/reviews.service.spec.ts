import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { TrustScoreService } from './trust-score.service';

describe('ReviewsService', () => {
  const notifications = {
    notify: jest.fn().mockResolvedValue({ created: [], skipped: [] }),
    log: jest.fn(),
  };

  function makePrisma(state: {
    order: {
      id: string;
      status: string;
      buyerId: string;
      sellerId: string;
    };
    reviews: Map<string, Record<string, unknown>>;
  }) {
    return {
      order: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === state.order.id ? state.order : null,
        ),
        count: jest.fn(async () => 3),
      },
      review: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: {
              id?: string;
              orderId_reviewerId?: { orderId: string; reviewerId: string };
            };
          }) => {
            if (where.id) {
              return (
                [...state.reviews.values()].find((r) => r.id === where.id) ??
                null
              );
            }
            const key = `${where.orderId_reviewerId!.orderId}:${where.orderId_reviewerId!.reviewerId}`;
            return state.reviews.get(key) ?? null;
          },
        ),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
          const row = [...state.reviews.values()].find((r) => r.id === where.id);
          if (!row) throw new Error('missing');
          return row;
        }),
        findMany: jest.fn(async () =>
          [...state.reviews.values()]
            .filter((r) => r.status === ReviewStatus.PUBLISHED)
            .map((r) => ({
              ...r,
              order: (r.order as { buyerId: string } | undefined) ?? {
                buyerId: r.reviewerId,
              },
            })),
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `rev-${state.reviews.size + 1}`,
            reply: null,
            repliedAt: null,
            publishedAt: null,
            createdAt: new Date(),
            photoKeys: data.photoKeys ?? [],
            ...data,
          };
          state.reviews.set(`${data.orderId}:${data.reviewerId}`, row);
          return row;
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { orderId: string; status: ReviewStatus };
            data: Record<string, unknown>;
          }) => {
            for (const [k, r] of state.reviews) {
              if (r.orderId === where.orderId && r.status === where.status) {
                state.reviews.set(k, { ...r, ...data });
              }
            }
            return { count: 2 };
          },
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            for (const [k, r] of state.reviews) {
              if (r.id === where.id) {
                const next = { ...r, ...data };
                state.reviews.set(k, next);
                return next;
              }
            }
            throw new Error('missing');
          },
        ),
        aggregate: jest.fn(async () => ({
          _avg: { overall: 4.5 },
          _count: { _all: 2 },
        })),
      },
      reviewReport: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'report-1',
          ...data,
        })),
      },
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === 'ghost') return null;
          return {
            id: where.id,
            phone: '+2348011111111',
            email: 'secret@example.com',
            status: 'ACTIVE',
            deletedAt: null,
            createdAt: new Date('2025-06-01'),
            profile: {
              displayName: 'Ada',
              avatarUrl: null,
            },
            verifications: [{ level: 'L3_IDENTITY', status: 'VERIFIED' }],
            trustScore: {
              score: 55,
              tier: null,
              medianResponseMinutes: 12,
              avgRating: 4.5,
            },
          };
        }),
      },
      listing: {
        findMany: jest.fn(async () => []),
      },
      sellerFollow: {
        findUnique: jest.fn(async () => null),
      },
    };
  }

  it('cannot review without completed order → 403', async () => {
    const state = {
      order: {
        id: 'order-1',
        status: 'FUNDED',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      },
      reviews: new Map<string, Record<string, unknown>>(),
    };
    const prisma = makePrisma(state);
    const trust = { recompute: jest.fn() } as unknown as TrustScoreService;
    const service = new ReviewsService(
      prisma as never,
      notifications as never,
      trust,
    );

    await expect(
      service.createForOrder('order-1', 'buyer-1', {
        overall: 5,
        accuracy: 5,
        communication: 5,
        punctuality: 5,
        transactionExperience: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publishes a buyer rating immediately and refuses a seller rating', async () => {
    const state = {
      order: {
        id: 'order-1',
        status: 'COMPLETED',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      },
      reviews: new Map<string, Record<string, unknown>>(),
    };
    const prisma = makePrisma(state);
    const trust = { recompute: jest.fn().mockResolvedValue({}) } as unknown as TrustScoreService;
    const service = new ReviewsService(
      prisma as never,
      notifications as never,
      trust,
    );

    const first = await service.createForOrder('order-1', 'buyer-1', {
      overall: 5,
      accuracy: 4,
      communication: 5,
      punctuality: 4,
      transactionExperience: 5,
    });
    expect(first.status).toBe(ReviewStatus.PUBLISHED);
    expect(first.revieweeId).toBe('seller-1');

    const published = await service.listPublishedForUser('seller-1');
    expect(published).toHaveLength(1);

    await expect(
      service.createForOrder('order-1', 'seller-1', {
        overall: 4,
        accuracy: 4,
        communication: 4,
        punctuality: 5,
        transactionExperience: 4,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(trust.recompute).toHaveBeenCalledWith('seller-1', 'review_published');
  });

  it('single reply rule', async () => {
    const state = {
      order: {
        id: 'order-1',
        status: 'COMPLETED',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      },
      reviews: new Map<string, Record<string, unknown>>([
        [
          'order-1:buyer-1',
          {
            id: 'rev-1',
            orderId: 'order-1',
            reviewerId: 'buyer-1',
            revieweeId: 'seller-1',
            status: ReviewStatus.PUBLISHED,
            reply: null,
            repliedAt: null,
            overall: 5,
            accuracy: 5,
            communication: 5,
            punctuality: 5,
            transactionExperience: 5,
            body: null,
            photoKeys: [],
            publishedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      ]),
    };
    const prisma = makePrisma(state);
    const service = new ReviewsService(
      prisma as never,
      notifications as never,
      { recompute: jest.fn() } as never,
    );

    await service.reply('rev-1', 'seller-1', { text: 'Thanks!' });
    await expect(
      service.reply('rev-1', 'seller-1', { text: 'Again' }),
    ).rejects.toThrow(/already/i);
  });

  it('sub-rating validation rejects out of range', async () => {
    const state = {
      order: {
        id: 'order-1',
        status: 'COMPLETED',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      },
      reviews: new Map<string, Record<string, unknown>>(),
    };
    const prisma = makePrisma(state);
    const service = new ReviewsService(
      prisma as never,
      notifications as never,
      { recompute: jest.fn() } as never,
    );

    await expect(
      service.createForOrder('order-1', 'buyer-1', {
        overall: 6,
        accuracy: 5,
        communication: 5,
        punctuality: 5,
        transactionExperience: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('averages buyer process ratings from other and similar items', async () => {
    const state = {
      order: {
        id: 'order-1',
        status: 'COMPLETED',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      },
      reviews: new Map<string, Record<string, unknown>>(),
    };
    const prisma = makePrisma(state) as ReturnType<typeof makePrisma> & {
      listing: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
      };
    };
    prisma.listing.findUnique = jest.fn(async () => ({
      id: 'listing-open',
      sellerId: 'seller-1',
      categoryId: 'cat-a',
      quantitySold: 0,
    }));
    const reviewFields = {
      accuracy: 5,
      communication: 5,
      punctuality: 5,
      overall: 5,
      body: 'Smooth handover',
      photoKeys: [],
      status: ReviewStatus.PUBLISHED,
      reply: null,
      repliedAt: null,
      publishedAt: new Date(),
      createdAt: new Date(),
    };
    prisma.review.findMany = jest.fn(async () => [
      {
        ...reviewFields,
        id: 'rev-similar',
        orderId: 'order-9',
        reviewerId: 'buyer-2',
        revieweeId: 'seller-1',
        transactionExperience: 4,
        order: {
          id: 'order-9',
          buyerId: 'buyer-2',
          checkoutId: null,
          listing: { id: 'other', title: 'Side lamp', categoryId: 'cat-a' },
        },
        reviewer: { id: 'buyer-2', profile: { displayName: 'Tunde', avatarUrl: null } },
      },
      {
        ...reviewFields,
        id: 'rev-from-seller',
        orderId: 'order-8',
        reviewerId: 'seller-1',
        revieweeId: 'buyer-2',
        transactionExperience: 1,
        order: {
          buyerId: 'buyer-2',
          listing: { id: 'other', title: 'Side lamp', categoryId: 'cat-a' },
        },
        reviewer: { id: 'seller-1', profile: { displayName: 'Seller', avatarUrl: null } },
      },
    ]);
    const service = new ReviewsService(
      prisma as never,
      notifications as never,
      { recompute: jest.fn() } as never,
    );

    const result = await service.listForListing('listing-open');
    expect(result.soldUnits).toBe(0);
    expect(result.seller.count).toBe(1);
    expect(result.seller.average).toBe(4);
    expect(result.seller.items[0]?.similar).toBe(true);
    expect(result.seller.items[0]?.listingTitle).toBe('Side lamp');
    expect(result.count).toBe(0);
  });

  it('public profile DTO has no phone/email/score when tier low', async () => {
    const state = {
      order: {
        id: 'order-1',
        status: 'COMPLETED',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      },
      reviews: new Map<string, Record<string, unknown>>(),
    };
    const prisma = makePrisma(state);
    const service = new ReviewsService(
      prisma as never,
      notifications as never,
      { recompute: jest.fn() } as never,
    );

    const profile = await service.getPublicProfile('seller-1');
    expect(profile).not.toHaveProperty('phone');
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('score');
    expect(profile.trustTier).toBeNull();
    expect(profile.displayName).toBe('Ada');
    expect(profile.usuallyRespondsWithinMinutes).toBe(12);
    expect(profile.identityVerified).toBe(true);
  });
});

describe('Admin trust-score shape', () => {
  it('breakdown DTO includes numeric score', async () => {
    const prisma = {
      trustScore: {
        findUnique: jest.fn(async () => ({
          userId: 'u1',
          score: 82,
          tier: 'TRUSTED',
          completionRate: 0.9,
          avgRating: 4.5,
          medianResponseMinutes: 15,
          cancellationRate: 0.05,
          disputeRate: 0.02,
          accountAgeDays: 200,
          verificationPoints: 100,
          computedAt: new Date(),
        })),
      },
      user: { findUnique: jest.fn() },
    };
    const service = new TrustScoreService(prisma as never);
    const dto = await service.getBreakdown('u1');
    expect(typeof dto.score).toBe('number');
    expect(dto.score).toBe(82);
    expect(dto.tier).toBe('TRUSTED');
    expect(dto.publicBadge).toBe('Trusted');
  });
});
