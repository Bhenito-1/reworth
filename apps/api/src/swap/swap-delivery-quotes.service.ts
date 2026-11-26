import { Injectable, Optional } from '@nestjs/common';
import { DeliveryPricingService } from '../delivery/delivery-pricing.service';
import { RoutingService } from '../routing/routing.service';
import {
  defaultDropoffOffset,
  pickupCoordsFromListing,
} from '../delivery/delivery-pricing';
import { PrismaService } from '../prisma/prisma.service';
import { RegionConfigService } from '../region/region-config.service';
import {
  quoteGiftDelivery,
  quoteSwapParty,
  SWAP_FEE_PER_USER_KOBO,
  type PartyQuote,
} from './swap-fees';

export type GiftDeliveryQuote = {
  distanceKm: number;
  deliveryFeeKobo: number;
  area: string;
  distanceSource?: 'ors' | 'estimated' | 'haversine';
};

@Injectable()
export class SwapDeliveryQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly pricing?: DeliveryPricingService,
    @Optional() private readonly regions?: RegionConfigService,
    @Optional() private readonly routing?: RoutingService,
  ) {}

  async quoteGiftForBuyer(
    listing: {
      id?: string;
      geoLat?: number | null;
      geoLng?: number | null;
      city?: string | null;
      community?: string | null;
      category?: { slug: string } | null;
    },
    buyerId: string,
  ): Promise<GiftDeliveryQuote> {
    const dropoff = await this.resolveBuyerDropoff(buyerId, listing);
    if (this.pricing) {
      const leg = await this.pricing.quoteLegForListing(listing, {
        lat: dropoff.lat,
        lng: dropoff.lng,
      });
      return {
        distanceKm: leg.distanceKm,
        deliveryFeeKobo: leg.deliveryFeeKobo,
        area: dropoff.label,
        distanceSource: leg.distanceSource,
      };
    }
    const legacy = quoteGiftDelivery(listing, {
      lat: dropoff.lat,
      lng: dropoff.lng,
    });
    return {
      ...legacy,
      area: dropoff.label,
      distanceSource: 'haversine',
    };
  }

  async quoteSwapLeg(
    from: {
      geoLat?: number | null;
      geoLng?: number | null;
      city?: string | null;
      category?: { slug: string } | null;
    },
    to: {
      geoLat?: number | null;
      geoLng?: number | null;
      city?: string | null;
      category?: { slug: string } | null;
    },
  ): Promise<
    PartyQuote & { distanceSource?: 'ors' | 'estimated' | 'haversine' }
  > {
    if (this.pricing) {
      const origin = pickupCoordsFromListing(from);
      const dest = pickupCoordsFromListing(to);
      const leg = await this.pricing.quoteLegBetween(
        { lat: origin.fromLat, lng: origin.fromLng },
        { lat: dest.fromLat, lng: dest.fromLng },
        {
          city: from.city,
          categorySlug: from.category?.slug,
        },
      );
      return {
        distanceKm: leg.distanceKm,
        deliveryFeeKobo: leg.deliveryFeeKobo,
        swapFeeKobo: SWAP_FEE_PER_USER_KOBO,
        totalKobo: leg.deliveryFeeKobo + SWAP_FEE_PER_USER_KOBO,
        distanceSource: leg.distanceSource,
      };
    }
    return { ...quoteSwapParty(from, to), distanceSource: 'haversine' };
  }

  private async resolveBuyerDropoff(
    userId: string,
    listing: {
      city?: string | null;
      community?: string | null;
      geoLat?: number | null;
      geoLng?: number | null;
    },
  ): Promise<{ lat: number; lng: number; label: string }> {
    const saved = await this.prisma.address.findFirst({
      where: {
        userId,
        kind: 'DELIVERY' as const,
        isDefault: true,
      },
    });
    if (saved?.geoLat != null && saved.geoLng != null) {
      return {
        lat: saved.geoLat,
        lng: saved.geoLng,
        label: [saved.community, saved.city].filter(Boolean).join(', '),
      };
    }
    if (saved && this.routing) {
      const hit = await this.routing.geocodeAddress(
        {
          line1: saved.line1,
          line2: saved.line2,
          community: saved.community,
          city: saved.city,
          country: saved.country ?? 'NG',
        },
        undefined,
        { useOrs: false },
      );
      if (hit) {
        return {
          lat: hit.lat,
          lng: hit.lng,
          label: [saved.community, saved.city].filter(Boolean).join(', '),
        };
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { preferredCommunity: true } } },
    });
    const area =
      user?.profile?.preferredCommunity?.trim() ||
      listing.community?.trim() ||
      '';
    const geo = area
      ? this.regions?.getCommunityGeo(listing.city || 'lagos', area)
      : null;
    if (geo) {
      return {
        lat: geo.geoLat,
        lng: geo.geoLng,
        label: geo.label || area,
      };
    }

    const origin = pickupCoordsFromListing(listing);
    const off = defaultDropoffOffset(origin.fromLat, origin.fromLng);
    return {
      lat: off.toLat,
      lng: off.toLng,
      label: area || 'your area',
    };
  }
}
