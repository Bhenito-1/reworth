/**
 * Phase 3.1 — Ask ReWorth marketplace assistant + saved bundles.
 * Aligns with AssistantController + BundleService. Guardrails: ADR-006.
 */

import { apiFetch } from "./api";
import type {
  AssistantMessage,
  AssistantSession,
  AssistantToolResult,
  SavedBundle,
} from "./types";

/**
 * Grounding brief for Ask ReWorth (also referenced in ADR-006 / CHANGELOG).
 * Server help strings live in `apps/api/src/assistant/help-docs.ts`.
 */
export const ASSISTANT_GROUNDING_BRIEF = `
Ask ReWorth helps Lagos shoppers and sellers on ReWorth (buy · sell · swap · give away).

Rules:
- Prefer live search / index results over inventing inventory.
- Budget and bundle answers show combined ₦ totals from listing prices.
- Valuation estimates are guidance only, not a binding offer.
- Read-only by default for money-adjacent tools (search, bundles, valuations).
- Mutations (create listing, make offer) return a confirmToken — UI must Confirm
  before re-posting the same token via messages.
- Never ask for card/OTP secrets; payments stay on Paystack checkout.
- City scope defaults to Lagos until national expansion (Prompt 3.2).
`.trim();

export type AssistantProposal = {
  kind: "proposal";
  toolName: string;
  summary: string;
  payload: Record<string, unknown>;
  confirmToken: string;
};

export type AssistantPostMessageResponse = {
  message: AssistantMessage;
  toolName: string;
  proposal: AssistantProposal | null;
  degraded: boolean;
  confirmed: boolean;
  payload: Record<string, unknown>;
};

export async function createAssistantSession(
  token: string,
  body?: { city?: string; title?: string },
): Promise<AssistantSession> {
  return apiFetch<AssistantSession>("/assistant/sessions", {
    method: "POST",
    token,
    body: body ?? {},
  });
}

export async function listAssistantMessages(
  token: string,
  sessionId: string,
): Promise<AssistantMessage[]> {
  return apiFetch<AssistantMessage[]>(
    `/assistant/sessions/${sessionId}/messages`,
    { token },
  );
}

export async function sendAssistantMessage(
  token: string,
  sessionId: string,
  content: string,
  confirmToken?: string,
): Promise<AssistantPostMessageResponse> {
  return apiFetch<AssistantPostMessageResponse>(
    `/assistant/sessions/${sessionId}/messages`,
    {
      method: "POST",
      token,
      body: {
        content,
        ...(confirmToken ? { confirmToken } : {}),
      },
    },
  );
}

/** Confirm a mutation proposal (ADR-006) by re-posting the confirmToken. */
export async function confirmAssistantAction(
  token: string,
  sessionId: string,
  confirmToken: string,
): Promise<AssistantPostMessageResponse> {
  return sendAssistantMessage(token, sessionId, "confirm", confirmToken);
}

export async function createAssistantBundle(
  token: string,
  body: {
    brief: string;
    budgetKobo: number;
    city?: string;
    lat?: number;
    lng?: number;
  },
): Promise<SavedBundle> {
  return apiFetch<SavedBundle>("/assistant/bundles", {
    method: "POST",
    token,
    body,
  });
}

export async function saveAssistantBundle(
  token: string,
  bundleId: string,
): Promise<SavedBundle> {
  return apiFetch<SavedBundle>(`/assistant/bundles/${bundleId}/save`, {
    method: "POST",
    token,
  });
}

export async function getBundleByToken(
  shareToken: string,
  token?: string | null,
): Promise<SavedBundle> {
  return apiFetch<SavedBundle>(`/assistant/bundles/${shareToken}`, {
    token,
  });
}

/**
 * Map API toolName + payload (+ optional proposal) into UI tool result cards.
 */
export function toolResultsFromTurn(input: {
  toolName?: string | null;
  payload?: unknown;
  proposal?: AssistantProposal | null;
}): AssistantToolResult[] {
  const out: AssistantToolResult[] = [];
  const payload =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : {};

  if (input.proposal?.confirmToken) {
    out.push({
      type: "mutation_pending",
      actionId: input.proposal.confirmToken,
      confirmToken: input.proposal.confirmToken,
      toolName: input.proposal.toolName,
      summary: input.proposal.summary,
    });
  }

  const name = input.toolName ?? "";
  if (name === "search") {
    const results = (payload.results as Array<Record<string, unknown>>) ?? [];
    out.push({
      type: "search",
      listings: results.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? "Listing"),
        description: "",
        category: null,
        brand: null,
        model: null,
        condition: "GOOD",
        priceKobo: Number(r.priceKobo ?? 0),
        negotiable: true,
        sellingMode: "SELL",
        status: "LIVE",
        community: "",
        city: typeof payload.city === "string" ? payload.city : "Lagos",
        geoLat: null,
        geoLng: null,
        images: [],
        seller: {
          id: "",
          displayName: "Seller",
          verificationBadge: false,
          ratingLabel: "",
        },
        fulfilmentPickup: false,
        fulfilmentMeet: false,
        fulfilmentDelivery: true,
        buyerProtection: true,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      })),
      query: undefined,
    });
  }

  if (name === "bundle") {
    const listingsRaw =
      (payload.listings as Array<Record<string, unknown>>) ?? [];
    out.push({
      type: "bundle",
      brief: String(payload.brief ?? "Budget bundle"),
      budgetKobo: Number(payload.budgetKobo ?? 0),
      totalKobo: Number(payload.totalKobo ?? 0),
      shareToken: null,
      listings: listingsRaw.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? "Listing"),
        description: "",
        category: null,
        brand: null,
        model: null,
        condition: "GOOD",
        priceKobo: Number(r.priceKobo ?? 0),
        negotiable: true,
        sellingMode: "SELL",
        status: "LIVE",
        community: "",
        city: typeof payload.city === "string" ? payload.city : "Lagos",
        geoLat: null,
        geoLng: null,
        images: [],
        seller: {
          id: "",
          displayName: "Seller",
          verificationBadge: false,
          ratingLabel: "",
        },
        fulfilmentPickup: false,
        fulfilmentMeet: false,
        fulfilmentDelivery: true,
        buyerProtection: true,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      })),
    });
  }

  if (name === "valuation") {
    const card = (payload.result as Record<string, unknown>) ?? payload;
    out.push({
      type: "valuation",
      result: {
        estimatedLowKobo: Number(card.estimatedLowKobo ?? 0),
        estimatedHighKobo: Number(card.estimatedHighKobo ?? 0),
        recommendedKobo: Number(card.recommendedKobo ?? 0),
        quickSaleKobo:
          card.quickSaleKobo != null ? Number(card.quickSaleKobo) : undefined,
        maxValueKobo:
          card.maxValueKobo != null ? Number(card.maxValueKobo) : undefined,
        confidenceLabel:
          typeof card.confidenceLabel === "string"
            ? card.confidenceLabel
            : undefined,
        city: typeof payload.city === "string" ? payload.city : undefined,
      },
    });
  }

  return out;
}

export function toolResultsFromMessage(message: {
  toolName?: string | null;
  toolPayload?: unknown;
}): AssistantToolResult[] {
  return toolResultsFromTurn({
    toolName: message.toolName,
    payload: message.toolPayload,
  });
}
