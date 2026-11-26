import { Inject, Injectable, Optional } from '@nestjs/common';
import { haversineKm } from '../providers/search.provider';
import { GEOCODING_PROVIDER, type GeocodingProvider } from '../providers/geocoding.provider';
import {
  OpenRouteServiceClient,
  type LatLng,
  type OrsDirectionsProfile,
} from './openrouteservice.client';
import { StreetGeocodeAnchorService } from './street-geocode-anchor.service';
import { streetSearchQuery } from './street-key';

export type DistanceSource = 'ors' | 'estimated' | 'haversine';

export type GeocodeAddressOpts = {
  /** Pelias is for save / explicit preview only; quotes use street anchors + community. */
  useOrs?: boolean;
};

export type GeocodeSource =
  | 'ors'
  | 'street_cache'
  | 'street_estimate'
  | 'community'
  | 'none';

export type ResolvedDistance = {
  distanceKm: number;
  source: DistanceSource;
};

export type ResolvedGeocode = LatLng & {
  source: GeocodeSource;
  label?: string;
};

export type AddressParts = {
  line1: string;
  line2?: string | null;
  city?: string | null;
  community?: string | null;
  country?: string | null;
};

const DELIVERY_ADDRESS_LABEL = 'delivery';

/** Spread distinct coords per street when ORS has no hit (≈1.3 km max from centroid). */
function streetOffsetFromCentroid(text: string): { dLat: number; dLng: number } {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  const scale = 0.012;
  return {
    dLat: ((h & 0xff) / 255 - 0.5) * scale,
    dLng: (((h >> 8) & 0xff) / 255 - 0.5) * scale,
  };
}

@Injectable()
export class RoutingService {
  constructor(
    private readonly ors: OpenRouteServiceClient,
    @Optional() private readonly streetAnchors?: StreetGeocodeAnchorService,
    @Optional()
    @Inject(GEOCODING_PROVIDER)
    private readonly communityGeo?: GeocodingProvider,
  ) {}

  deliveryAddressLabel(): string {
    return DELIVERY_ADDRESS_LABEL;
  }

  formatAddressQuery(parts: AddressParts): string {
    const city = parts.city?.trim() || 'Lagos';
    const community = parts.community?.trim();
    const street = [parts.line1?.trim(), parts.line2?.trim()]
      .filter(Boolean)
      .join(' ');
    return [community, city, street, parts.country ?? 'Nigeria']
      .filter(Boolean)
      .join(', ');
  }

  private async communityCentroid(
    parts: AddressParts,
  ): Promise<LatLng | undefined> {
    const community = parts.community?.trim();
    if (!community || !this.communityGeo) return undefined;
    const g = await this.communityGeo.geocodeCommunity(
      community,
      parts.city ?? undefined,
    );
    if (!g) return undefined;
    return { lat: g.geoLat, lng: g.geoLng };
  }

  /**
   * Geocode for persisting addresses: ORS → middle ground.
   * Quotes should pass `{ useOrs: false }` and rely on stored rows when possible.
   */
  async geocodeAddress(
    parts: AddressParts,
    focus?: LatLng,
    opts?: GeocodeAddressOpts,
  ): Promise<ResolvedGeocode | null> {
    const query = this.formatAddressQuery(parts);
    if (query.length < 4) return null;

    const community = parts.community?.trim();
    const city = parts.city?.trim() || 'Lagos';
    const communityPoint = await this.communityCentroid(parts);
    const useOrs = opts?.useOrs !== false;

    if (useOrs) {
      const anchor: LatLng | undefined = focus ?? communityPoint;
      const orsOpts = { community, maxKmFromFocus: 6 };

      let orsHit = await this.ors.geocodeSearch(query, anchor, orsOpts);
      if (orsHit) {
        return {
          lat: orsHit.lat,
          lng: orsHit.lng,
          source: 'ors',
          label: orsHit.label,
        };
      }

      const bundle =
        community && this.streetAnchors
          ? await this.streetAnchors.findAnchors({
              line1: parts.line1,
              community,
              city,
            })
          : null;

      if (bundle?.median) {
        const streetFocus = bundle.median;
        orsHit = await this.ors.geocodeSearch(query, streetFocus, {
          community,
          maxKmFromFocus: 2,
        });
        if (orsHit) {
          return {
            lat: orsHit.lat,
            lng: orsHit.lng,
            source: 'ors',
            label: orsHit.label,
          };
        }

        const streetQuery = streetSearchQuery(parts);
        if (streetQuery.length >= 6) {
          orsHit = await this.ors.geocodeSearch(streetQuery, streetFocus, {
            community,
            maxKmFromFocus: 2.5,
          });
          if (orsHit) {
            return {
              lat: orsHit.lat,
              lng: orsHit.lng,
              source: 'ors',
              label: orsHit.label,
            };
          }
        }
      }
    }

    return this.geocodeAddressMiddleGround(parts, communityPoint);
  }

