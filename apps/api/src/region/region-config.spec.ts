import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigService } from '@nestjs/config';
import { RegionConfigService } from './region-config.service';
import type { RegionConfig } from './region-config.types';
import { computeDeliveryFeeKobo } from '../providers/delivery.provider';

const IBADAN: RegionConfig = {
  city: 'ibadan',
  displayName: 'Ibadan',
  timezone: 'Africa/Lagos',
  communities: ['BODIJA', 'UI', 'RING_ROAD', 'OTHER_IBADAN'],
  geocoding: {
    BODIJA: { lat: 7.432, lng: 3.913, label: 'Bodija' },
    UI: { lat: 7.443, lng: 3.9, label: 'University of Ibadan' },
    RING_ROAD: { lat: 7.377, lng: 3.947, label: 'Ring Road' },
    OTHER_IBADAN: { lat: 7.3775, lng: 3.947, label: 'Ibadan' },
  },
  logistics: {
    baseFeeKobo: 120_000,
    perKmKobo: 12_000,
  },
  priceBands: {
    budget: { minKobo: 0, maxKobo: 3_000_000 },
    mid: { minKobo: 3_000_000, maxKobo: 25_000_000 },
    premium: { minKobo: 25_000_000, maxKobo: null },
  },
  psp: { enabled: true, provider: 'paystack' },
};

describe('RegionConfigService — config-only city expansion', () => {
  it('loads Ibadan from fixture JSON → search/geo/delivery/analytics/notifications resolve without code change', () => {
    const dir = join(tmpdir(), `reworth-regions-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ibadan.json'), JSON.stringify(IBADAN, null, 2));

    const config = {
      get: (k: string) => (k === 'REGION_CONFIG_DIR' ? dir : undefined),
    } as unknown as ConfigService;

    const svc = new RegionConfigService(config);
    svc.reload(dir);

    const city = svc.getCity('ibadan');
    expect(city?.displayName).toBe('Ibadan');
    expect(svc.listCities().some((c) => c.city === 'ibadan')).toBe(true);

    // geo
    const geo = svc.getCommunityGeo('ibadan', 'Bodija');
    expect(geo?.geoLat).toBeCloseTo(7.432, 3);
    expect(geo?.geoLng).toBeCloseTo(3.913, 3);

    // delivery rates (no hardcoded Lagos fallback for known city)
    const rates = svc.getDeliveryRates('ibadan');
    expect(rates.baseFeeKobo).toBe(120_000);
    expect(rates.perKmKobo).toBe(12_000);
    expect(computeDeliveryFeeKobo(2, rates)).toBe(120_000 + 12_000 * 2);

    // search / analytics / notifications helpers
    expect(svc.resolveSearchCity('ibadan')).toBe('Ibadan');
    expect(svc.resolveAnalyticsCity('ibadan')).toBe('ibadan');
    expect(svc.pspEnabled('ibadan')).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to Lagos for unknown city', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const svc = new RegionConfigService(config);
    // Prefer inline when repo config may or may not be present
    svc.loadInline({
      city: 'lagos',
      displayName: 'Lagos',
      timezone: 'Africa/Lagos',
      communities: ['LEKKI_PH1'],
      geocoding: {
        LEKKI_PH1: { lat: 6.4474, lng: 3.4721, label: 'Lekki Phase 1' },
      },
      logistics: { baseFeeKobo: 150_000, perKmKobo: 15_000 },
      priceBands: { budget: { minKobo: 0, maxKobo: 1 } },
      psp: { enabled: true },
    });

    const rates = svc.getDeliveryRates('unknown-city');
    expect(rates.baseFeeKobo).toBe(150_000);
    expect(svc.getCommunityGeo('unknown-city', 'LEKKI_PH1')?.label).toMatch(
      /Lekki/i,
    );
    expect(svc.listAreas('lagos')).toEqual([
      { key: 'LEKKI_PH1', label: 'Lekki Phase 1' },
    ]);
    expect(svc.listAreas('missing')).toEqual([]);
  });
});
