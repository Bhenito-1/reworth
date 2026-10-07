export const COMMUNITIES = [
  "Lekki Ph1",
  "Ikoyi",
  "VI",
  "Oniru",
  "VGC",
  "Chevron",
  "Ajah",
  "Other Lagos",
] as const;

export type Community = (typeof COMMUNITIES)[number];

export type MeResponse = {
  id: string;
  phone: string | null;
  email: string | null;
  profile: {
    displayName: string;
    preferredCommunity: string;
    bio?: string | null;
    avatarUrl?: string | null;
  } | null;
  verificationLevels: {
    L1_PHONE: boolean;
    L2_EMAIL: boolean;
    L3_IDENTITY: boolean;
  };
  identityVerifiedBadge: boolean;
};

export type PublicListingImage = {
  id: string;
  sortOrder: number;
  variants: Record<string, unknown>;
  width: number | null;
  height: number | null;
};

export type PublicListing = {
  id: string;
  title: string;
  description: string;
  category: { id: string; slug: string; name: string } | null;
  brand: string | null;
  model: string | null;
  condition: string;
  priceKobo: number;
  quantityAvailable?: number;
  quantityTotal?: number;
  negotiable: boolean;
  sellingMode: string;
  status: string;
  community: string;
  city?: string | null;
  communityId?: string | null;
  communityOnly?: boolean;
  communityChip?: {
    id: string;
    slug: string;
    name: string;
    privacy: string;
  } | null;
  movingSale?: {
    id: string;
    title: string;
    deadline: string;
    status: string;
  } | null;
  images: PublicListingImage[];
  seller: {
    id: string;
    displayName: string;
    verificationBadge: boolean;
    ratingLabel: string;
    trustBadge?: "Top Seller" | "Trusted" | null;
    responseMinutes?: number | null;
  };
  fulfilmentPickup: boolean;
  fulfilmentMeet: boolean;
  fulfilmentDelivery: boolean;
  buyerProtection: true;
  createdAt: string;
  publishedAt: string | null;
  vehicle?: Record<string, unknown> | null;
  inspectedBadge?:
    | boolean
    | {
        inspected: boolean;
        completedAt?: string | null;
        inspectionId?: string | null;
      }
    | null;
  inspectedAt?: string | null;
  authRequired?: boolean;
  authenticationStatus?: string | null;
  certificateId?: string | null;
  /** Phase 3.1 — Instant Buy eligible. */
  instantBuyEligible?: boolean;
  /** Phase 3.3 — seller promotions */
  boosted?: boolean;
  featured?: boolean;
  boostedUntil?: string | null;
  featuredUntil?: string | null;
  /** Owner publish path — moderation rejection reasons. */
  moderationReasons?: string[];
  rejectionReason?: string | null;
};

export type PriceIntelligence = {
  listingId?: string;
  currency?: string;
  estimatedLowKobo: number;
  estimatedHighKobo: number;
  recommendedKobo: number;
  estimatedLowNaira?: number;
  estimatedHighNaira?: number;
  recommendedNaira?: number;
  basis?: string;
  quickSaleKobo?: number;
  maxValueKobo?: number;
  confidenceLabel?: string;
  sampleCount?: number;
  city?: string;
};

export type SellingModeValue = "SELL" | "SWAP" | "GIVE_AWAY";

export function formatNgnFromKobo(kobo: number): string {
  const naira = kobo / 100;
  return `₦${Math.round(naira).toLocaleString("en-NG")}`;
}

export function listingImageUrl(
  image: PublicListingImage | undefined,
): string | null {
  if (!image?.variants) return null;
  const v = image.variants as {
    original?: string;
    w640?: { webp?: string };
    w1080?: { webp?: string };
  };
  return v.w1080?.webp ?? v.w640?.webp ?? v.original ?? null;
}
