import { PostgresFullTextSearchProvider } from '../providers/search.provider';

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Sofa set',
    description: 'Comfy',
    brand: null,
    model: null,
    condition: 'GOOD',
    priceKobo: 200_000_00,
    negotiable: true,
    sellingMode: 'SELL',
    status: 'LIVE',
    community: 'LEKKI_PH1',
    geoLat: 6.44,
    geoLng: 3.47,
    fulfilmentPickup: true,
    fulfilmentMeet: true,
    fulfilmentDelivery: false,
    createdAt: new Date('2026-01-01'),
    publishedAt: new Date('2026-01-01'),
    vehicle: null,
    categoryId: 'cat-furniture',
    category: {
      id: 'cat-furniture',
      slug: 'home-furniture',
      name: 'Home & Furniture',
    },
    images: [],
    seller: {
      id: 'seller-1',
      profile: { displayName: 'Ada' },
      verifications: [],
    },
    ...overrides,
  };
}

describe('search filters', () => {
  it('filters by priceMaxKobo and categoryId', async () => {
    const rows = [
      listing({
        id: 'cheap',
        priceKobo: 100_000_00,
        title: 'Cheap sofa',
      }),
      listing({
        id: 'pricey',
        priceKobo: 800_000_00,
        title: 'Pricey sofa',
      }),
      listing({
        id: 'tv',
        title: 'TV',
        priceKobo: 50_000_00,
        categoryId: 'cat-electronics',
        category: {
          id: 'cat-electronics',
          slug: 'electronics',
          name: 'Electronics',
        },
      }),
    ];

    const prisma = {
      listing: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          let out = rows;
          const and = where.AND as
            | Array<{ OR?: Array<Record<string, unknown>> }>
            | undefined;
          const categoryOr = and?.find((c) => c.OR)?.OR;
          const parentCategoryId = categoryOr?.find(
            (c) => c.categoryId != null,
          )?.categoryId as string | undefined;
          if (parentCategoryId) {
            out = out.filter((r) => r.categoryId === parentCategoryId);
          } else if (where.categoryId) {
            out = out.filter((r) => r.categoryId === where.categoryId);
          }
          if (where.subcategoryId) {
            out = out.filter(
              (r) =>
                (r as { subcategoryId?: string }).subcategoryId ===
                where.subcategoryId,
            );
          }
          if (where.priceKobo?.lte != null) {
            out = out.filter((r) => r.priceKobo <= where.priceKobo.lte);
          }
          if (where.priceKobo?.gte != null) {
            out = out.filter((r) => r.priceKobo >= where.priceKobo.gte);
          }
          return Promise.resolve(out);
        }),
      },
    };

    const provider = new PostgresFullTextSearchProvider(prisma as never);
    const result = await provider.search({
      categoryId: 'cat-furniture',
      priceMaxKobo: 300_000_00,
      sort: 'newest',
    });

    expect(prisma.listing.findMany).toHaveBeenCalled();
    expect(result.items.map((i) => i.id)).toEqual(['cheap']);
    expect(result.facets.categories[0]?.slug).toBe('home-furniture');
    for (const item of result.items) {
      expect(item).not.toHaveProperty('addressPrivate');
    }
  });

  it('filters by communityMatch variants', async () => {
    const rows = [
      listing({ id: 'a', community: 'LEKKI_PH1' }),
      listing({ id: 'b', community: 'VI' }),
    ];
    const prisma = {
      listing: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const and = where.AND as Array<{
            OR?: Array<{ community?: { equals: string } }>;
          }>;
          const communityOr = and?.find((c) => c.OR?.[0]?.community)?.OR;
          const allowed = new Set(
            communityOr?.map((c) => c.community?.equals).filter(Boolean),
          );
          const out = rows.filter((r) => allowed.has(r.community));
          return Promise.resolve(out);
        }),
      },
    };
    const provider = new PostgresFullTextSearchProvider(prisma as never);
    const result = await provider.search({
      communityMatch: ['Lekki Ph1', 'LEKKI_PH1'],
    });
    expect(result.items.map((i) => i.id)).toEqual(['a']);
  });

  it('filters deliveryAvailable', async () => {
    const rows = [
      listing({ id: 'd1', fulfilmentDelivery: true, title: 'With delivery' }),
      listing({ id: 'd0', fulfilmentDelivery: false, title: 'Pickup only' }),
    ];
    const prisma = {
      listing: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          let out = rows;
          if (where.fulfilmentDelivery === true) {
            out = out.filter((r) => r.fulfilmentDelivery);
          }
          return Promise.resolve(out);
        }),
      },
    };
    const provider = new PostgresFullTextSearchProvider(prisma as never);
    const result = await provider.search({ deliveryAvailable: true });
    expect(result.items.map((i) => i.id)).toEqual(['d1']);
  });
});
