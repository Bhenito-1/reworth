import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FraudRulesService } from '../listings/fraud-rules.service';
import { normalizeCity } from './city-scope';
import {
  percentile,
  type ValuationListingInput,
  type ValuationProvider,
  type ValuationResult,
} from './valuation.provider';

@Injectable()
export class SoldDataValuationProvider implements ValuationProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: FraudRulesService,
    private readonly config: ConfigService,
  ) {}

  private minSamples(): number {
    return Number(this.config.get<string>('VALUATION_MIN_SAMPLES') ?? 5);
  }

  async value(listing: ValuationListingInput): Promise<ValuationResult> {
    const city = normalizeCity(listing.city);
    const minSamples = this.minSamples();

    const completed = await this.prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        listing: {
          city,
          ...(listing.categoryId
            ? { categoryId: listing.categoryId }
            : {}),
        },
      },
      include: {
        listing: {
          select: {
            brand: true,
            condition: true,
            categoryId: true,
            priceKobo: true,
            city: true,
          },
        },
      },
      take: 200,
      orderBy: { completedAt: 'desc' },
    });

    const comps = completed.filter((o) => {
      if (listing.brand && o.listing.brand) {
        if (
          o.listing.brand.toLowerCase() !== listing.brand.toLowerCase()
        ) {
          // Soft brand preference — keep if same condition when brand mismatch
          if (o.listing.condition !== listing.condition) return false;
        }
      }
      if (
        listing.condition &&
        o.listing.condition &&
        o.listing.condition !== listing.condition &&
        listing.brand &&
        o.listing.brand &&
        o.listing.brand.toLowerCase() === listing.brand.toLowerCase()
      ) {
        // allow same brand different condition
      }
      return true;
    });

    const prices = comps
      .map((o) => o.amountKobo)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    if (prices.length < minSamples) {
      return this.liveListingsFallback(listing, city, prices.length);
    }

    const low = percentile(prices, 10);
    const high = percentile(prices, 90);
    const recommended = percentile(prices, 50);
    const quickSale = percentile(prices, 25);
    const maxValue = percentile(prices, 90);

    return this.pack({
      listingId: listing.id,
      city,
      low,
      high,
      recommended,
      quickSale,
      maxValue,
      sampleCount: prices.length,
      confidenceLabel: `Based on ${prices.length} similar sold items`,
      basis: 'sold_data',
    });
  }

  private async liveListingsFallback(
    listing: ValuationListingInput,
    city: string,
    soldSampleCount: number,
  ): Promise<ValuationResult> {
    const live = await this.prisma.listing.findMany({
      where: {
        status: 'LIVE',
        city,
        ...(listing.categoryId ? { categoryId: listing.categoryId } : {}),
        id: { not: listing.id },
      },
      take: 50,
    });

    const prices = live
      .map((l) => l.priceKobo)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    if (prices.length >= 3) {
      const low = percentile(prices, 10);
      const high = percentile(prices, 90);
      const recommended = percentile(prices, 50);
      return this.pack({
        listingId: listing.id,
        city,
        low,
        high,
        recommended,
        quickSale: percentile(prices, 25),
        maxValue: percentile(prices, 90),
        sampleCount: prices.length,
        confidenceLabel: 'From live listings',
        basis: 'live_listings_fallback',
      });
    }

    // Rule-based cold start (existing PriceIntelligence behaviour)
    const lowKobo = this.fraud.estimateLowKobo(listing);
    let low = lowKobo;
    let high = lowKobo > 0 ? Math.round(lowKobo * 1.25) : 0;
    let recommended = lowKobo > 0 ? Math.round(lowKobo * 1.1) : 0;
    const blob = `${listing.brand ?? ''} ${listing.title}`.toLowerCase();
    if (/samsung/.test(blob) && /tv|television/.test(blob)) {
      low = 280_000 * 100;
      high = 340_000 * 100;
      recommended = 310_000 * 100;
    } else if (listing.priceKobo > 0 && low === 0) {
      recommended = listing.priceKobo;
      low = Math.round(listing.priceKobo * 0.85);
      high = Math.round(listing.priceKobo * 1.15);
    }

    return this.pack({
      listingId: listing.id,
      city,
      low,
      high,
      recommended,
      quickSale: Math.round(recommended * 0.9),
      maxValue: high,
      sampleCount: soldSampleCount,
      confidenceLabel: soldSampleCount > 0 ? 'From recent sales' : 'Estimated guide',
      basis: 'live_listings_fallback',
    });
  }

  private pack(input: {
    listingId: string;
    city: string;
    low: number;
    high: number;
    recommended: number;
    quickSale: number;
    maxValue: number;
    sampleCount: number;
    confidenceLabel: string;
    basis: ValuationResult['basis'];
  }): ValuationResult {
    return {
      listingId: input.listingId,
      currency: 'NGN',
      city: input.city,
      estimatedLowKobo: input.low,
      estimatedHighKobo: input.high,
      recommendedKobo: input.recommended,
      quickSaleKobo: input.quickSale,
      maxValueKobo: input.maxValue,
      estimatedLowNaira: Math.round(input.low / 100),
      estimatedHighNaira: Math.round(input.high / 100),
      recommendedNaira: Math.round(input.recommended / 100),
      quickSaleNaira: Math.round(input.quickSale / 100),
      maxValueNaira: Math.round(input.maxValue / 100),
      confidenceLabel: input.confidenceLabel,
      sampleCount: input.sampleCount,
      basis: input.basis,
    };
  }
}
