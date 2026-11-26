import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pickOrsGeocodeCandidate } from './geocode-pick';

export type LatLng = { lat: number; lng: number };

export type OrsGeocodeHit = LatLng & {
  label: string;
};

export type OrsDistanceHit = {
  distanceKm: number;
  durationSec?: number;
};

export type OrsDirectionsProfile = 'driving-car' | 'cycling-electric';

export type DrivingDistanceOpts = {
  skipBudget?: boolean;
  profile?: OrsDirectionsProfile;
};

/** Low-level OpenRouteService HTTP — not used outside RoutingService. */
@Injectable()
export class OpenRouteServiceClient {
  private readonly logger = new Logger(OpenRouteServiceClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dailyLimit: number;
  private dayKey = '';
  private geocodeDayCount = 0;
  private directionsDayCount = 0;
  private disabledUntilMs = 0;

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('ORS_API_KEY') ??
      this.config.get<string>('OPENROUTESERVICE_API_KEY') ??
      '';
    this.baseUrl = (
      this.config.get<string>('ORS_BASE_URL') ??
      'https://api.openrouteservice.org'
    ).replace(/\/$/, '');
    this.dailyLimit = Number(
      this.config.get<string>('ORS_DAILY_REQUEST_LIMIT') ?? 2000,
    );
  }

  private geocodeDailyLimit(): number {
    const reserve = Math.max(
      200,
      Math.floor(this.dailyLimit * 0.25),
    );
    return Math.max(100, this.dailyLimit - reserve);
  }

  private directionsDailyLimit(): number {
    return Math.max(200, this.dailyLimit - this.geocodeDailyLimit());
  }

  enabled(): boolean {
    return Boolean(this.apiKey.trim());
  }

