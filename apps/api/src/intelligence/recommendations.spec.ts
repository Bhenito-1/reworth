/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecommendationService } from '../intelligence/recommendation.service';
import { FeatureStoreService } from './feature-store.service';
import { mulberry32, seedFromString } from './rec-provider';
import { WeightedRecProvider } from './weighted-rec.provider';
import { experimentBucket } from './experiments.service';

describe('Recommendations v2', () => {
  it('mulberry32 is deterministic for a seed', () => {
    const a = mulberry32(seedFromString('fixed-seed'));
    const b = mulberry32(seedFromString('fixed-seed'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('A/B bucket is stable for userId:experimentKey', () => {
    const b1 = experimentBucket('user-abc', 'rec_home_v2');
    const b2 = experimentBucket('user-abc', 'rec_home_v2');
    expect(b1).toBe(b2);
    expect(b1).toBeGreaterThanOrEqual(0);
    expect(b1).toBeLessThan(100);
  });

  it('fixed feature snapshot + seed → fixed ordering; Lagos never gets Abuja', async () => {
    const listings = [
      {
        id: 'lagos-a',
        city: 'Lagos',
        title: 'A',
        description: '',
        brand: 'Samsung',
        model: null,
        categoryId: 'cat-tv',
        subcategoryId: null,
        condition: 'GOOD',
        priceKobo: 300_000_00,
        negotiable: true,
        sellingMode: 'SELL',
        status: 'LIVE',
        community: 'LEKKI',
        communityId: null,
        communityOnly: false,
        geoLat: null,
        geoLng: null,
        fulfilmentPickup: true,
        fulfilmentMeet: true,
        fulfilmentDelivery: false,
        createdAt: new Date('2026-01-01'),
        publishedAt: new Date('2026-01-10'),
        views: 10,
        vehicle: null,
        images: [],
        category: { id: 'cat-tv', slug: 'tvs', name: 'TVs' },
        subcategory: null,
        estateCommunity: null,
        movingSale: null,
        seller: {
          id: 's1',
          profile: { displayName: 'Ada' },
          verifications: [
            { level: 'L3_IDENTITY', status: 'VERIFIED' },
          ],
          trustScore: { avgRating: 4.5, tier: 'TRUSTED', medianResponseMinutes: 30 },
          _count: { reviewsReceived: 4 },
        },
      },
      {
        id: 'lagos-b',
        city: 'Lagos',
        title: 'B',
        description: '',
        brand: 'LG',
        model: null,
        categoryId: 'cat-tv',
        subcategoryId: null,
        condition: 'GOOD',
        priceKobo: 280_000_00,
        negotiable: true,
        sellingMode: 'SELL',
        status: 'LIVE',
        community: 'VI',
        communityId: null,
        communityOnly: false,
        geoLat: null,
        geoLng: null,
        fulfilmentPickup: true,
        fulfilmentMeet: true,
        fulfilmentDelivery: false,
        createdAt: new Date('2026-01-01'),
        publishedAt: new Date('2026-01-08'),
        views: 5,
        vehicle: null,
        images: [],
        category: { id: 'cat-tv', slug: 'tvs', name: 'TVs' },
        subcategory: null,
        estateCommunity: null,
        movingSale: null,
        seller: {
          id: 's2',
          profile: { displayName: 'Bola' },
          verifications: [],
          trustScore: { avgRating: 3, tier: null, medianResponseMinutes: 60 },
          _count: { reviewsReceived: 1 },
        },
      },
      {
        id: 'abuja-x',
        city: 'Abuja',
        title: 'X',
        description: '',
        brand: 'Samsung',
        model: null,
        categoryId: 'cat-tv',
        subcategoryId: null,
        condition: 'GOOD',
        priceKobo: 290_000_00,
        negotiable: true,
        sellingMode: 'SELL',
        status: 'LIVE',
        community: 'Maitama',
        communityId: null,
        communityOnly: false,
        geoLat: null,
        geoLng: null,
        fulfilmentPickup: true,
        fulfilmentMeet: true,
        fulfilmentDelivery: false,
        createdAt: new Date('2026-01-01'),
        publishedAt: new Date('2026-01-11'),
        views: 100,
        vehicle: null,
        images: [],
        category: { id: 'cat-tv', slug: 'tvs', name: 'TVs' },
        subcategory: null,
        estateCommunity: null,
        movingSale: null,
        seller: {
          id: 's3',
          profile: { displayName: 'Chidi' },
          verifications: [
            { level: 'L3_IDENTITY', status: 'VERIFIED' },
          ],
          trustScore: { avgRating: 5, tier: 'TOP', medianResponseMinutes: 10 },
          _count: { reviewsReceived: 10 },
        },
      },
    ];

    const prisma = {
      listing: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(async ({ where }: any) => {
          return listings.filter((l) => {
            if (where.city && l.city !== where.city) return false;
            if (where.status && l.status !== where.status) return false;
            return true;
          });
        }),
      },
      userFeature: { findUnique: jest.fn().mockResolvedValue(null) },
      listingFeature: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const config = { get: () => undefined };
    const features = new FeatureStoreService(prisma as never, config as never);
    features.seedHot('uf:user-1:Lagos', {
      categoryScores: { 'cat-tv': 2 },
      brandScores: { samsung: 3 },
      communityScores: { LEKKI: 2 },
      priceMidKobo: 300_000_00,
    });
    features.seedHot('lf:lagos-a:Lagos', { views: 10, saves: 5, offers: 1 });
    features.seedHot('lf:lagos-b:Lagos', { views: 5, saves: 1, offers: 0 });

    const provider = new WeightedRecProvider(prisma as never, features);

    const r1 = await provider.recommend({
      userId: 'user-1',
      city: 'Lagos',
      limit: 10,
      surface: 'home',
      seed: 'fixed-seed',
    });
    const r2 = await provider.recommend({
      userId: 'user-1',
      city: 'Lagos',
      limit: 10,
      surface: 'home',
      seed: 'fixed-seed',
    });

    expect(r1.map((x) => x.id)).toEqual(r2.map((x) => x.id));
    expect(r1.every((x) => x.city === 'Lagos')).toBe(true);
    expect(r1.find((x) => x.id === 'abuja-x')).toBeUndefined();
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ city: 'Lagos', status: 'LIVE' }),
      }),
    );
  });

  it('similar surface stays in the seed listing category', async () => {
    const prisma = {
      listing: {
        findUnique: jest.fn().mockResolvedValue({ categoryId: 'cat-phones' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const svc = new RecommendationService(prisma as never);
    await svc.recommend({
      city: 'Lagos',
      listingId: 'seed-1',
      limit: 6,
      surface: 'similar',
    });
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: 'cat-phones',
          city: 'Lagos',
          status: 'LIVE',
        }),
      }),
    );
  });

  it('RecommendationService anonymous uses popularity fallback', async () => {
    const prisma = {
      listing: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const svc = new RecommendationService(prisma as never);
    const items = await svc.recommend({
      city: 'Lagos',
      limit: 5,
      surface: 'home',
    });
    expect(items).toEqual([]);
    expect(prisma.listing.findMany).toHaveBeenCalled();
  });
});
