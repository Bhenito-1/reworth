export type RegionGeocodeEntry = {
  lat: number;
  lng: number;
  label?: string;
};

export type RegionLogistics = {
  baseFeeKobo: number;
  perKmKobo: number;
};

export type RegionPriceBand = {
  minKobo: number;
  maxKobo: number | null;
};

export type RegionConfig = {
  city: string;
  displayName: string;
  timezone: string;
  communities: string[];
  geocoding: Record<string, RegionGeocodeEntry>;
  logistics: RegionLogistics;
  priceBands: Record<string, RegionPriceBand>;
  psp: { enabled: boolean; provider?: string };
};

export const REGION_REQUIRED_KEYS = [
  'city',
  'displayName',
  'timezone',
  'communities',
  'geocoding',
  'logistics',
  'priceBands',
  'psp',
] as const;

export const DEFAULT_CITY_KEY = 'lagos';
