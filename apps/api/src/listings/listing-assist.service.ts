import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_LISTING_PROVIDER,
  type AiListingProvider,
} from '../providers/ai-listing.provider';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../providers/storage.provider';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class ListingAssistService {
  private readonly logger = new Logger(ListingAssistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_LISTING_PROVIDER) private readonly ai: AiListingProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly analytics: AnalyticsService,
  ) {}

  async assist(
    listingId: string,
    sellerId: string,
    opts?: { imageKeys?: string[] },
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { images: true, category: true },
    });
    if (!listing || listing.sellerId !== sellerId) {
      throw new NotFoundException('Listing not found');
    }

    const imageHints =
      opts?.imageKeys ?? listing.images.map((i) => i.originalKey);

    const imageUrls = await this.resolveImageUrls(imageHints);

    const draft = await this.ai.draftListing({
      titleHint: listing.title || undefined,
      descriptionHint: listing.description || undefined,
      categoryHint: listing.category?.name,
      communityHint: listing.community || undefined,
      imageHints,
      imageUrls,
    });

    this.analytics.log('assist_shown', {
      listingId,
      provider: this.ai.name,
      title: draft.title,
      imageCount: imageUrls.length,
    });

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        title: draft.title,
        description: draft.description,
        brand: draft.brand ?? listing.brand,
        model: draft.model ?? listing.model,
        condition:
          (draft.suggestedCondition as typeof listing.condition) ||
          listing.condition,
        priceKobo: draft.suggestedPriceNaira * 100,
        aiUsed: true,
        aiEditedFields: [
          'title',
          'description',
          'condition',
          'priceKobo',
          ...(draft.brand ? ['brand'] : []),
          ...(draft.model ? ['model'] : []),
        ],
      },
    });

    if (draft.suggestedCategory) {
      const cat = await this.prisma.category.findFirst({
        where: {
          name: { equals: draft.suggestedCategory, mode: 'insensitive' },
          parentId: null,
        },
      });
      if (cat) {
        await this.prisma.listing.update({
          where: { id: listingId },
          data: { categoryId: cat.id },
        });
      }
    }

    return {
      draft,
      listing: updated,
    };
  }

  /**
   * Build vision payloads OpenAI can read.
   * Prefer in-memory/S3 bytes as data URLs (localhost MinIO is unreachable to OpenAI).
   */
  private async resolveImageUrls(keys: string[]): Promise<string[]> {
    const bucket =
      this.config.get<string>('S3_BUCKET') ?? 'reworth-media';
    const urls: string[] = [];

    for (const key of keys.slice(0, 4)) {
      if (!key || key.startsWith('mock://')) continue;

      if (this.storage.getObject) {
        try {
          const body = await this.storage.getObject(bucket, key);
          if (body && body.length > 0 && body.length < 4_000_000) {
            const mime = this.guessMime(key);
            urls.push(`data:${mime};base64,${body.toString('base64')}`);
            continue;
          }
        } catch (err) {
          this.logger.debug(
            `getObject failed for ${key}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      // Fallback: signed GET — only useful if OpenAI can reach the host
      try {
        const signed = await this.storage.getSignedUrl({
          bucket,
          key,
          method: 'GET',
          expiresInSeconds: 600,
        });
        if (/^https?:\/\//i.test(signed) && !/localhost|127\.0\.0\.1/i.test(signed)) {
          urls.push(signed);
        }
      } catch {
        /* ignore */
      }
    }

    return urls;
  }

  private guessMime(key: string): string {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }
}
