import {
  defaultDropoffOffset,
  pickupCoordsFromListing,
  quoteDeliveryLeg,
} from '../delivery/delivery-pricing';

/** Each person pays ₦500 to swap, on top of their own delivery fee. */
export const SWAP_FEE_PER_USER_KOBO = 50_000;

export type PartyQuote = {
  distanceKm: number;
  deliveryFeeKobo: number;
  swapFeeKobo: number;
  totalKobo: number;
};

export function pointOf(listing: {
  geoLat?: number | null;
  geoLng?: number | null;
}): { lat: number; lng: number } {
  const { fromLat, fromLng } = pickupCoordsFromListing(listing);
  return { lat: fromLat, lng: fromLng };
}

/** Delivery of one swapped item, plus the ₦500 swap fee. The item price stays ₦0. */
export function quoteSwapParty(
  from: { geoLat?: number | null; geoLng?: number | null },
  to: { geoLat?: number | null; geoLng?: number | null },
): PartyQuote {
  const origin = pointOf(from);
  const dest = pointOf(to);
  const leg = quoteDeliveryLeg({
    fromLat: origin.lat,
    fromLng: origin.lng,
    toLat: dest.lat,
    toLng: dest.lng,
  });
  return {
    distanceKm: leg.distanceKm,
    deliveryFeeKobo: leg.deliveryFeeKobo,
    swapFeeKobo: SWAP_FEE_PER_USER_KOBO,
    totalKobo: leg.deliveryFeeKobo + SWAP_FEE_PER_USER_KOBO,
  };
}

/** Gift delivery from the listing to the buyer's area. */
export function quoteGiftDelivery(
  listing: { geoLat?: number | null; geoLng?: number | null },
  destination?: { lat: number; lng: number },
): { distanceKm: number; deliveryFeeKobo: number } {
  const origin = pointOf(listing);
  const dest =
    destination ??
    (() => {
      const off = defaultDropoffOffset(origin.lat, origin.lng);
      return { lat: off.toLat, lng: off.toLng };
    })();
  const leg = quoteDeliveryLeg({
    fromLat: origin.lat,
    fromLng: origin.lng,
    toLat: dest.lat,
    toLng: dest.lng,
  });
  return {
    distanceKm: leg.distanceKm,
    deliveryFeeKobo: leg.deliveryFeeKobo,
  };
}
