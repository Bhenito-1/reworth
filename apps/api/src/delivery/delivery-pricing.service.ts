import {
  BadRequestException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ADDRESS_KIND } from '../addresses/address-kind';
import {
  deliveryUsesStoredRow,
  storedAddressCoords,
  type StoredAddressGeo,
} from '../addresses/address-parts-match';
import { AddressesService } from '../addresses/addresses.service';
import { RegionConfigService } from '../region/region-config.service';
import { RoutingService, type AddressParts } from '../routing/routing.service';
import type { LatLng } from '../routing/openrouteservice.client';
import { coordsPlausibleForCommunity } from '../routing/address-plausibility';
import { orsDirectionsProfile } from '../providers/delivery.provider';
import {
  quoteDeliveryLeg,
  type DeliveryLegQuote,
  type QuoteDeliveryLegInput,
} from './delivery-pricing';

export type PricedDeliveryLeg = DeliveryLegQuote & {
  distanceSource: 'ors' | 'estimated' | 'haversine';
};

export const PICKUP_ADDRESS_QUOTE_SELECT = {
  geoLat: true,
  geoLng: true,
  line1: true,
  line2: true,
  community: true,
  city: true,
  country: true,
  geocodeSource: true,
} as const;

function formatLoggedAddress(parts?: {
  line1?: string | null;
  line2?: string | null;
  community?: string | null;
  city?: string | null;
} | null): string {
  return [parts?.line1, parts?.line2, parts?.community, parts?.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

const QUOTE_GEOCODE_OPTS = { useOrs: false as const };

type ListingPickup = {
  geoLat?: number | null;
  geoLng?: number | null;
  community?: string | null;
  city?: string | null;
  category?: { slug: string } | null;
  pickupAddress?: {
    geoLat?: number | null;
    geoLng?: number | null;
    geocodeSource?: string | null;
    line1?: string | null;
    line2?: string | null;
    community?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
};

@Injectable()
export class DeliveryPricingService {
  constructor(
    private readonly routing: RoutingService,
    @Optional() private readonly regions?: RegionConfigService,
    @Optional() private readonly addresses?: AddressesService,
  ) {}

  private regionRates(city?: string | null) {
    return this.regions
      ? (c?: string | null) => this.regions!.getDeliveryRates(c ?? city ?? undefined)
      : undefined;
  }

  private communityCenter(
    community?: string | null,
    city?: string | null,
  ): LatLng | undefined {
    if (!this.regions || !community?.trim()) return undefined;
    const g = this.regions.getCommunityGeo(city ?? 'Lagos', community);
    if (!g) return undefined;
    return { lat: g.geoLat, lng: g.geoLng };
  }

  async quoteLegBetween(
    pickup: LatLng,
    dropoff: LatLng,
    opts?: {
      city?: string | null;
      categorySlug?: string | null;
      fromStoredGeocodes?: boolean;
    },
  ): Promise<PricedDeliveryLeg> {
    const resolved = await this.routing.drivingDistanceKm(pickup, dropoff, {
      fromStoredGeocodes: opts?.fromStoredGeocodes,
      profile: orsDirectionsProfile(opts?.categorySlug),
    });
    const leg = quoteDeliveryLeg({
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: dropoff.lat,
      toLng: dropoff.lng,
      distanceKm: resolved.distanceKm,
      city: opts?.city,
      categorySlug: opts?.categorySlug,
      getRegionRates: this.regionRates(opts?.city),
    });
    return { ...leg, distanceSource: resolved.source };
  }

  private async resolveAddressPoint(input: {
    parts?: AddressParts | null;
    stored?: { lat: number; lng: number } | null;
    hint?: LatLng | null;
    trustedStored?: boolean;
    /** When false, quotes never hit geocode (use DB coords or local middle-ground only elsewhere). */
    allowRemoteGeocode?: boolean;
  }): Promise<LatLng & { fromStored: boolean }> {
    if (input.stored && input.trustedStored) {
      return { ...input.stored, fromStored: true };
    }

    const parts = input.parts;
    const center = parts
      ? this.communityCenter(parts.community, parts.city)
      : undefined;
    const near = (point: LatLng) =>
      !center || coordsPlausibleForCommunity(point.lat, point.lng, center);

    if (input.stored && near(input.stored)) {
      return { ...input.stored, fromStored: true };
    }

    if (
      input.allowRemoteGeocode &&
      parts?.line1?.trim() &&
      parts.community?.trim()
    ) {
      const hit = await this.routing.geocodeAddress(
        parts,
        center ?? input.stored ?? undefined,
        QUOTE_GEOCODE_OPTS,
      );
      if (hit && hit.source !== 'community' && near(hit)) {
        return { lat: hit.lat, lng: hit.lng, fromStored: false };
      }
    }

    if (
      input.hint &&
      Number.isFinite(input.hint.lat) &&
      Number.isFinite(input.hint.lng) &&
      near(input.hint)
    ) {
      return { ...input.hint, fromStored: false };
    }

    if (input.stored) {
      return { ...input.stored, fromStored: true };
    }

    throw new BadRequestException(
      'We could not map that address. Check the street and area.',
    );
  }

  async resolveListingPickup(
    listing: ListingPickup,
  ): Promise<LatLng & { fromStored: boolean }> {
    const pa = listing.pickupAddress;
    const line1 = pa?.line1?.trim();
    const community = pa?.community?.trim() || listing.community?.trim() || '';
    const city = pa?.city ?? listing.city ?? 'Lagos';
    const stored = storedAddressCoords(pa);
    const parts: AddressParts | null =
      line1 && line1.length >= 4 && community
        ? {
            line1,
            line2: pa?.line2,
            community,
            city,
            country: pa?.country ?? 'NG',
          }
        : null;
    if (!parts && !stored) {
      throw new BadRequestException(
        'Seller pickup address is required for delivery.',
      );
    }
    return this.resolveAddressPoint({
      parts,
      stored,
      trustedStored: Boolean(stored),
      allowRemoteGeocode: !stored,
    });
  }

  async resolveDropoff(
    parts: AddressParts,
    hint?: LatLng | null,
    stored?: StoredAddressGeo | null,
  ): Promise<LatLng & { fromStored: boolean }> {
    const storedCoords = storedAddressCoords(stored);

    if (storedCoords && stored && deliveryUsesStoredRow(parts, stored)) {
      return { ...storedCoords, fromStored: true };
    }

    return this.resolveAddressPoint({
      parts,
      stored: null,
      hint: hint ?? null,
      trustedStored: false,
      allowRemoteGeocode: true,
    });
  }

  async resolveDropoffForUser(
    userId: string,
    parts: AddressParts,
    hint?: LatLng | null,
  ): Promise<LatLng & { fromStored: boolean }> {
    let stored: StoredAddressGeo | null = null;
    if (this.addresses) {
      const row = await this.addresses.getDefault(userId, ADDRESS_KIND.DELIVERY);
      if (row) stored = row;
    }
    return this.resolveDropoff(parts, hint, stored);
  }

  async quoteLegForListing(
    listing: ListingPickup,
    dropoff: LatLng,
    dropoffAddress?: AddressParts | null,
    buyerUserId?: string | null,
  ): Promise<PricedDeliveryLeg> {
    const pickup = await this.resolveListingPickup(listing);
    let drop: LatLng & { fromStored?: boolean } = {
      lat: dropoff.lat,
      lng: dropoff.lng,
      fromStored: Boolean((dropoff as { fromStored?: boolean }).fromStored),
    };
    if (
      dropoffAddress?.line1?.trim() &&
      dropoffAddress.community?.trim() &&
      !drop.fromStored
    ) {
      if (buyerUserId) {
        drop = await this.resolveDropoffForUser(
          buyerUserId,
          dropoffAddress,
          dropoff,
        );
      } else {
        drop = await this.resolveDropoff(dropoffAddress, dropoff);
      }
    }
    console.log(
      JSON.stringify({
        pickup: {
          address: formatLoggedAddress(listing.pickupAddress),
          longitude: pickup.lng,
          latitude: pickup.lat,
          fromStored: pickup.fromStored,
        },
        delivery: {
          address: formatLoggedAddress(dropoffAddress),
          longitude: drop.lng,
          latitude: drop.lat,
          fromStored: drop.fromStored ?? false,
        },
      }),
    );
    return this.quoteLegBetween(pickup, drop, {
      city: listing.city,
      categorySlug: listing.category?.slug,
      fromStoredGeocodes: Boolean(pickup.fromStored || drop.fromStored),
    });
  }

  quoteLegSync(input: QuoteDeliveryLegInput): DeliveryLegQuote {
    return quoteDeliveryLeg({
      ...input,
      getRegionRates:
        input.getRegionRates ?? this.regionRates(input.city),
    });
  }
}