/**
 * Circular economy — donate-if-unsold (seller).
 */

import { apiFetch } from "./api";

export async function setDonateIfUnsold(
  token: string,
  listingId: string,
  donateIfUnsoldDays: number | null,
): Promise<unknown> {
  return apiFetch(`/listings/${listingId}/donate-if-unsold`, {
    method: "POST",
    token,
    body: { donateIfUnsoldDays },
  });
}
