/**
 * Ask ReWorth — marketplace assistant (Phase 3.1).
 */

import { apiFetch } from "./api";
import type { PublicListing } from "./types";

export type AssistantSession = {
  id: string;
  title?: string | null;
  city?: string;
};

export type AssistantProposal = {
  kind?: string;
  toolName: string;
  summary: string;
  confirmToken: string;
};

export type AssistantPostMessageResponse = {
  message: { id: string; role: string; content: string };
  toolName?: string;
  degraded?: boolean;
  confirmed?: boolean;
  proposal?: AssistantProposal | null;
  payload?: Record<string, unknown>;
};

export type AssistantListingHit = {
  id: string;
  title: string;
  priceKobo: number;
};

export type AssistantTurnCard =
  | { type: "mutation_pending"; confirmToken: string; toolName: string; summary: string }
  | { type: "search"; listings: AssistantListingHit[] }
  | {
      type: "bundle";
      brief: string;
      totalKobo: number;
      budgetKobo: number;
      listings: AssistantListingHit[];
      shareToken?: string | null;
    }
  | {
      type: "valuation";
      recommendedKobo: number;
      lowKobo?: number;
      highKobo?: number;
    };

export type SavedBundle = {
  id: string;
  shareToken: string;
  brief: string;
  budgetKobo: number;
  totalKobo: number;
  city: string;
  listingIds: string[];
  listings?: Array<{
    id: string;
    title: string;
    priceKobo: number;
    city?: string | null;
    status?: string;
  }>;
  createdAt?: string;
};

export const ASK_SUGGESTIONS = [
  "Furnish a one-bed in Lekki with ₦1.5m",
  "Find a Samsung TV under ₦400k near VI",
  "What's a fair price for a used iPhone 13?",
] as const;

export async function createAssistantSession(
  token: string,
  body?: { city?: string; title?: string },
): Promise<AssistantSession> {
  return apiFetch("/assistant/sessions", {
    method: "POST",
    token,
    body: body ?? {},
  });
}

export async function sendAssistantMessage(
  token: string,
  sessionId: string,
  content: string,
  confirmToken?: string,
): Promise<AssistantPostMessageResponse> {
  return apiFetch(`/assistant/sessions/${sessionId}/messages`, {
    method: "POST",
    token,
    body: {
      content,
      ...(confirmToken ? { confirmToken } : {}),
    },
  });
}

function listingHits(raw: unknown): AssistantListingHit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      if (!id) return null;
      return {
        id,
        title: String(row.title ?? "Listing"),
        priceKobo: Number(row.priceKobo ?? 0),
      };
    })
    .filter((x): x is AssistantListingHit => Boolean(x));
}

/** Map a send-message turn into mobile UI cards (confirm / search / bundle). */
export function cardsFromAssistantTurn(
  res: AssistantPostMessageResponse,
): AssistantTurnCard[] {
  const out: AssistantTurnCard[] = [];
  const payload =
    res.payload && typeof res.payload === "object" ? res.payload : {};

  if (res.proposal?.confirmToken) {
    out.push({
      type: "mutation_pending",
      confirmToken: res.proposal.confirmToken,
      toolName: res.proposal.toolName,
      summary: res.proposal.summary,
    });
  }

  const name = res.toolName ?? "";
  if (name === "search") {
    out.push({
      type: "search",
      listings: listingHits(payload.results ?? payload.listings),
    });
  }

  if (name === "bundle") {
    out.push({
      type: "bundle",
      brief: String(payload.brief ?? "Budget bundle"),
      totalKobo: Number(payload.totalKobo ?? 0),
      budgetKobo: Number(payload.budgetKobo ?? 0),
      listings: listingHits(payload.listings),
      shareToken:
        typeof payload.shareToken === "string" ? payload.shareToken : null,
    });
  }

  if (name === "valuation" || name === "worth") {
    out.push({
      type: "valuation",
      recommendedKobo: Number(
        payload.recommendedKobo ?? payload.midKobo ?? 0,
      ),
      lowKobo:
        payload.estimatedLowKobo != null
          ? Number(payload.estimatedLowKobo)
          : undefined,
      highKobo:
        payload.estimatedHighKobo != null
          ? Number(payload.estimatedHighKobo)
          : undefined,
    });
  }

  return out;
}

/** Lightweight PublicListing stub for ListingCard display from assistant hits. */
export function hitToListingStub(hit: AssistantListingHit): PublicListing {
  return {
    id: hit.id,
    title: hit.title,
    description: "",
    category: null,
    brand: null,
    model: null,
    condition: "GOOD",
    priceKobo: hit.priceKobo,
    negotiable: true,
    sellingMode: "SELL",
    status: "LIVE",
    community: "",
    images: [],
    seller: {
      id: "",
      displayName: "Seller",
      verificationBadge: false,
      ratingLabel: "",
    },
    fulfilmentPickup: true,
    fulfilmentMeet: true,
    fulfilmentDelivery: false,
    buyerProtection: true,
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
}

export function bundleShareUrl(shareToken: string): string {
  return `https://reworth.ng/ask/bundles/${encodeURIComponent(shareToken)}`;
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

export async function getBundleByToken(
  shareToken: string,
  token?: string | null,
): Promise<SavedBundle> {
  return apiFetch<SavedBundle>(`/assistant/bundles/${shareToken}`, {
    token,
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
