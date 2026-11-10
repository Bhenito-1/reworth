export type DeliveryQuoteInput = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** Region city key — rates from RegionConfigService (default Lagos). */
  city?: string;
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

/** Lagos parcel: ₦1,500 base + ₦150/km (ceil), in kobo. */
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

export function isBulkyDeliveryCategory(slug?: string | null): boolean {
  return /(furniture|appliance)/i.test(slug ?? '');
}

/**
 * feeKobo = baseFeeKobo + perKmKobo * ceil(km)
 */
export function computeDeliveryFeeKobo(
  distanceKm: number,
  rates: DeliveryRateParams = DEFAULT_DELIVERY_RATES,
): number {
  const km = Math.max(0, distanceKm);
  const ceilKm = Math.ceil(km);
  return rates.baseFeeKobo + rates.perKmKobo * ceilKm;
}
