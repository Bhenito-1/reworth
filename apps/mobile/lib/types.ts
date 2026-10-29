export const LAGOS_COMMUNITIES = [
  "Lekki Ph1",
  "Ikoyi",
  "VI",
  "Oniru",
  "VGC",
  "Chevron",
  "Ajah",
  "Other Lagos",
] as const;

export const ABUJA_COMMUNITIES = [
  "Maitama",
  "Asokoro",
  "Wuse",
  "Garki",
  "Jabi",
  "Guzape",
  "Other Abuja",
] as const;

export const IBADAN_COMMUNITIES = [
  "Bodija",
  "UI",
  "Ring Road",
  "Iwo Road",
  "Challenge",
  "Other Ibadan",
] as const;

export const PORT_HARCOURT_COMMUNITIES = [
  "GRA Port Harcourt",
  "Old GRA",
  "Rumuola",
  "Ada George",
  "Trans Amadi",
  "Other PH",
] as const;

export const OGUN_COMMUNITIES = [
  "Abeokuta",
  "Sango-Ota",
  "Ifo",
  "Sagamu",
  "Ijebu-Ode",
  "Other Ogun",
] as const;

export const OSUN_COMMUNITIES = [
  "Osogbo",
  "Ile-Ife",
  "Iwo",
  "Ede",
  "Ikire",
  "Other Osun",
] as const;

export const ONDO_COMMUNITIES = [
  "Akure",
  "Ondo Town",
  "Ore",
  "Owo",
  "Okitipupa",
  "Other Ondo",
] as const;

export const EKITI_COMMUNITIES = [
  "Ado-Ekiti",
  "Ikere-Ekiti",
  "Ikole",
  "Iye",
  "Omuo",
  "Other Ekiti",
] as const;

export const EDO_COMMUNITIES = [
  "Benin City",
  "GRA Benin",
  "Ugbowo",
  "Sakponba",
  "Auchi",
  "Other Edo",
] as const;

export const KANO_COMMUNITIES = [
  "Nassarawa",
  "Fagge",
  "Gwale",
  "Tarauni",
  "Dala",
  "Other Kano",
] as const;

export const COMMUNITIES = [
  ...LAGOS_COMMUNITIES,
  ...OGUN_COMMUNITIES,
  ...IBADAN_COMMUNITIES,
  ...OSUN_COMMUNITIES,
  ...ONDO_COMMUNITIES,
  ...EKITI_COMMUNITIES,
  ...EDO_COMMUNITIES,
  ...ABUJA_COMMUNITIES,
  ...PORT_HARCOURT_COMMUNITIES,
  ...KANO_COMMUNITIES,
] as const;

export type Community = (typeof COMMUNITIES)[number];

export type MeResponse = {
  id: string;
  phone: string | null;
  email: string | null;
  isDeliveryDriver?: boolean;
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
  donateIfUnsoldDays?: number | null;
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
