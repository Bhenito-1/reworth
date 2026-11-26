import {
  BULKY_DELIVERY_RATES,
  computeDeliveryFeeKobo,
  DEFAULT_DELIVERY_RATES,
  isBulkyDeliveryCategory,
  type DeliveryRateParams,
} from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';

/** Lagos fallback when listing pickup geo is missing (matches legacy defaults). */
export const DELIVERY_PICKUP_FALLBACK = {
  lat: 6.5244,
  lng: 3.3792,
} as const;

export type DeliveryHandling = 'bulky' | 'parcel';

export type QuoteDeliveryLegInput = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** When set (e.g. from ORS driving distance), skips haversine here. */
  distanceKm?: number;
  /** Region city key for parcel rates (when not bulky). */
  city?: string | null;
  categorySlug?: string | null;
  /**
   * Resolve city-specific parcel rates. When bulky, this is ignored.
   * Omit to use DEFAULT_DELIVERY_RATES for parcel legs.
   */
  getRegionRates?: (city?: string | null) => DeliveryRateParams;
};

export type DeliveryLegQuote = {
  distanceKm: number;
  deliveryFeeKobo: number;
  handling: DeliveryHandling;
  rates: DeliveryRateParams;
};

export function pickupCoordsFromListing(listing: {
  geoLat?: number | null;
  geoLng?: number | null;
  pickupAddress?: { geoLat?: number | null; geoLng?: number | null } | null;
}): { fromLat: number; fromLng: number } {
  if (
    listing.pickupAddress?.geoLat != null &&
    listing.pickupAddress?.geoLng != null
  ) {
    return {
      fromLat: listing.pickupAddress.geoLat,
      fromLng: listing.pickupAddress.geoLng,
    };
  }
  return {
    fromLat: listing.geoLat ?? DELIVERY_PICKUP_FALLBACK.lat,
    fromLng: listing.geoLng ?? DELIVERY_PICKUP_FALLBACK.lng,
  };
}

/** Delivery quotes require seller pickup address coordinates. */
export function listingHasPickupGeo(listing: {
  geoLat?: number | null;
  geoLng?: number | null;
  pickupAddress?: { geoLat?: number | null; geoLng?: number | null } | null;
}): boolean {
  return (
    listing.pickupAddress?.geoLat != null &&
    listing.pickupAddress?.geoLng != null
  );
}

/** Legacy offset when buyer destination coords are omitted at order create. */
export function defaultDropoffOffset(
  fromLat: number,
  fromLng: number,
  delta = 0.02,
): { toLat: number; toLng: number } {
  return { toLat: fromLat + delta, toLng: fromLng + delta };
}

export function resolveDeliveryRates(input: {
  categorySlug?: string | null;
  city?: string | null;
  getRegionRates?: (city?: string | null) => DeliveryRateParams;
}): { rates: DeliveryRateParams; handling: DeliveryHandling } {
  if (isBulkyDeliveryCategory(input.categorySlug)) {
    return { rates: BULKY_DELIVERY_RATES, handling: 'bulky' };
  }
  const rates = input.getRegionRates
    ? input.getRegionRates(input.city)
    : DEFAULT_DELIVERY_RATES;
  return { rates, handling: 'parcel' };
}

/**
 * Single pipeline for delivery distance + fee (pickup → dropoff).
 * All cart, order, swap, and provider quotes should go through here.
 */
export function quoteDeliveryLeg(input: QuoteDeliveryLegInput): DeliveryLegQuote {
  const distanceKm =
    input.distanceKm != null
      ? Math.round(input.distanceKm * 100) / 100
      : Math.round(
          haversineKm(
            input.fromLat,
            input.fromLng,
            input.toLat,
            input.toLng,
          ) * 100,
        ) / 100;
  const { rates, handling } = resolveDeliveryRates({
    categorySlug: input.categorySlug,
    city: input.city,
    getRegionRates: input.getRegionRates,
  });
  const deliveryFeeKobo = computeDeliveryFeeKobo(distanceKm, rates);
  return { distanceKm, deliveryFeeKobo, handling, rates };
}