  private rollDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dayKey !== today) {
      this.dayKey = today;
      this.geocodeDayCount = 0;
      this.directionsDayCount = 0;
    }
  }

  private trackGeocode(): boolean {
    this.rollDay();
    if (Date.now() < this.disabledUntilMs) return false;
    if (this.geocodeDayCount >= this.geocodeDailyLimit()) {
      this.logger.warn('ORS geocode daily budget reached');
      return false;
    }
    this.geocodeDayCount += 1;
    return true;
  }

  private trackDirections(): boolean {
    this.rollDay();
    if (Date.now() < this.disabledUntilMs) return false;
    if (this.directionsDayCount >= this.directionsDailyLimit()) {
      this.logger.warn('ORS directions daily budget reached');
      return false;
    }
    this.directionsDayCount += 1;
    return true;
  }

  private backoff(ms: number, reason: string): void {
    this.disabledUntilMs = Date.now() + ms;
    this.logger.warn(`ORS paused for ${Math.round(ms / 1000)}s: ${reason}`);
  }

  async geocodeSearch(
    query: string,
    focus?: LatLng,
    opts?: { community?: string | null; maxKmFromFocus?: number },
  ): Promise<OrsGeocodeHit | null> {
    if (!this.enabled() || !this.trackGeocode()) return null;
    const params = new URLSearchParams({
      api_key: this.apiKey,
      text: query,
      size: '8',
      boundary_country: 'NG',
    });
    if (focus) {
      params.set('focus.point.lat', String(focus.lat));
      params.set('focus.point.lon', String(focus.lng));
      params.set('boundary.circle.lat', String(focus.lat));
      params.set('boundary.circle.lon', String(focus.lng));
      params.set('boundary.circle.radius', String(opts?.maxKmFromFocus ?? 8));
    }
    const url = `${this.baseUrl}/geocode/search?${params.toString()}`;
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status === 429) {
        this.backoff(60_000, 'rate limited (geocode)');
        return null;
      }
      if (!res.ok) {
        this.logger.debug(`ORS geocode HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as {
        features?: Array<{
          properties?: { label?: string; name?: string };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      const raw = json.features ?? [];
      const candidates = raw
        .map((feature) => {
          const coords = feature.geometry?.coordinates;
          if (!coords?.length) return null;
          const [lng, lat] = coords;
          const label =
            feature.properties?.label?.trim() ||
            feature.properties?.name?.trim() ||
            query;
          return { lat, lng, label };
        })
        .filter((f): f is { lat: number; lng: number; label: string } =>
          Boolean(f),
        );

      if (!focus || candidates.length === 0) {
        const first = candidates[0];
        return first ?? null;
      }

      const picked = pickOrsGeocodeCandidate(candidates, focus, opts);
      if (!picked) {
        this.logger.debug(
          `ORS geocode: no candidate within ${opts?.maxKmFromFocus ?? 6}km of focus for "${query}"`,
        );
        return null;
      }
      return picked;
    } catch (err) {
      this.logger.debug(`ORS geocode failed: ${(err as Error).message}`);
      return null;
    }
  }

  async drivingDistance(
    from: LatLng,
    to: LatLng,
    opts?: DrivingDistanceOpts,
  ): Promise<OrsDistanceHit | null> {
    if (!this.enabled()) return null;

    if (!opts?.skipBudget && !this.trackDirections()) {
      return null;
    }

    const profile = opts?.profile ?? 'driving-car';
    const url = `${this.baseUrl}/v2/directions/${profile}`;
    const useContinueStraight = profile === 'driving-car';

    const coordinates: [number, number][] = [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];

    const attempts: { name: string; body: Record<string, unknown> }[] = [
      {
        name: 'standard-350m',
        body: {
          coordinates,
          radiuses: [350, 350],
          ...(useContinueStraight ? { continue_straight: false } : {}),
        },
      },
      {
        name: 'extended-2000m',
        body: {
          coordinates,
          radiuses: [2000, 2000],
          ...(useContinueStraight ? { continue_straight: false } : {}),
        },
      },
      {
        name: 'unrestricted-radius',
        body: {
          coordinates,
          radiuses: [-1, -1],
        },
      },
      {
        name: 'default-settings',
        body: {
          coordinates,
        },
      },
    ];

    const retryableStatus = new Set([400, 404, 500, 502, 503, 504]);

    try {
      for (const attempt of attempts) {
        this.logger.log(`ORS directions attempt: ${attempt.name}`);
        this.logger.log(`ORS request URL: ${url}`);
        this.logger.log(`ORS request body: ${JSON.stringify(attempt.body)}`);

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(attempt.body),
        });

        if (res.status === 429) {
          this.backoff(60_000, 'rate limited (directions)');
          return null;
        }

        if (!res.ok) {
          const errorText = await res.text();
          if (retryableStatus.has(res.status)) {
            this.logger.debug(
              `ORS attempt ${attempt.name} retryable: HTTP ${res.status} - ${errorText}`,
            );
            continue;
          }
          this.logger.warn(
            `ORS attempt ${attempt.name} failed: HTTP ${res.status} - ${errorText}`,
          );
          return null;
        }

        const json = (await res.json()) as {
          routes?: Array<{
            summary?: { distance?: number; duration?: number };
            bbox?: number[];
          }>;
        };

        const route = json.routes?.[0];
        const meters = route?.summary?.distance;

        if (meters == null || !Number.isFinite(meters)) {
          this.logger.warn(
            `ORS attempt ${attempt.name}: no valid route distance`,
          );
          continue;
        }

        const distanceKm = Math.round((meters / 1000) * 100) / 100;
        const durationSec = route?.summary?.duration;

        this.logger.log(
          JSON.stringify({
            attempt: attempt.name,
            profile,
            coordinates,
            bbox: route?.bbox,
            distanceMeters: meters,
            distanceKm,
            durationSec,
          }),
        );

        return {
          distanceKm,
          durationSec,
        };
      }

      this.logger.warn('ORS directions: all routing attempts failed');
      return null;
    } catch (err) {
      this.logger.error(`ORS directions failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Directions for a quote. Respects the daily budget so a full quota uses stored coordinates. */
  async drivingDistanceQuote(
    from: LatLng,
    to: LatLng,
    opts?: Pick<DrivingDistanceOpts, 'profile'>,
  ): Promise<OrsDistanceHit | null> {
    return this.drivingDistance(from, to, { profile: opts?.profile });
  }
}
