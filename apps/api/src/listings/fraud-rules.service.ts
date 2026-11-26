import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hammingDistanceHex } from '../media/image-pipeline';

export type FraudCheckResult = {
  forceUnderReview: boolean;
  flags: string[];
  riskEvents: Array<{
    kind: string;
    score: number;
    detail: Record<string, unknown>;
  }>;
};

const DHASH_HAMMING_THRESHOLD = 5;

@Injectable()
export class FraudRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateListing(listingId: string): Promise<FraudCheckResult> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { images: true },
    });
    if (!listing) {
      return { forceUnderReview: false, flags: [], riskEvents: [] };
    }

    const flags: string[] = [];
    const riskEvents: FraudCheckResult['riskEvents'] = [];

    // Duplicate image via dHash
    for (const img of listing.images) {
      if (!img.dHash || img.status !== 'READY') continue;
      const others = await this.prisma.listingImage.findMany({
        where: {
          dHash: { not: null },
          listingId: { not: listingId },
          status: 'READY',
        },
        take: 200,
        select: { id: true, listingId: true, dHash: true },
      });
      for (const other of others) {
        if (!other.dHash) continue;
        const dist = hammingDistanceHex(img.dHash, other.dHash);
        if (dist <= DHASH_HAMMING_THRESHOLD) {
          flags.push('DUPLICATE_IMAGE');
          riskEvents.push({
            kind: 'DUPLICATE_IMAGE',
            score: 80,
            detail: {
              imageId: img.id,
              otherImageId: other.id,
              otherListingId: other.listingId,
              hamming: dist,
            },
          });
          break;
        }
      }
      if (flags.includes('DUPLICATE_IMAGE')) break;
    }

    const forceUnderReview = flags.length > 0;
    return { forceUnderReview, flags, riskEvents };
  }

  /**
   * Rough market low in kobo from brand/title heuristics.
   * Samsung TV example: ~₦280k → 28_000_000 kobo.
   */
  estimateLowKobo(listing: {
    brand: string | null;
    title: string;
    model: string | null;
    originalPriceKobo: number | null;
  }): number {
    if (listing.originalPriceKobo && listing.originalPriceKobo > 0) {
      return Math.round(listing.originalPriceKobo * 0.4);
    }
    const blob = `${listing.brand ?? ''} ${listing.title} ${listing.model ?? ''}`.toLowerCase();
    if (/samsung/.test(blob) && /tv|television/.test(blob)) {
      return 280_000 * 100; // ₦280,000
    }
    if (/iphone|samsung galaxy|pixel/.test(blob)) {
      return 150_000 * 100;
    }
    if (/laptop|macbook/.test(blob)) {
      return 200_000 * 100;
    }
    // Generic: if price set high, use 50% as "low"; else 0 (skip rule)
    return 0;
  }
}
