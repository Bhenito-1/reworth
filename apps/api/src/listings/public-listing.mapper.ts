/**
 * Public listing DTO — privacy-critical.
 * NEVER include addressPrivate, address, line1, seller phone/email, or vehicle.vin.
 */

import { publicTrustBadge } from '../reviews/trust-score.compute';
import {
  authenticationBadgeFromListing,
  inspectedBadgeFromLatest,
} from '../verticals/inspected-badge';

export type PublicListingImage = {
  id: string;
  sortOrder: number;
  variants: Record<string, unknown>;
  width: number | null;
  height: number | null;
};

export type PublicListingSeller = {
  id: string;
  displayName: string;
  verificationBadge: boolean;
  ratingLabel: string;
  trustBadge?: 'Top Seller' | 'Trusted' | null;
  responseMinutes?: number | null;
};

export type PublicListingCommunityChip = {
  id: string;
  slug: string;
  name: string;
  privacy: string;
};

export type PublicListingMovingSale = {
  id: string;
  title: string;
  deadline: Date;
  status: string;
};

export type PublicListingDto = {
  id: string;
  title: string;
  description: string;
  category: { id: string; slug: string; name: string } | null;
  brand: string | null;
  model: string | null;
  condition: string;
  priceKobo: number;
  negotiable: boolean;
  sellingMode: string;
  status: string;
  community: string;
  communityId?: string | null;
  communityOnly?: boolean;
  communityChip?: PublicListingCommunityChip | null;
  movingSale?: PublicListingMovingSale | null;
  city: string;
  geoLat: number | null;
  geoLng: number | null;
  distanceKm?: number | null;
  images: PublicListingImage[];
  seller: PublicListingSeller;
  fulfilmentPickup: boolean;
  fulfilmentMeet: boolean;
  fulfilmentDelivery: boolean;
  buyerProtection: true;
  createdAt: Date;
  publishedAt: Date | null;
  vehicle?: Record<string, unknown> | null;
  inspectedBadge?: 'Inspected ✓' | `Inspected ${string}` | null;
  authenticationBadge?: string | null;
  authRequired?: boolean;
  authenticationStatus?: string | null;
  proSellerBadge?: string | null;
  instantBuyEligible?: boolean;
  instantBuyBadge?: 'Instant Buy' | null;
  boosted?: boolean;
  featured?: boolean;
  boostedUntil?: Date | null;
  featuredUntil?: Date | null;
  /** Units still available to buy. Price is per unit. */
  quantityAvailable?: number;
  quantityTotal?: number;
  /** Present for seller after moderation REJECTED (owner publish path). */
  moderationReasons?: string[];
  riskFlags?: string[];
};
type ListingWithRelations = {
  id: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  condition: string;
  priceKobo: number;
  negotiable: boolean;
  sellingMode: string;
  status: string;
  community: string;
  communityId?: string | null;
  communityOnly?: boolean;
  city?: string | null;
  geoLat: number | null;
  geoLng: number | null;
  fulfilmentPickup: boolean;
  fulfilmentMeet: boolean;
  fulfilmentDelivery: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  vehicle: unknown;
  addressPrivate?: string | null;
  authRequired?: boolean;
  authenticationStatus?: string | null;
  instantBuyEligible?: boolean;
  quantityAvailable?: number;
  quantityTotal?: number;
  category?: { id: string; slug: string; name: string } | null;
  estateCommunity?: {
    id: string;
    slug: string;
    name: string;
    privacy: string;
  } | null;
  movingSale?: {
    id: string;
    title: string;
    deadline: Date;
    status: string;
  } | null;
  vehicleInspections?: Array<{
    status: string;
    completedAt: Date | null;
    expiresAt: Date | null;
  }>;
  images?: Array<{
    id: string;
    sortOrder: number;
    variants: unknown;
    width: number | null;
    height: number | null;
    status?: string;
  }>;
  seller?: {
    id: string;
    phone?: string | null;
    email?: string | null;
    profile?: { displayName: string; handle?: string | null } | null;
    verifications?: Array<{ level: string; status: string }>;
    trustScore?: {
      avgRating: number | null;
      tier: string | null;
      medianResponseMinutes: number | null;
    } | null;
    proAccount?: { status: string } | null;
    _count?: {
      reviewsReceived?: number;
    };
  };
};