  /**
   * Street anchor DB → on-street estimate → community centroid (+ per-street offset).
   * No ORS calls — safe when Pelias quota is exhausted.
   */
  async geocodeAddressMiddleGround(
    parts: AddressParts,
    communityPoint?: LatLng,
  ): Promise<ResolvedGeocode | null> {
    const community = parts.community?.trim();
    const city = parts.city?.trim() || 'Lagos';
    const point =
      communityPoint ?? (await this.communityCentroid(parts));

    const bundle =
      community && this.streetAnchors
        ? await this.streetAnchors.findAnchors({
            line1: parts.line1,
            community,
            city,
          })
        : null;

    if (bundle?.median) {
      const streetExact = this.streetAnchors!.estimateOnStreet(
        parts.line1,
        bundle,
        point,
      );
      if (streetExact) {
        return {
          lat: streetExact.lat,
          lng: streetExact.lng,
          source:
            bundle.numbered.length > 0 ? 'street_estimate' : 'street_cache',
          label: parts.line1.trim(),
        };
      }
      if (bundle.median) {
        return {
          lat: bundle.median.lat,
          lng: bundle.median.lng,
          source: 'street_cache',
          label: parts.line1.trim(),
        };
      }
    }

    if (community && this.communityGeo) {
      const g = await this.communityGeo.geocodeCommunity(
        community,
        parts.city ?? undefined,
      );
      if (g) {
        const streetKey = [parts.line1, parts.line2, community]
          .filter(Boolean)
          .join('|');
        const { dLat, dLng } = streetOffsetFromCentroid(streetKey);
        return {
          lat: g.geoLat + dLat,
          lng: g.geoLng + dLng,
          source: 'community',
          label: `${parts.line1?.trim() ?? ''}, ${g.label}`.trim(),
        };
      }
    }

    return null;
  }

  /**
   * 1. ORS driving route.
   * 2. If ORS is unavailable and both ends already have stored coordinates,
   *    approximate road distance from those points.
   * 3. Straight-line haversine only when stored coordinates are not available.
   */
  async drivingDistanceKm(
    from: LatLng,
    to: LatLng,
    opts?: {
      fromStoredGeocodes?: boolean;
      profile?: OrsDirectionsProfile;
    },
  ): Promise<ResolvedDistance> {
    if (this.ors.enabled()) {
      const profile = opts?.profile ?? 'driving-car';
      let ors = await this.ors.drivingDistanceQuote(from, to, { profile });
      if (!ors && profile !== 'driving-car') {
        ors = await this.ors.drivingDistanceQuote(from, to, {
          profile: 'driving-car',
        });
      }
      if (ors) {
        return { distanceKm: ors.distanceKm, source: 'ors' };
      }
    }
    const straight = haversineKm(from.lat, from.lng, to.lat, to.lng);
    if (opts?.fromStoredGeocodes) {
      const factor = straight < 3 ? 1.1 : straight < 12 ? 1.18 : 1.25;
      return {
        distanceKm: Math.round(straight * factor * 100) / 100,
        source: 'estimated',
      };
    }
    return {
      distanceKm: Math.round(straight * 100) / 100,
      source: 'haversine',
    };
  }
}