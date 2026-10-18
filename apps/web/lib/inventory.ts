import { apiFetch } from "./api";

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
  publishedAt: string | null;
  updatedAt: string;
  onMarketplace: boolean;
  canRemove: boolean;
  removeBlockedReason: string | null;
  images: { id: string; variants: Record<string, unknown> }[];
};

export function listInventory(token: string): Promise<InventoryRow[]> {
  return apiFetch<InventoryRow[]>("/inventory", { token });
}

export function removeListing(token: string, id: string) {
  return apiFetch(`/listings/${id}`, { method: "DELETE", token });
}
