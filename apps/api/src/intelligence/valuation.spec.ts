/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  meanAbsoluteErrorKobo,
  percentile,
} from './valuation.provider';
import { SoldDataValuationProvider } from './sold-data-valuation.provider';

describe('Valuation v2', () => {
  it('percentile helper (documented MAE target uses median train)', () => {
    expect(percentile([100, 200, 300, 400, 500], 50)).toBe(300);
    expect(percentile([100, 200, 300, 400, 500], 25)).toBe(200);
    expect(percentile([100, 200, 300, 400, 500], 90)).toBe(460);
  });

  /**
   * Documented MAE target helper: held-out actuals vs train-median predictions.
   * Target: MAE trends down as sold comps grow (Phase 2.3 acceptance).
   */
  it('meanAbsoluteErrorKobo documents MAE helper target', () => {
    const mae = meanAbsoluteErrorKobo(
      [100_000_00, 120_000_00, 80_000_00],
      [100_000_00, 100_000_00, 100_000_00],
    );
    expect(mae).toBeCloseTo((0 + 20_000_00 + 20_000_00) / 3);
  });

  it('sold comps fixture shows Based on N', async () => {
    const prices = [250, 280, 300, 310, 320, 340, 360].map((n) => n * 100_000);
    const orders = prices.map((amountKobo, i) => ({
      amountKobo,
      listing: {
        brand: 'Samsung',
        condition: 'GOOD',
        categoryId: 'cat-1',
        priceKobo: amountKobo,
        city: 'Lagos',
      },
      completedAt: new Date(Date.now() - i * 86_400_000),
    }));

    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
      },
      listing: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const fraud = { estimateLowKobo: jest.fn().mockReturnValue(0) };
    const config = {
      get: (k: string) => (k === 'VALUATION_MIN_SAMPLES' ? '5' : undefined),
    };

    const provider = new SoldDataValuationProvider(
      prisma as never,
      fraud as never,
      config as never,
    );

    const result = await provider.value({
      id: 'listing-1',
      city: 'Lagos',
      categoryId: 'cat-1',
      brand: 'Samsung',
      condition: 'GOOD',
      priceKobo: 300_000_00,
      title: 'Samsung TV',
      model: null,
      originalPriceKobo: null,
    });

    expect(result.basis).toBe('sold_data');
    expect(result.sampleCount).toBe(7);
    expect(result.confidenceLabel).toBe('Based on 7 similar sold items');
    expect(result.quickSaleKobo).toBeGreaterThan(0);
    expect(result.maxValueKobo).toBeGreaterThanOrEqual(result.quickSaleKobo);
    expect(result.city).toBe('Lagos');
  });

  it('cold start fallback when sold comps < VALUATION_MIN_SAMPLES', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            amountKobo: 100_000_00,
            listing: {
              brand: 'X',
              condition: 'GOOD',
              categoryId: 'cat-1',
              priceKobo: 100_000_00,
              city: 'Lagos',
            },
          },
        ]),
      },
      listing: {
        findMany: jest.fn().mockResolvedValue([
          { priceKobo: 90_000_00 },
          { priceKobo: 100_000_00 },
          { priceKobo: 110_000_00 },
        ]),
      },
    };
    const fraud = { estimateLowKobo: jest.fn().mockReturnValue(0) };
    const config = {
      get: (k: string) => (k === 'VALUATION_MIN_SAMPLES' ? '5' : undefined),
    };

    const provider = new SoldDataValuationProvider(
      prisma as never,
      fraud as never,
      config as never,
    );

    const result = await provider.value({
      id: 'listing-cold',
      city: 'Lagos',
      categoryId: 'cat-1',
      brand: 'X',
      condition: 'GOOD',
      priceKobo: 100_000_00,
      title: 'Widget',
      model: null,
      originalPriceKobo: null,
    });

    expect(result.basis).toBe('live_listings_fallback');
    expect(result.confidenceLabel).toBe('From live listings');
  });
});
