import { apiFetch, ApiError } from "./api";
import type { FulfilmentPreference } from "./fulfilment-preference";
import { computeProtectionFeeKobo } from "./orders";

export function cartAddErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Could not add to cart";
}

export type CartListing = {
  id: string;
  title: string;
  priceKobo: number;
  status: string;
  sellingMode: string;
  sellerId: string;
  geoLat: number | null;
  geoLng: number | null;
  quantityAvailable: number;
  quantityTotal: number;
  fulfilmentPreference?: FulfilmentPreference | null;
  fulfilmentDelivery?: boolean;
  fulfilmentMeet?: boolean;
  images: { id: string; variants: Record<string, unknown> }[];
};

export type CartItem = {
  id: string;
  quantity: number;
  unavailable: boolean;
  createdAt: string;
  updatedAt: string;
  listing: CartListing;
};

export type CartQuoteLine = {
  listingId: string;
  sellerId: string;
  title: string;
  quantity: number;
  unitPriceKobo: number;
  itemSubtotalKobo: number;
  deliveryFeeKobo: number;
  protectionFeeKobo: number;
  lineTotalKobo: number;
};

export type CartQuote = {
  lines: CartQuoteLine[];
  deliveryBySeller: {
    sellerId: string;
    deliveryFeeKobo: number;
    distanceKm: number | null;
  }[];
  itemsSubtotalKobo: number;
  deliveryTotalKobo: number;
  protectionTotalKobo: number;
  grandTotalKobo: number;
};

/** Totals for cart checkout without delivery (e.g. meetup). Matches API per-line protection. */
export function computeCartItemTotals(
  items: { quantity: number; listing: { priceKobo: number } }[],
): {
  itemsSubtotalKobo: number;
  protectionTotalKobo: number;
  grandTotalKobo: number;
} {
  let itemsSubtotalKobo = 0;
  let protectionTotalKobo = 0;
  for (const item of items) {
    const itemSubtotalKobo = item.listing.priceKobo * item.quantity;
    itemsSubtotalKobo += itemSubtotalKobo;
    protectionTotalKobo += computeProtectionFeeKobo(itemSubtotalKobo);
  }
  return {
    itemsSubtotalKobo,
    protectionTotalKobo,
    grandTotalKobo: itemsSubtotalKobo + protectionTotalKobo,
  };
}

export function listCart(token: string): Promise<CartItem[]> {
  return apiFetch<CartItem[]>("/cart", { token });
}

export function addToCart(
  token: string,
  listingId: string,
  quantity = 1,
): Promise<CartItem> {
  return apiFetch<CartItem>("/cart/items", {
    method: "POST",
    token,
    body: { listingId, quantity },
  });
}

export function updateCartQuantity(
  token: string,
  listingId: string,
  quantity: number,
): Promise<CartItem> {
  return apiFetch<CartItem>(`/cart/items/${listingId}`, {
    method: "PATCH",
    token,
    body: { quantity },
  });
}

export function removeFromCart(
  token: string,
  listingId: string,
): Promise<{ removed: boolean }> {
  return apiFetch(`/cart/items/${listingId}`, { method: "DELETE", token });
}

export function quoteCart(
  token: string,
  body: {
    toLat: number;
    toLng: number;
    deliveryLine1?: string;
    deliveryCommunity?: string;
    deliveryCity?: string;
  },
): Promise<CartQuote> {
  return apiFetch<CartQuote>("/cart/quote", { method: "POST", token, body });
}

export function checkoutCart(
  token: string,
  body: {
    fulfilmentMethod: "DELIVERY";
    toLat: number;
    toLng: number;
    deliveryAddress: string;
    deliveryLine1?: string;
    deliveryCommunity?: string;
    deliveryCity?: string;
  },
): Promise<{
  checkoutId: string;
  orders: { id: string }[];
  quote: CartQuote;
}> {
  return apiFetch("/cart/checkout", { method: "POST", token, body });
}
