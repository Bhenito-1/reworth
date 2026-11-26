import type { MeDeliveryAddress } from "./types";

export function hasSavedAddressLine(
  addr?: MeDeliveryAddress | null,
): boolean {
  return Boolean(addr?.line1?.trim());
}