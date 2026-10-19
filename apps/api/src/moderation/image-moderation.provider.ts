export type ImageModerationInput = {
  listingId: string;
  imageKeys: string[];
  /** Optional meta flags from variants / client */
  metaFlags?: string[];
  title?: string;
  description?: string;
  brand?: string | null;
  categoryName?: string | null;
};

export type ImageModerationResult = {
  nsfw: boolean;
  reasons: string[];
  detail?: Record<string, unknown>;
};

export interface ImageModerationProvider {
  readonly name: string;
  scan(input: ImageModerationInput): Promise<ImageModerationResult>;
}

export const IMAGE_MODERATION_PROVIDER = Symbol('IMAGE_MODERATION_PROVIDER');
