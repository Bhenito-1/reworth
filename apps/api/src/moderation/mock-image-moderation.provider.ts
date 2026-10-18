import { Injectable } from '@nestjs/common';
import type {
  ImageModerationInput,
  ImageModerationProvider,
  ImageModerationResult,
} from './image-moderation.provider';

/**
 * Deterministic mock — flags keys/meta containing "nsfw" (case-insensitive).
 * Prod: swap for AWS Rekognition / OpenAI vision via IMAGE_MODERATION_PROVIDER.
 */
@Injectable()
export class MockImageModerationProvider implements ImageModerationProvider {
  readonly name = 'mock-image-moderation';

  async scan(input: ImageModerationInput): Promise<ImageModerationResult> {
    const reasons: string[] = [];
    const matchedKeys: string[] = [];

    for (const key of input.imageKeys) {
      if (/nsfw|xxx|porn|nude/i.test(key)) {
        reasons.push('IMAGE_NSFW_KEY');
        matchedKeys.push(key);
      }
    }

    for (const flag of input.metaFlags ?? []) {
      if (/nsfw|xxx|porn|nude/i.test(flag)) {
        reasons.push('IMAGE_NSFW_META');
      }
    }

    const listingBlob = [
      input.title ?? '',
      input.description ?? '',
      input.brand ?? '',
      input.categoryName ?? '',
    ]
      .join(' ')
      .toLowerCase();

    // Description claims adult content while selling on marketplace
    if (/(nsfw|xxx|onlyfans|porn)/i.test(listingBlob)) {
      reasons.push('LISTING_COPY_NSFW');
    }

    return {
      nsfw: reasons.length > 0,
      reasons: [...new Set(reasons)],
      detail: {
        matchedKeys,
        provider: this.name,
        listingId: input.listingId,
      },
    };
  }
}
