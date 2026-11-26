export type DeliveryQuoteInput = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** Region city key — rates from RegionConfigService (default Lagos). */
  city?: string;
  /** Listing category — bulky (furniture/appliance) uses van rates. */
  categorySlug?: string | null;
};

export type DeliveryQuoteResult = {
  feeKobo: number;
  distanceKm: number;
  provider: string;
};

export type CreateShipmentInput = {
  orderId: string;
  quoteKobo: number;
  distanceKm?: number;
  toLat: number;
  toLng: number;
  fromLat: number;
  fromLng: number;
};

export type CreateShipmentResult = {
  providerRef: string;
  status: 'ASSIGNED';
  etaFrom?: Date;
  etaTo?: Date;
};

export type UpdateShipmentStatusInput = {
  providerRef: string;
  status:
    | 'ASSIGNED'
    | 'PICKED_UP'
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'FAILED';
  failureReason?: string;
};

export interface DeliveryProvider {
  readonly name: string;
  quote(input: DeliveryQuoteInput): Promise<DeliveryQuoteResult>;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  updateStatus(input: UpdateShipmentStatusInput): Promise<void>;
}

export const DELIVERY_PROVIDER = Symbol('DELIVERY_PROVIDER');

export type DeliveryRateParams = {
  baseFeeKobo: number;
  perKmKobo: number;
};

/** Lagos parcel: ₦1,500 base + ₦150/km (actual km), fee rounded to nearest ₦10. */
export const DEFAULT_DELIVERY_RATES: DeliveryRateParams = {
  baseFeeKobo: 150_000,
  perKmKobo: 15_000,
};

/**
 * Van / two-person carry for furniture and appliances.
 * ₦12,000 call-out + ₦800/km. A 3 km sofa is about ₦15,200, not a bike parcel.
 */
export const BULKY_DELIVERY_RATES: DeliveryRateParams = {
  baseFeeKobo: 1_200_000,
  perKmKobo: 80_000,
};

function slugUnderRoot(slug: string, root: string): boolean {
  return slug === root || slug.startsWith(`${root}--`);
}

export type OrsDirectionsProfile = 'driving-car' | 'cycling-electric';

/** Bulky van routes vs e-bike parcel routes (OpenRouteService path profile). */
export function orsDirectionsProfile(
  categorySlug?: string | null,
): OrsDirectionsProfile {
  return isBulkyDeliveryCategory(categorySlug)
    ? 'driving-car'
    : 'cycling-electric';
}

/**
 * Van / two-person carry — explicit category roots only.
 * Avoids treating every slug containing "appliance" as bulky (e.g. kitchen gadgets).
 */
export function isBulkyDeliveryCategory(slug?: string | null): boolean {
  const s = (slug ?? '').trim().toLowerCase();
  if (!s) return false;

  const parcelRoots = [
    'home-appliances--kitchen',
    'collectibles',
    'books',
    'children-baby--toys',
    'fashion',
    'luxury',
    'phones-tablets',
    'computers',
    'other',
    'sports-fitness',
    'tools-equipment',
    'electronics--audio',
    'electronics--cameras',
    'electronics--gaming',
    'electronics--computers',
    'office-equipment--printers',
    'office-equipment--supplies',
  ];
  if (parcelRoots.some((root) => slugUnderRoot(s, root))) return false;

  const bulkyRoots = [
    'home-furniture',
    'home-appliances--laundry',
    'home-appliances--cooling',
    'garden--outdoor-furniture',
    'office-equipment--office-furniture',
    'children-baby--strollers',
    'electronics--tvs',
    'vehicles',
  ];
  return bulkyRoots.some((root) => slugUnderRoot(s, root));
}

/** Nearest ₦10 (1_000 kobo). */
export function roundDeliveryFeeTo10Naira(kobo: number): number {
  return Math.round(kobo / 1_000) * 1_000;
}

/**
 * feeKobo = roundTo10Naira(baseFeeKobo + perKmKobo × km)
 */
export function computeDeliveryFeeKobo(
  distanceKm: number,
  rates: DeliveryRateParams = DEFAULT_DELIVERY_RATES,
): number {
  const km = Math.max(0, distanceKm);
  const raw = rates.baseFeeKobo + rates.perKmKobo * km;
  return roundDeliveryFeeTo10Naira(raw);
}
