import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FraudRulesService } from './fraud-rules.service';
import {
  VALUATION_PROVIDER,
  type ValuationProvider,
} from '../intelligence/valuation.provider';
import { DEFAULT_CITY, normalizeCity } from '../intelligence/city-scope';

@Injectable()
export class PriceIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: FraudRulesService,
    @Optional()
    @Inject(VALUATION_PROVIDER)
    private readonly valuation?: ValuationProvider,
  ) {}

  async getForListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    if (this.valuation) {
      return this.valuation.value({
        id: listing.id,
        city: normalizeCity(listing.city ?? DEFAULT_CITY),
        categoryId: listing.categoryId,
        brand: listing.brand,
        condition: listing.condition,
        priceKobo: listing.priceKobo,
        title: listing.title,
        model: listing.model,
        originalPriceKobo: listing.originalPriceKobo,
      });
    }

    // Legacy rule-based fallback when ValuationProvider not wired
    const lowKobo = this.fraud.estimateLowKobo(listing);
    const blob = `${listing.brand ?? ''} ${listing.title}`.toLowerCase();

    let low = lowKobo;
    let high = lowKobo > 0 ? Math.round(lowKobo * 1.25) : 0;
    let recommended = lowKobo > 0 ? Math.round(lowKobo * 1.1) : 0;

    if (/samsung/.test(blob) && /tv|television/.test(blob)) {
      low = 280_000 * 100;
      high = 340_000 * 100;
      recommended = 310_000 * 100;
    } else if (listing.priceKobo > 0 && low === 0) {
      recommended = listing.priceKobo;
      low = Math.round(listing.priceKobo * 0.85);
      high = Math.round(listing.priceKobo * 1.15);
    }

    return {
      listingId,
      currency: 'NGN' as const,
      city: normalizeCity(listing.city ?? DEFAULT_CITY),
      estimatedLowKobo: low,
      estimatedHighKobo: high,
      recommendedKobo: recommended,
      quickSaleKobo: Math.round(recommended * 0.9),
      maxValueKobo: high,
      estimatedLowNaira: Math.round(low / 100),
      estimatedHighNaira: Math.round(high / 100),
      recommendedNaira: Math.round(recommended / 100),
      quickSaleNaira: Math.round((recommended * 0.9) / 100),
      maxValueNaira: Math.round(high / 100),
      confidenceLabel: 'Estimated guide',
      sampleCount: 0,
      basis: 'rule_based_mock' as const,
    };
  }
}
