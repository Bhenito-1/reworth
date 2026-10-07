export type AiListingDraftInput = {
  titleHint?: string;
  descriptionHint?: string;
  categoryHint?: string;
  communityHint?: string;
  /** Opaque keys / labels from uploaded images (e.g. filename hints). */
  imageHints?: string[];
  /**
   * Public https URLs or data:image/…;base64,… for vision models.
   * Prefer data URLs for local MinIO that OpenAI cannot reach.
   */
  imageUrls?: string[];
};

export type AiListingDraft = {
  title: string;
  description: string;
  suggestedCategory: string;
  suggestedCondition: string;
  suggestedPriceNaira: number;
  suggestedPriceLowNaira: number;
  suggestedPriceHighNaira: number;
  brand?: string;
  model?: string;
  tags: string[];
};

export interface AiListingProvider {
  readonly name: string;
  draftListing(input: AiListingDraftInput): Promise<AiListingDraft>;
}

export const AI_LISTING_PROVIDER = Symbol('AI_LISTING_PROVIDER');
