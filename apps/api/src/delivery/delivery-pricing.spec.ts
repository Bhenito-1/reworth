import {
  BULKY_DELIVERY_RATES,
  computeDeliveryFeeKobo,
  DEFAULT_DELIVERY_RATES,
} from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';
import {
  quoteDeliveryLeg,
  resolveDeliveryRates,
} from './delivery-pricing';

describe('delivery-pricing', () => {
  it('parcel fee uses base + per km × km, rounded to nearest ₦10', () => {
    expect(computeDeliveryFeeKobo(0.85, DEFAULT_DELIVERY_RATES)).toBe(163_000);
    expect(computeDeliveryFeeKobo(1.01, DEFAULT_DELIVERY_RATES)).toBe(165_000);
    expect(computeDeliveryFeeKobo(2.9, DEFAULT_DELIVERY_RATES)).toBe(194_000);
    expect(computeDeliveryFeeKobo(12.4, DEFAULT_DELIVERY_RATES)).toBe(336_000);
    expect(computeDeliveryFeeKobo(2.9, BULKY_DELIVERY_RATES)).toBe(1_432_000);
  });

  it('quoteDeliveryLeg matches haversine + default parcel rates', () => {
    const fromLat = 6.45;
    const fromLng = 3.45;
    const toLat = 6.5;
    const toLng = 3.5;
    const km = haversineKm(fromLat, fromLng, toLat, toLng);
    const leg = quoteDeliveryLeg({ fromLat, fromLng, toLat, toLng });
    expect(leg.distanceKm).toBe(Math.round(km * 100) / 100);
    expect(leg.deliveryFeeKobo).toBe(computeDeliveryFeeKobo(leg.distanceKm));
    expect(leg.handling).toBe('parcel');
    expect(leg.rates).toEqual(DEFAULT_DELIVERY_RATES);
  });

  it('uses bulky rates for furniture categories', () => {
    const leg = quoteDeliveryLeg({
      fromLat: 6.45,
      fromLng: 3.45,
      toLat: 6.5,
      toLng: 3.5,
      categorySlug: 'home-furniture--sofas',
    });
    expect(leg.handling).toBe('bulky');
    expect(leg.deliveryFeeKobo).toBe(
      computeDeliveryFeeKobo(leg.distanceKm, BULKY_DELIVERY_RATES),
    );
  });

  it('resolveDeliveryRates uses region getter for parcel', () => {
    const custom = { baseFeeKobo: 120_000, perKmKobo: 12_000 };
    const { rates, handling } = resolveDeliveryRates({
      city: 'Abuja',
      getRegionRates: () => custom,
    });
    expect(handling).toBe('parcel');
    expect(rates).toBe(custom);
  });
});
