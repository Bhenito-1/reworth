import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { GeocodeResult } from '../providers/geocoding.provider';
import {
  DEFAULT_CITY_KEY,
  REGION_REQUIRED_KEYS,
  type RegionConfig,
  type RegionLogistics,
} from './region-config.types';

function normalizeCityKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
}

function normalizeCommunityKey(community: string): string {
  return community.trim().toUpperCase().replace(/\s+/g, '_');
}

@Injectable()
export class RegionConfigService implements OnModuleInit {
  private readonly logger = new Logger(RegionConfigService.name);
  private readonly byCity = new Map<string, RegionConfig>();
  private loaded = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.reload();
  }

  /** Absolute path to region JSON directory. */
  resolveConfigDir(override?: string): string {
    const fromEnv =
      override ??
      this.config.get<string>('REGION_CONFIG_DIR') ??
      process.env.REGION_CONFIG_DIR;
    if (fromEnv && fromEnv.trim()) {
      return resolve(fromEnv.trim());
    }
    // Prefer monorepo root config/regions from apps/api cwd or nested cwd
    const candidates = [
      resolve(process.cwd(), 'config', 'regions'),
      resolve(process.cwd(), '..', '..', 'config', 'regions'),
      resolve(__dirname, '..', '..', '..', '..', 'config', 'regions'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return candidates[0];
  }

  reload(dirOverride?: string): void {
    const dir = this.resolveConfigDir(dirOverride);
    this.byCity.clear();
    if (!existsSync(dir)) {
      this.logger.warn(`Region config dir missing: ${dir}`);
      this.loaded = true;
      return;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const full = join(dir, file);
      try {
        const raw = JSON.parse(readFileSync(full, 'utf8')) as RegionConfig;
        this.validateConfig(raw, file);
        const key = normalizeCityKey(raw.city);
        this.byCity.set(key, { ...raw, city: key });
      } catch (err) {
        this.logger.error(
          `Failed to load region config ${file}: ${(err as Error).message}`,
        );
        throw err;
      }
    }
    this.loaded = true;
    this.logger.log(
      `Loaded ${this.byCity.size} region config(s) from ${dir}`,
    );
  }

  /** Load a single JSON blob (tests / config-only city proof). */
  loadInline(config: RegionConfig): void {
    this.validateConfig(config, config.city);
    const key = normalizeCityKey(config.city);
    this.byCity.set(key, { ...config, city: key });
    this.loaded = true;
  }

  ensureLoaded(): void {
    if (!this.loaded) this.reload();
  }

  validateConfig(raw: RegionConfig, label: string): void {
    for (const key of REGION_REQUIRED_KEYS) {
      if ((raw as Record<string, unknown>)[key] == null) {
        throw new Error(`${label}: missing required key "${key}"`);
      }
    }
    if (!Array.isArray(raw.communities) || raw.communities.length === 0) {
      throw new Error(`${label}: communities must be non-empty`);
    }
    if (raw.timezone !== 'Africa/Lagos') {
      throw new Error(`${label}: timezone must be Africa/Lagos`);
    }
    for (const c of raw.communities) {
      const g = raw.geocoding?.[c] ?? raw.geocoding?.[normalizeCommunityKey(c)];
      if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') {
        throw new Error(`${label}: geocoding missing lat/lng for ${c}`);
      }
    }
    if (
      typeof raw.logistics?.baseFeeKobo !== 'number' ||
      typeof raw.logistics?.perKmKobo !== 'number'
    ) {
      throw new Error(`${label}: logistics.baseFeeKobo/perKmKobo required`);
    }
    if (typeof raw.psp?.enabled !== 'boolean') {
      throw new Error(`${label}: psp.enabled required`);
    }
  }

  listCities(): Array<{ city: string; displayName: string }> {
    this.ensureLoaded();
    return [...this.byCity.values()]
      .map((c) => ({ city: c.city, displayName: c.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  getCity(key: string): RegionConfig | null {
    this.ensureLoaded();
    return this.byCity.get(normalizeCityKey(key)) ?? null;
  }

  /** Areas inside a state/city. Empty until that region is selected. */
  listAreas(city: string): Array<{ key: string; label: string }> {
    const cfg = this.getCity(city);
    if (!cfg) return [];
    return cfg.communities.map((key) => ({
      key,
      label: cfg.geocoding[key]?.label?.trim() || key,
    }));
  }

  /** Fallback to Lagos when city unknown. */
  requireCity(key?: string | null): RegionConfig {
    this.ensureLoaded();
    const wanted = key ? normalizeCityKey(key) : DEFAULT_CITY_KEY;
    return (
      this.byCity.get(wanted) ??
      this.byCity.get(DEFAULT_CITY_KEY) ??
      this.fallbackLagos()
    );
  }

  getCommunityGeo(
    city: string,
    community: string,
  ): GeocodeResult | null {
    const cfg = this.requireCity(city);
    const key = normalizeCommunityKey(community);
    const entry =
      cfg.geocoding[key] ??
      cfg.geocoding[community] ??
      this.fuzzyGeo(cfg, community);
    if (!entry) return null;
    return {
      community: key,
      geoLat: entry.lat,
      geoLng: entry.lng,
      label: entry.label ?? key,
    };
  }

  getDeliveryRates(city?: string | null): RegionLogistics {
    return this.requireCity(city).logistics;
  }

  /** Helpers for search / analytics / notifications without code change. */
  resolveSearchCity(city?: string | null): string {
    return this.requireCity(city).displayName;
  }

  resolveAnalyticsCity(city?: string | null): string {
    return this.requireCity(city).city;
  }

  pspEnabled(city?: string | null): boolean {
    return this.requireCity(city).psp.enabled;
  }

  private fuzzyGeo(
    cfg: RegionConfig,
    community: string,
  ): { lat: number; lng: number; label?: string } | null {
    const lower = community.toLowerCase();
    for (const [k, v] of Object.entries(cfg.geocoding)) {
      if (
        k.toLowerCase().includes(lower) ||
        lower.includes(k.toLowerCase().replace(/_/g, ' ')) ||
        (v.label && v.label.toLowerCase().includes(lower))
      ) {
        return v;
      }
    }
    const first = cfg.communities[0];
    return first ? cfg.geocoding[first] ?? null : null;
  }

  private fallbackLagos(): RegionConfig {
    return {
      city: DEFAULT_CITY_KEY,
      displayName: 'Lagos',
      timezone: 'Africa/Lagos',
      communities: ['OTHER_LAGOS'],
      geocoding: {
        OTHER_LAGOS: { lat: 6.5244, lng: 3.3792, label: 'Lagos' },
      },
      logistics: { baseFeeKobo: 150_000, perKmKobo: 15_000 },
      priceBands: {
        budget: { minKobo: 0, maxKobo: 5_000_000 },
      },
      psp: { enabled: true },
    };
  }
}
