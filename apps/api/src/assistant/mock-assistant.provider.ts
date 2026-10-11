import { createHash, randomUUID } from 'crypto';
import {
  ASSISTANT_COST_BUDGET_MICROS,
  ASSISTANT_LATENCY_BUDGET_MS,
  MUTATION_TOOLS,
  type AssistantProposal,
  type AssistantProvider,
  type AssistantToolName,
  type AssistantToolResult,
  type AssistantTurnInput,
  type AssistantTurnResult,
} from './assistant.provider';
import { answerFromHelpDocs } from './help-docs';

export type IntentFixture = {
  content: string;
  expectedTool: AssistantToolName;
};

/** 20 fixture intents for routing tests (Phase 3.1). */
export const ASSISTANT_INTENT_FIXTURES: IntentFixture[] = [
  { content: 'find me a samsung tv in lekki', expectedTool: 'search' },
  { content: 'search for sofas under 200k', expectedTool: 'search' },
  { content: 'show listings near me', expectedTool: 'search' },
  {
    content: 'furnish a one-bed flat with 1.5 million naira',
    expectedTool: 'bundle',
  },
  { content: 'budget bundle for a studio apartment 800000', expectedTool: 'bundle' },
  { content: 'what is this iphone worth?', expectedTool: 'valuation' },
  { content: 'estimate value of my macbook', expectedTool: 'valuation' },
  { content: 'how do I take good listing photos?', expectedTool: 'listing_help' },
  { content: 'help me price my listing', expectedTool: 'listing_help' },
  { content: 'where is my order?', expectedTool: 'order_help' },
  { content: 'how does escrow work?', expectedTool: 'order_help' },
  { content: 'what is buyer protection?', expectedTool: 'marketplace_qa' },
  { content: 'how do meet points work?', expectedTool: 'marketplace_qa' },
  { content: 'create a listing for my dining table', expectedTool: 'create_listing' },
  { content: 'list my LG soundbar for sale', expectedTool: 'create_listing' },
  { content: 'make an offer of 50000 on this item', expectedTool: 'make_offer' },
  { content: 'I want to offer 120000 naira', expectedTool: 'make_offer' },
  { content: 'what is the USD exchange rate today?', expectedTool: 'marketplace_qa' },
  { content: 'tell me bank interest rates', expectedTool: 'marketplace_qa' },
  { content: 'how do disputes work on ReWorth?', expectedTool: 'marketplace_qa' },
];

export function routeIntent(content: string): AssistantToolName {
  const q = content.toLowerCase();
  if (
    /create\s+(a\s+)?listing|list\s+my|sell\s+my|draft\s+listing/.test(q)
  ) {
    return 'create_listing';
  }
  if (/make\s+(an\s+)?offer|offer\s+of|want\s+to\s+offer/.test(q)) {
    return 'make_offer';
  }
  if (
    /bundle|furnish|one-?bed|studio|budget\s+of|with\s+[₦n]?[\d,.]+/.test(q) &&
    /furnish|bundle|apartment|flat|studio|bedroom|budget/.test(q)
  ) {
    return 'bundle';
  }
  if (/worth|valuat|estimate\s+value|how\s+much\s+is\s+(this|my)/.test(q)) {
    return 'valuation';
  }
  if (
    /listing\s+photo|price\s+my\s+listing|help\s+me\s+price|take\s+good\s+listing/.test(
      q,
    )
  ) {
    return 'listing_help';
  }
  if (/order|escrow|payout|handover|my\s+order/.test(q)) {
    return 'order_help';
  }
  if (
    /buyer\s*protect|meet\s*point|dispute|exchange\s*rate|interest\s*rate|how\s+does|what\s+is/.test(
      q,
    )
  ) {
    return 'marketplace_qa';
  }
  if (/search|find|show\s+listings|near\s+me|looking\s+for/.test(q)) {
    return 'search';
  }
  return 'marketplace_qa';
}