function stripVehicleVin(vehicle: unknown): Record<string, unknown> | null {
  if (!vehicle || typeof vehicle !== 'object') return null;
  const copy = { ...(vehicle as Record<string, unknown>) };
  delete copy.vin;
  delete copy.VIN;
  delete copy.Vin;
  return copy;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ratingLabelFromTrust(
  avgRating: number | null | undefined,
  reviewCount: number,
): string {
  if (avgRating != null && reviewCount > 0) {
    return `★ ${avgRating.toFixed(1)} (${reviewCount})`;
  }
  return 'New';
}

export function toPublicListing(
  listing: ListingWithRelations,
  opts?: {
    viewerLat?: number;
    viewerLng?: number;
    boosted?: boolean;
    featured?: boolean;
    boostedUntil?: Date | null;
    featuredUntil?: Date | null;
  },
): PublicListingDto {
  const seller = listing.seller;
  const verified = Boolean(
    seller?.verifications?.some(
      (v) => v.level === 'L3_IDENTITY' && v.status === 'VERIFIED',
    ),
  );

  let distanceKm: number | null | undefined;
  if (
    opts?.viewerLat != null &&
    opts?.viewerLng != null &&
    listing.geoLat != null &&
    listing.geoLng != null
  ) {
    distanceKm = Math.round(
      haversineKm(opts.viewerLat, opts.viewerLng, listing.geoLat, listing.geoLng) *
        10,
    ) / 10;
  }

  const images = (listing.images ?? [])
    .filter((img) => !img.status || img.status === 'READY')
    .map((img) => ({
      id: img.id,
      sortOrder: img.sortOrder,
      variants: (img.variants as Record<string, unknown>) ?? {},
      width: img.width,
      height: img.height,
    }));

  const reviewCount = seller?._count?.reviewsReceived ?? 0;
  const avgRating = seller?.trustScore?.avgRating ?? null;
  const trustBadge = publicTrustBadge(seller?.trustScore?.tier ?? null);
  const responseMinutes =
    seller?.trustScore?.medianResponseMinutes != null
      ? Math.round(seller.trustScore.medianResponseMinutes)
      : null;

  const dto: PublicListingDto = {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    category: listing.category
      ? {
          id: listing.category.id,
          slug: listing.category.slug,
          name: listing.category.name,
        }
      : null,
    brand: listing.brand,
    model: listing.model,
    condition: listing.condition,
    priceKobo: listing.priceKobo,
    negotiable: listing.negotiable,
    sellingMode: listing.sellingMode,
    status: listing.status,
    community: listing.community,
    communityId: listing.communityId ?? null,
    communityOnly: listing.communityOnly ?? false,
    communityChip: listing.estateCommunity
      ? {
          id: listing.estateCommunity.id,
          slug: listing.estateCommunity.slug,
          name: listing.estateCommunity.name,
          privacy: listing.estateCommunity.privacy,
        }
      : null,
    movingSale: listing.movingSale
      ? {
          id: listing.movingSale.id,
          title: listing.movingSale.title,
          deadline: listing.movingSale.deadline,
          status: listing.movingSale.status,
        }
      : null,
    city: listing.city?.trim() || 'Lagos',
    geoLat: listing.geoLat,
    geoLng: listing.geoLng,
    distanceKm,
    images,
    seller: {
      id: seller?.id ?? '',
      displayName: seller?.profile?.displayName ?? 'Seller',
      verificationBadge: verified,
      ratingLabel: ratingLabelFromTrust(avgRating, reviewCount),
      trustBadge,
      responseMinutes,
    },
    fulfilmentPickup: listing.fulfilmentPickup,
    fulfilmentMeet: listing.fulfilmentMeet,
    fulfilmentDelivery: listing.fulfilmentDelivery,
    buyerProtection: true,
    createdAt: listing.createdAt,
    publishedAt: listing.publishedAt,
    vehicle: stripVehicleVin(listing.vehicle),
    inspectedBadge: inspectedBadgeFromLatest(
      listing.vehicleInspections?.[0] ?? null,
    ),
    authenticationBadge: authenticationBadgeFromListing({
      authRequired: listing.authRequired,
      authenticationStatus: listing.authenticationStatus,
    }),
    authRequired: listing.authRequired ?? false,
    authenticationStatus: listing.authenticationStatus ?? 'NOT_REQUIRED',
    proSellerBadge:
      listing.seller?.proAccount &&
      ['ACTIVE', 'GRACE'].includes(listing.seller.proAccount.status)
        ? 'Pro Seller'
        : null,
    instantBuyEligible: listing.instantBuyEligible ?? false,
    instantBuyBadge: listing.instantBuyEligible ? 'Instant Buy' : null,
    quantityAvailable: listing.quantityAvailable ?? 1,
    quantityTotal: listing.quantityTotal ?? 1,
    boosted: opts?.boosted ?? false,
    featured: opts?.featured ?? false,
    boostedUntil: opts?.boostedUntil ?? null,
    featuredUntil: opts?.featuredUntil ?? null,
  };

  // Hard privacy guarantee — strip any accidental private keys
  const forbidden = [
    'addressPrivate',
    'address',
    'line1',
    'line2',
    'phone',
    'email',
    'passwordHash',
    'score',
  ];
  for (const key of forbidden) {
    delete (dto as Record<string, unknown>)[key];
  }
  if (dto.seller) {
    delete (dto.seller as Record<string, unknown>).phone;
    delete (dto.seller as Record<string, unknown>).email;
    delete (dto.seller as Record<string, unknown>).score;
  }

  return dto;
}
