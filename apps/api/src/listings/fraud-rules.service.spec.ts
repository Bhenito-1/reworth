import { FraudRulesService } from './fraud-rules.service';

describe('FraudRulesService', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      listing: {
        findUnique: jest.fn(),
      },
      listingImage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    };
  }

  it('flags duplicate dHash → forceUnderReview + risk event', async () => {
    const prisma = buildPrisma();
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      id: 'listing-a',
      brand: 'X',
      title: 'Item',
      model: null,
      originalPriceKobo: null,
      priceKobo: 50_000_00,
      images: [
        {
          id: 'img-1',
          dHash: 'aaaaaaaaaaaaaaaa',
          status: 'READY',
        },
      ],
    });
    (prisma.listingImage.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'img-other',
        listingId: 'listing-b',
        dHash: 'aaaaaaaaaaaaaaaa',
      },
    ]);

    const service = new FraudRulesService(prisma as never);
    const result = await service.evaluateListing('listing-a');
    expect(result.forceUnderReview).toBe(true);
    expect(result.flags).toContain('DUPLICATE_IMAGE');
    expect(result.riskEvents[0].kind).toBe('DUPLICATE_IMAGE');
  });

  it('does not flag low price (estimate helper is static; not used for risk)', async () => {
    const prisma = buildPrisma();
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      id: 'listing-tv',
      brand: 'Samsung',
      title: 'Samsung Smart TV 55',
      model: '55-inch',
      originalPriceKobo: null,
      priceKobo: 50_000_00,
      images: [],
    });

    const service = new FraudRulesService(prisma as never);
    const result = await service.evaluateListing('listing-tv');
    expect(result.forceUnderReview).toBe(false);
    expect(result.flags).not.toContain('LOW_PRICE');
  });
});