function confirmTokenFor(
  sessionId: string,
  toolName: string,
  payload: Record<string, unknown>,
): string {
  const raw = `${sessionId}:${toolName}:${JSON.stringify(payload)}:${randomUUID()}`;
  return `confirm_${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

const SEARCH_STOP_WORDS = new Set([
  'find',
  'search',
  'show',
  'listings',
  'listing',
  'for',
  'me',
  'a',
  'an',
  'the',
  'in',
  'near',
  'under',
  'with',
  'my',
  'of',
  'and',
  'or',
  'what',
  'whats',
  'used',
  'fair',
  'price',
]);

function searchWords(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/₦/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !SEARCH_STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

/** Parse a shopper budget from free text into kobo. ₦1.5m → 150_000_000. */
export function parseBudgetKobo(content: string): number {
  const million = content.match(/₦?\s*([\d,.]+)\s*(?:million|m)\b/i);
  const thousand = content.match(/₦?\s*([\d,.]+)\s*k\b/i);
  const plain = content.match(/₦\s*([\d,.]+)/i) || content.match(/([\d,.]+)/);
  const m = million || thousand || plain;
  if (!m) return 1_500_000_00;
  let n = Number(String(m[1]).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 1_500_000_00;
  if (million) n *= 1_000_000;
  else if (thousand && n < 100_000) n *= 1_000;
  // Amounts below 100 million are naira, not kobo.
  if (n < 100_000_000) n *= 100;
  return Math.round(n);
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Mock assistant — deterministic intent router + tool stubs.
 * Failures / budget overruns degrade to structured search.
 */
export class MockAssistantProvider implements AssistantProvider {
  readonly name = 'mock-assistant';

  /** Test hook: force provider failure to exercise degrade path. */
  forceFail = false;
  /** Test hook: inflate latency beyond budget. */
  forceSlowMs = 0;

  async routeAndRun(input: AssistantTurnInput): Promise<AssistantTurnResult> {
    const started = Date.now();
    const toolName = routeIntent(input.content);

    try {
      if (this.forceFail) {
        throw new Error('mock assistant failure');
      }
      if (this.forceSlowMs > 0) {
        await new Promise((r) => setTimeout(r, this.forceSlowMs));
      }

      const result = await this.runTool(toolName, input, started);
      if (
        result.latencyMs > ASSISTANT_LATENCY_BUDGET_MS ||
        result.costMicros > ASSISTANT_COST_BUDGET_MICROS
      ) {
        return this.degradedSearch(input, started, 'budget_exceeded');
      }
      return {
        reply: result.content,
        toolResult: result,
        confirmed: Boolean(
          input.confirmToken && MUTATION_TOOLS.has(toolName),
        ),
      };
    } catch {
      return this.degradedSearch(input, started, 'provider_error');
    }
  }

  private degradedSearch(
    input: AssistantTurnInput,
    started: number,
    reason: string,
  ): AssistantTurnResult {
    const latencyMs = Date.now() - started + this.forceSlowMs;
    const payload = {
      query: input.content,
      city: input.city,
      degraded: true,
      reason,
      results: (input.listingCatalog ?? [])
        .filter((l) => l.city.toLowerCase() === input.city.toLowerCase())
        .slice(0, 5)
        .map((l) => ({ id: l.id, title: l.title, priceKobo: l.priceKobo })),
    };
    const toolResult: AssistantToolResult = {
      toolName: 'search',
      content:
        'I hit a snag answering fully — here is a structured search of live listings instead.',
      payload,
      degraded: true,
      latencyMs,
      costMicros: 0,
    };
    return { reply: toolResult.content, toolResult, confirmed: false };
  }

  private async runTool(
    toolName: AssistantToolName,
    input: AssistantTurnInput,
    started: number,
  ): Promise<AssistantToolResult> {
    const latencyMs = Date.now() - started;
    const costMicros = 1_000;

    if (MUTATION_TOOLS.has(toolName)) {
      return this.mutationTool(toolName, input, latencyMs, costMicros);
    }

    switch (toolName) {
      case 'search':
        return this.searchTool(input, latencyMs, costMicros);
      case 'bundle':
        return this.bundleTool(input, latencyMs, costMicros);
      case 'valuation':
        return {
          toolName,
          content:
            'I can estimate value from sold comps. Open Valuation or share a listing / photo for a shareable card.',
          payload: { cta: 'valuation', city: input.city },
          latencyMs,
          costMicros,
        };
      case 'listing_help':
      case 'order_help':
      case 'marketplace_qa': {
        const ans = answerFromHelpDocs(input.content);
        return {
          toolName,
          content: ans.answer,
          payload: { grounded: ans.grounded, docKey: ans.docKey },
          latencyMs,
          costMicros,
        };
      }
      default:
        return {
          toolName: 'marketplace_qa',
          content: answerFromHelpDocs(input.content).answer,
          payload: {},
          latencyMs,
          costMicros,
        };
    }
  }

  private searchTool(
    input: AssistantTurnInput,
    latencyMs: number,
    costMicros: number,
  ): AssistantToolResult {
    const words = searchWords(input.content);
    const catalog = input.listingCatalog ?? [];
    const results = catalog
      .filter((l) => l.city.toLowerCase() === input.city.toLowerCase())
      .filter((l) => {
        if (words.length === 0) return true;
        const title = l.title.toLowerCase();
        return words.some((word) => title.includes(word));
      })
      .slice(0, 8)
      .map((l) => ({ id: l.id, title: l.title, priceKobo: l.priceKobo }));
    return {
      toolName: 'search',
      content:
        results.length > 0
          ? `Found ${results.length} listing(s) in ${input.city}.`
          : `No matching live listings in ${input.city} yet — try another keyword.`,
      payload: { city: input.city, results },
      latencyMs,
      costMicros,
    };
  }

  private bundleTool(
    input: AssistantTurnInput,
    latencyMs: number,
    costMicros: number,
  ): AssistantToolResult {
    const budgetKobo = parseBudgetKobo(input.content);
    const city = input.city;
    const catalog = (input.listingCatalog ?? []).filter(
      (l) => l.city.toLowerCase() === city.toLowerCase(),
    );
    const picked = pickBudgetBundle(catalog, budgetKobo, input.lat, input.lng);
    const totalKobo = picked.reduce((s, l) => s + l.priceKobo, 0);
    return {
      toolName: 'bundle',
      content: `Curated ${picked.length} items for ~₦${Math.round(totalKobo / 100).toLocaleString('en-NG')} (budget ₦${Math.round(budgetKobo / 100).toLocaleString('en-NG')}).`,
      payload: {
        brief: input.content,
        budgetKobo,
        city,
        listingIds: picked.map((p) => p.id),
        listings: picked,
        totalKobo,
      },
      latencyMs,
      costMicros,
    };
  }

  private mutationTool(
    toolName: AssistantToolName,
    input: AssistantTurnInput,
    latencyMs: number,
    costMicros: number,
  ): AssistantToolResult {
    const payload =
      toolName === 'create_listing'
        ? {
            titleHint: input.content.replace(/create\s+(a\s+)?listing\s+for\s*/i, '').trim(),
            city: input.city,
          }
        : {
            amountHint: input.content.match(/[\d,]+/)?.[0] ?? null,
            city: input.city,
          };

    if (!input.confirmToken) {
      const confirmToken = confirmTokenFor(input.sessionId, toolName, payload);
      const proposal: AssistantProposal = {
        kind: 'proposal',
        toolName,
        summary:
          toolName === 'create_listing'
            ? 'I can draft a listing from your description. Confirm to create a DRAFT.'
            : 'I can prepare an offer. Confirm to submit.',
        payload,
        confirmToken,
      };
      return {
        toolName,
        content: `${proposal.summary} Reply with confirm to proceed.`,
        payload: { proposal },
        proposal,
        latencyMs,
        costMicros,
      };
    }

    return {
      toolName,
      content:
        toolName === 'create_listing'
          ? 'Listing draft proposed and confirmed (mock). Open My Listings to finish details.'
          : 'Offer proposal confirmed (mock). The seller will be notified.',
      payload: { confirmed: true, ...payload, confirmToken: input.confirmToken },
      latencyMs,
      costMicros,
    };
  }
}

export function pickBudgetBundle<
  T extends {
    id: string;
    title: string;
    priceKobo: number;
    categoryId: string | null;
    categorySlug?: string | null;
    geoLat?: number | null;
    geoLng?: number | null;
  },
>(
  catalog: T[],
  budgetKobo: number,
  lat?: number,
  lng?: number,
): T[] {
  let ranked = [...catalog].filter((l) => l.priceKobo > 0 && l.priceKobo <= budgetKobo);
  if (lat != null && lng != null) {
    ranked.sort((a, b) => {
      const da =
        a.geoLat != null && a.geoLng != null
          ? haversineKm(lat, lng, a.geoLat, a.geoLng)
          : 999;
      const db =
        b.geoLat != null && b.geoLng != null
          ? haversineKm(lat, lng, b.geoLat, b.geoLng)
          : 999;
      return da - db || a.priceKobo - b.priceKobo;
    });
  } else {
    ranked.sort((a, b) => a.priceKobo - b.priceKobo);
  }

  const picked: T[] = [];
  const categories = new Set<string>();
  let total = 0;
  for (const item of ranked) {
    if (picked.length >= 8) break;
    if (total + item.priceKobo > budgetKobo) continue;
    const cat = item.categoryId ?? item.categorySlug ?? item.id;
    // Prefer category mix: skip if we already have 2 from same category and have options
    const sameCat = picked.filter(
      (p) => (p.categoryId ?? p.categorySlug ?? p.id) === cat,
    ).length;
    if (sameCat >= 2 && categories.size < 3 && ranked.length > picked.length + 1) {
      continue;
    }
    picked.push(item);
    categories.add(cat);
    total += item.priceKobo;
  }

  // Ensure at least 3 when possible
  if (picked.length < 3) {
    for (const item of ranked) {
      if (picked.includes(item)) continue;
      if (total + item.priceKobo > budgetKobo) continue;
      picked.push(item);
      total += item.priceKobo;
      if (picked.length >= 3) break;
    }
  }

  return picked.slice(0, 8);
}
