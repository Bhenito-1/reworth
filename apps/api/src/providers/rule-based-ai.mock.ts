import type {
  AiListingDraft,
  AiListingDraftInput,
  AiListingProvider,
} from './ai-listing.provider';

/** Rule-based mock — no external AI calls. Deterministic for tests. */
export class RuleBasedAiMock implements AiListingProvider {
  readonly name = 'rule-based-ai';

  async draftListing(input: AiListingDraftInput): Promise<AiListingDraft> {
    const blob = [
      input.titleHint,
      input.descriptionHint,
      input.categoryHint,
      ...(input.imageHints ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/samsung/.test(blob) && (/tv|television|smart\s*tv/.test(blob) || !blob)) {
      return this.samsungTv(input.communityHint);
    }
    if (/samsung/.test(blob)) {
      return this.samsungTv(input.communityHint);
    }

    const title =
      input.titleHint?.trim() || 'Gently used item in great condition';
    const description =
      input.descriptionHint?.trim() ||
      `${title}. Clean, functional, and ready for a new home in Lagos.`;
    const suggestedCategory = input.categoryHint?.trim() || 'Other';
    const tags = [
      suggestedCategory.toLowerCase(),
      input.communityHint?.toLowerCase() || 'lagos',
      'preloved',
    ].filter(Boolean);

    const wordCount = description.split(/\s+/).length;
    const suggestedPriceNaira = Math.min(
      500_000,
      Math.max(2_000, wordCount * 750),
    );

    return {
      title,
      description,
      suggestedCategory,
      suggestedCondition: 'GOOD',
      suggestedPriceNaira,
      suggestedPriceLowNaira: Math.round(suggestedPriceNaira * 0.85),
      suggestedPriceHighNaira: Math.round(suggestedPriceNaira * 1.15),
      tags,
    };
  }

  private samsungTv(communityHint?: string): AiListingDraft {
    return {
      title: 'Samsung 55-inch Smart TV',
      description:
        'Samsung 55-inch Smart Television in very good working condition. Clean screen and body. Selling due to household upgrade.',
      suggestedCategory: 'Electronics',
      suggestedCondition: 'VERY_GOOD',
      suggestedPriceNaira: 310_000,
      suggestedPriceLowNaira: 280_000,
      suggestedPriceHighNaira: 340_000,
      brand: 'Samsung',
      model: '55-inch Smart TV',
      tags: [
        'electronics',
        'tv',
        'samsung',
        communityHint?.toLowerCase() || 'lagos',
        'preloved',
      ],
    };
  }
}
