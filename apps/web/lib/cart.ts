import { apiFetch } from "./api";

export type CartListing = {
  id: string;
  title: string;
  priceKobo: number;
  status: string;
  sellingMode: string;
  quantityAvailable: number;
  quantityTotal: number;
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

export function checkoutCart(
  token: string,
  body: { fulfilmentMethod: "PICKUP" | "MEET_POINT" | "DELIVERY"; listingIds?: string[] },
): Promise<{ orders: { id: string }[] }> {
  return apiFetch("/cart/checkout", { method: "POST", token, body });
}
