import { apiFetch } from "./api";
import type { PublicListing } from "./types";

export type SwapProposal = {
  id: string;
  listingId: string;
  offeredListingId: string;
  cashComponentKobo: number;
  note?: string | null;
  status: string;
  conversationId?: string | null;
  proposerId?: string;
  expiresAt?: string;
};

export type GiveawayClaim = {
  id: string;
  listingId: string;
  claimantId: string;
  status: string;
};

export async function createSwapProposal(
  token: string,
  listingId: string,
  body: {
    offeredListingId: string;
    cashComponentKobo?: number;
    note?: string;
    conversationId?: string;
  },
): Promise<SwapProposal> {
  return apiFetch(`/listings/${listingId}/swap-proposals`, {
    method: "POST",
    token,
    body,
  });
}

export async function listSwapProposals(
  token: string,
  listingId: string,
): Promise<{ items: SwapProposal[] } | SwapProposal[]> {
  return apiFetch(`/listings/${listingId}/swap-proposals`, { token });
}

export async function acceptSwapProposal(token: string, id: string) {
  return apiFetch(`/swap-proposals/${id}/accept`, { method: "POST", token });
}

export async function rejectSwapProposal(token: string, id: string) {
  return apiFetch(`/swap-proposals/${id}/reject`, { method: "POST", token });
}

export async function counterSwapProposal(
  token: string,
  id: string,
  body: {
    offeredListingId?: string;
    cashComponentKobo?: number;
    note?: string;
  },
) {
  return apiFetch(`/swap-proposals/${id}/counter`, {
    method: "POST",
    token,
    body,
  });
}

export function parseSwapProposalCard(body: string | null): {
  swapProposalId: string;
  offeredListingId?: string;
  cashComponentKobo?: number;
} | null {
  if (!body) return null;
  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    const id = String(raw.swapProposalId ?? "");
    if (!id) return null;
    return {
      swapProposalId: id,
      offeredListingId:
        typeof raw.offeredListingId === "string"
          ? raw.offeredListingId
          : undefined,
      cashComponentKobo:
        typeof raw.cashComponentKobo === "number"
          ? raw.cashComponentKobo
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function createGiveawayClaim(
  token: string,
  listingId: string,
  note?: string,
): Promise<GiveawayClaim> {
  return apiFetch(`/listings/${listingId}/giveaway-claims`, {
    method: "POST",
    token,
    body: note ? { note } : {},
  });
}

export async function myLiveListings(
  token: string,
): Promise<{ items: PublicListing[] }> {
  const raw = await apiFetch<PublicListing[] | { items: PublicListing[] }>(
    "/listings?mine=1&status=LIVE&limit=50",
    { token },
  );
  const items = Array.isArray(raw) ? raw : (raw.items ?? []);
  return { items };
}
