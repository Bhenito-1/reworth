import { apiFetch } from "./api";
import type { PublicListing } from "./types";

export type SwapProposal = {
  id: string;
  listingId: string;
  offeredListingId: string;
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

export async function startSwapOffer(
  token: string,
  listingId: string,
): Promise<{ listingId: string }> {
  return apiFetch(`/listings/${listingId}/swap-offer`, {
    method: "POST",
    token,
  });
}

export async function createSwapProposal(
  token: string,
  listingId: string,
  body: {
    offeredListingId: string;
    title?: string;
    description?: string;
    deliveryOn?: string;
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

export async function cancelSwapProposal(token: string, id: string) {
  return apiFetch(`/swap-proposals/${id}/cancel`, { method: "POST", token });
}

export async function counterSwapProposal(
  token: string,
  id: string,
  body: {
    offeredListingId?: string;
    note?: string;
  },
) {
  return apiFetch(`/swap-proposals/${id}/counter`, {
    method: "POST",
    token,
    body,
  });
}

export type SwapCardItem = {
  title: string;
  imageUrl?: string | null;
};

export type SwapCardOrder = {
  payerId: string;
  orderId: string;
  deliveryFeeKobo?: number;
  receive?: SwapCardItem;
  send?: SwapCardItem;
};

export function parseSwapProposalCard(body: string | null): {
  swapProposalId: string;
  offeredListingId?: string;
  kind?: string;
  title?: string;
  description?: string;
  deliveryOn?: string;
  imageUrls: string[];
  orders: SwapCardOrder[];
} | null {
  if (!body) return null;
  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    const id = String(raw.swapProposalId ?? "");
    if (!id) return null;
    const imageUrls = Array.isArray(raw.imageUrls)
      ? raw.imageUrls.filter((url): url is string => typeof url === "string")
      : [];
    const orders = Array.isArray(raw.orders)
      ? raw.orders.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const item = row as Record<string, unknown>;
          if (typeof item.orderId !== "string" || typeof item.payerId !== "string") {
            return [];
          }
          const side = (value: unknown): SwapCardItem | undefined => {
            if (!value || typeof value !== "object") return undefined;
            const card = value as Record<string, unknown>;
            if (typeof card.title !== "string") return undefined;
            return {
              title: card.title,
              imageUrl: typeof card.imageUrl === "string" ? card.imageUrl : null,
            };
          };
          return [
            {
              payerId: item.payerId,
              orderId: item.orderId,
              deliveryFeeKobo:
                typeof item.deliveryFeeKobo === "number"
                  ? item.deliveryFeeKobo
                  : undefined,
              receive: side(item.receive),
              send: side(item.send),
            },
          ];
        })
      : [];
    return {
      swapProposalId: id,
      offeredListingId:
        typeof raw.offeredListingId === "string"
          ? raw.offeredListingId
          : undefined,
      kind: typeof raw.kind === "string" ? raw.kind : undefined,
      title: typeof raw.title === "string" ? raw.title : undefined,
      description:
        typeof raw.description === "string" ? raw.description : undefined,
      deliveryOn:
        typeof raw.deliveryOn === "string" ? raw.deliveryOn : undefined,
      imageUrls,
      orders,
    };
  } catch {
    return null;
  }
}

export type GiftDeliveryQuote = {
  deliveryFeeKobo: number;
  distanceKm: number;
  area: string;
};

export function getGiftDeliveryQuote(
  token: string,
  listingId: string,
): Promise<GiftDeliveryQuote> {
  return apiFetch(`/listings/${listingId}/gift-delivery-quote`, { token });
}

export async function createGiveawayClaim(
  token: string,
  listingId: string,
  note?: string,
): Promise<{
  claim: GiveawayClaim;
  order: { id: string; deliveryFeeKobo: number; totalKobo: number };
}> {
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
