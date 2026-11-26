/** Flip to `true` when ReWorth courier delivery is open for new checkouts. */
export const PLATFORM_DELIVERY_CHECKOUT_ENABLED = false;

export const PLATFORM_DELIVERY_UNAVAILABLE_MESSAGE =
  "ReWorth delivery is currently unavailable. Please use a meetup point instead.";

export function isPlatformDeliveryCheckoutAllowed(
  fulfilmentMethod: string | null | undefined,
): boolean {
  if (fulfilmentMethod !== "DELIVERY") return true;
  return PLATFORM_DELIVERY_CHECKOUT_ENABLED;
}