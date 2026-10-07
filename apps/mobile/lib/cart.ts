import { apiFetch } from "./api";

export type CartItem = {
  id: string;
  quantity: number;
  unavailable: boolean;
  listing: {
    id: string;
    title: string;
    priceKobo: number;
    status: string;
    quantityAvailable: number;
    quantityTotal: number;
  };
};

export type InventoryRow = {
  id: string;
  title: string;
  status: string;
  sellingMode: string;
  priceKobo: number;
  quantityTotal: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  onMarketplace: boolean;
  canRemove: boolean;
  removeBlockedReason: string | null;
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
  return apiFetch(`/cart/items/${listingId}`, {
    method: "PATCH",
    token,
    body: { quantity },
  });
}

export function removeFromCart(token: string, listingId: string) {
  return apiFetch(`/cart/items/${listingId}`, { method: "DELETE", token });
}

export function checkoutCart(
  token: string,
  fulfilmentMethod: "PICKUP" | "MEET_POINT" | "DELIVERY" = "PICKUP",
): Promise<{ orders: { id: string }[] }> {
  return apiFetch("/cart/checkout", {
    method: "POST",
    token,
    body: { fulfilmentMethod },
  });
}

export function listInventory(token: string): Promise<InventoryRow[]> {
  return apiFetch<InventoryRow[]>("/inventory", { token });
}

export function removeListing(token: string, id: string) {
  return apiFetch(`/listings/${id}`, { method: "DELETE", token });
}
