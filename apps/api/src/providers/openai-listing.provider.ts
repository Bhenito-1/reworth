import { Logger } from '@nestjs/common';
import type {
  AiListingDraft,
  AiListingDraftInput,
  AiListingProvider,
} from './ai-listing.provider';
import { RuleBasedAiMock } from './rule-based-ai.mock';

export type OpenAiListingProviderOpts = {
  apiKey: string;
  model?: string;
  /** Optional base URL override (Azure / proxy). */
  baseUrl?: string;
  /** Fallback when OpenAI fails or returns unusable JSON. */
  fallback?: AiListingProvider;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
};

type ChatContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

/**
 * OpenAI GPT-4o listing draft adapter (text + optional vision).
 * Falls back to rule-based mock on API / parse failures.
 */
export class OpenAiListingProvider implements AiListingProvider {
  readonly name = 'openai-listing';
  private readonly logger = new Logger(OpenAiListingProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fallback: AiListingProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAiListingProviderOpts) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gpt-4o';
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(
      /\/$/,
      '',
    );
    this.fallback = opts.fallback ?? new RuleBasedAiMock();
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async draftListing(input: AiListingDraftInput): Promise<AiListingDraft> {
    try {
      const draft = await this.callOpenAi(input);
      if (draft) return this.normalize(draft, input);
    } catch (err) {
      this.logger.warn(
        `OpenAI listing draft failed — using fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return this.fallback.draftListing(input);
  }

  private async callOpenAi(
    input: AiListingDraftInput,
  ): Promise<Partial<AiListingDraft> | null> {
    const content: ChatContent[] = [
      {
        type: 'text',
        text: this.buildPrompt(input),
      },
    ];

    const urls = (input.imageUrls ?? []).filter(Boolean).slice(0, 4);
    for (const url of urls) {
      content.push({
        type: 'image_url',
        image_url: { url, detail: 'low' },
      });
    }

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are ReWorth listing copywriter for Lagos recommerce. Return strict JSON only.',
          },
          { role: 'user', content },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 240)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    return JSON.parse(raw) as Partial<AiListingDraft>;
  }

  private buildPrompt(input: AiListingDraftInput): string {
    const lines = [
      'Draft a Lagos marketplace listing from the photos and hints.',
      'Tone: trusted, warm, premium, local (en-NG). No charity / recycling vibe.',
      'Return JSON with keys:',
      'title, description, suggestedCategory, suggestedCondition, suggestedPriceNaira,',
      'suggestedPriceLowNaira, suggestedPriceHighNaira, brand, model, tags (string array).',
      'suggestedCondition must be one of: LIKE_NEW, VERY_GOOD, GOOD, FAIR, FOR_PARTS.',
      'suggestedCategory: top-level like Electronics, Fashion, Home, Phones, Kids, Sports, Other.',
      'Prices in Nigerian Naira integers (no symbols). Description 2–4 short sentences.',
    ];
    if (input.titleHint) lines.push(`Title hint: ${input.titleHint}`);
    if (input.descriptionHint)
      lines.push(`Description hint: ${input.descriptionHint}`);
    if (input.categoryHint) lines.push(`Category hint: ${input.categoryHint}`);
    if (input.communityHint)
      lines.push(`Community / area: ${input.communityHint}`);
    if (input.imageHints?.length) {
      lines.push(`Image file hints: ${input.imageHints.join(', ')}`);
    }
    if (!input.imageUrls?.length) {
      lines.push(
        'No photos attached — draft from hints only; keep claims modest.',
      );
    }
    return lines.join('\n');
  }

  private normalize(
    raw: Partial<AiListingDraft>,
    input: AiListingDraftInput,
  ): AiListingDraft {
    const title =
      (raw.title && String(raw.title).trim()) ||
      input.titleHint?.trim() ||
      'Gently used item in great condition';
    const description =
      (raw.description && String(raw.description).trim()) ||
      `${title}. Clean and ready for a new home in Lagos.`;
    const suggestedCategory =
      (raw.suggestedCategory && String(raw.suggestedCategory).trim()) ||
      input.categoryHint?.trim() ||
      'Other';
    const suggestedCondition = this.normalizeCondition(
      raw.suggestedCondition,
    );
    const mid = this.positiveInt(raw.suggestedPriceNaira, 25_000);
    const low = this.positiveInt(
      raw.suggestedPriceLowNaira,
      Math.round(mid * 0.85),
    );
    const high = this.positiveInt(
      raw.suggestedPriceHighNaira,
      Math.round(mid * 1.15),
    );
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((t) => String(t)).filter(Boolean).slice(0, 12)
      : [
          suggestedCategory.toLowerCase(),
          input.communityHint?.toLowerCase() || 'lagos',
          'preloved',
        ];

    return {
      title: title.slice(0, 120),
      description: description.slice(0, 2000),
      suggestedCategory,
      suggestedCondition,
      suggestedPriceNaira: mid,
      suggestedPriceLowNaira: Math.min(low, mid),
      suggestedPriceHighNaira: Math.max(high, mid),
      brand: raw.brand ? String(raw.brand).slice(0, 80) : undefined,
      model: raw.model ? String(raw.model).slice(0, 80) : undefined,
      tags,
    };
  }

  private normalizeCondition(value: unknown): string {
    const allowed = new Set([
      'LIKE_NEW',
      'VERY_GOOD',
      'GOOD',
      'FAIR',
      'FOR_PARTS',
    ]);
    const upper = String(value ?? 'GOOD')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (allowed.has(upper)) return upper;
    if (/like.?new|new/i.test(String(value))) return 'LIKE_NEW';
    if (/very.?good|excellent/i.test(String(value))) return 'VERY_GOOD';
    if (/fair|okay|ok/i.test(String(value))) return 'FAIR';
    if (/parts|broken/i.test(String(value))) return 'FOR_PARTS';
    return 'GOOD';
  }

  private positiveInt(value: unknown, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.round(n);
  }
}
