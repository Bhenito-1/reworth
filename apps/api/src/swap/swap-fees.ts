import { computeDeliveryFeeKobo } from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';

/** Each person pays ₦500 to swap, on top of their own delivery fee. */
export const SWAP_FEE_PER_USER_KOBO = 50_000;

const LAGOS = { lat: 6.5244, lng: 3.3792 };

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
  return {
    lat: listing.geoLat ?? LAGOS.lat,
    lng: listing.geoLng ?? LAGOS.lng,
  };
}

/** Delivery of one swapped item, plus the ₦500 swap fee. The item price stays ₦0. */
export function quoteSwapParty(
  from: { geoLat?: number | null; geoLng?: number | null },
  to: { geoLat?: number | null; geoLng?: number | null },
): PartyQuote {
  const origin = pointOf(from);
  const dest = pointOf(to);
  const distanceKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
  const deliveryFeeKobo = computeDeliveryFeeKobo(distanceKm);
  return {
    distanceKm,
    deliveryFeeKobo,
    swapFeeKobo: SWAP_FEE_PER_USER_KOBO,
    totalKobo: deliveryFeeKobo + SWAP_FEE_PER_USER_KOBO,
  };
}

/** Gift delivery from the listing to the buyer's area. */
export function quoteGiftDelivery(
  listing: { geoLat?: number | null; geoLng?: number | null },
  destination?: { lat: number; lng: number },
): { distanceKm: number; deliveryFeeKobo: number } {
  const origin = pointOf(listing);
  const dest = destination ?? {
    lat: origin.lat + 0.02,
    lng: origin.lng + 0.02,
  };
  const distanceKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
  return {
    distanceKm,
    deliveryFeeKobo: computeDeliveryFeeKobo(distanceKm),
  };
}
