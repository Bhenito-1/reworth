export type VerificationLevels = {
  L1_PHONE: boolean;
  L2_EMAIL: boolean;
  L3_IDENTITY: boolean;
};

export type MeProfile = {
  displayName: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  birthYear: number | null;
  preferredCommunity: string;
  language: string;
  currency: string;
  showFullName: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
};

export type MeResponse = {
  id: string;
  phone: string | null;
  email: string | null;
  status: string;
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
  profile: MeProfile | null;
  verificationLevels: VerificationLevels;
  identityVerifiedBadge: boolean;
  roles: string[];
  createdAt: string;
};

export type DeviceRow = {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
  createdAt: string;
};

/** Matches API PublicListingDto (dates as ISO strings over JSON). */
export type PublicListingImage = {
  id: string;
  sortOrder: number;
  variants: {
    original?: string;
    w640?: { webp?: string; avif?: string };
    w1080?: { webp?: string; avif?: string };
    w1600?: { webp?: string; avif?: string };
    [key: string]: unknown;
  };
  width: number | null;
  height: number | null;
};

export type PublicListingSeller = {
  id: string;
  displayName: string;
  verificationBadge: boolean;
  ratingLabel: string;
  trustBadge?: "Top Seller" | "Trusted" | null;
  responseMinutes?: number | null;
};

export type SellingModeValue = "SELL" | "SWAP" | "SWAP_CASH" | "GIVE_AWAY";

export type ItemConditionValue =
  | "NEW"
  | "LIKE_NEW"
  | "VERY_GOOD"
  | "GOOD"
  | "FAIR"
  | "FOR_PARTS";

export type PublicListingCommunityChip = {
  id: string;
  slug: string;
  name: string;
  privacy: string;
};

export type PublicListingMovingSale = {
  id: string;
  title: string;
  deadline: string;
  status: string;
};

/** Phase 2.4 — luxury authentication status on public listings. */
export type AuthenticationStatusValue =
  | "NOT_REQUIRED"
  | "REQUIRED"
  | "PENDING"
  | "PASSED"
  | "FAILED"
  | "OPTED_OUT"
  | string;

export type InspectedBadge = {
  inspected: boolean;
  completedAt?: string | null;
  inspectionId?: string | null;
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
  /** Units still available to order. Price is per unit. */
  quantityAvailable?: number;
  quantityTotal?: number;
  negotiable: boolean;
  sellingMode: SellingModeValue | string;
  status: string;
  community: string;
  /** City scope for matching / comps (default Lagos). */
  city?: string | null;
  communityId?: string | null;
  communityOnly?: boolean;
  communityChip?: PublicListingCommunityChip | null;
  movingSale?: PublicListingMovingSale | null;
  geoLat: number | null;
  geoLng: number | null;
  distanceKm?: number | null;
  images: PublicListingImage[];
  seller: PublicListingSeller;
  fulfilmentPickup: boolean;
  fulfilmentMeet: boolean;
  fulfilmentDelivery: boolean;
  buyerProtection: true;
  createdAt: string;
  publishedAt: string | null;
  vehicle?: Record<string, unknown> | null;
  /** Phase 2.4 — vehicle inspection public badge (object or boolean). */
  inspectedBadge?: InspectedBadge | boolean | null;
  inspectedAt?: string | null;
  inspectionId?: string | null;
  /** Phase 2.4 — luxury: require authentication before sale. */
  authRequired?: boolean;
  authenticationStatus?: AuthenticationStatusValue | null;
  certificateId?: string | null;
  authenticatedAt?: string | null;
  /** Phase 3.1 — Instant Buy (platform-fulfilled BIN). */
  instantBuyEligible?: boolean;
  /** Phase 3.2 — schedule circular hand-off after N unsold days. */
  donateIfUnsoldDays?: number | null;
  /** Phase 3.3 — monetization badges */
  boosted?: boolean;
  featured?: boolean;
  boostedUntil?: string | null;
  featuredUntil?: string | null;
  /** Owner publish path — moderation rejection reasons. */
  moderationReasons?: string[];
  /** Owner view of an admin rejection note. */
  rejectionReason?: string | null;
};

export type CategoryNode = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  iconUrl: string | null;
  children: Omit<CategoryNode, "children">[];
};

export type PresignMediaResponse = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
};

export type PriceIntelligence = {
  listingId: string;
  currency: string;
  estimatedLowKobo: number;
  estimatedHighKobo: number;
  recommendedKobo: number;
  estimatedLowNaira: number;
  estimatedHighNaira: number;
  recommendedNaira: number;
  /** sold_data | live_listings_fallback | rule_based_mock */
  basis: string;
  quickSaleKobo?: number;
  maxValueKobo?: number;
  quickSaleNaira?: number;
  maxValueNaira?: number;
  /** e.g. "Based on 24 similar sold items" */
  confidenceLabel?: string;
  sampleCount?: number;
  city?: string;
};

/** Phase 2.3 — Recommendations */

export type RecommendationSurface = "home" | "similar" | "post_checkout";

export type Recommendation = {
  listing: PublicListing;
  score?: number;
  reason?: string;
};

export type RecommendationsResponse = {
  items: PublicListing[];
  surface?: RecommendationSurface | string;
  experimentKey?: string;
  variant?: string;
  city?: string;
};

/** Phase 2.3 — Seller analytics (never includes buyer PII). */

export type SellerListingMetrics = {
  listingId: string;
  title: string;
  status: string;
  views: number;
  saves: number;
  offers: number;
  offerToSaleConversion: number;
  timeToSaleHours: number | null;
  priceCompetitiveness: number | null;
  askingKobo: number;
  marketMidKobo?: number | null;
  revenueKobo?: number;
  city?: string;
};

export type SellerAnalyticsAggregate = {
  views: number;
  saves: number;
  offers: number;
  offerToSaleConversion: number;
  medianTimeToSaleHours: number | null;
  responseMinutes?: number | null;
  revenue30dKobo: number;
  revenue90dKobo: number;
};

export type SellerAnalytics = {
  city?: string;
  aggregate: SellerAnalyticsAggregate;
  listings: SellerListingMetrics[];
  bestPerformers: SellerListingMetrics[];
  worstPerformers: SellerListingMetrics[];
};

export type AiListingDraft = {
  title: string;
  description: string;
  brand?: string;
  model?: string;
  suggestedCondition: string;
  suggestedCategory: string;
  suggestedPriceNaira: number;
  suggestedPriceLowNaira: number;
  suggestedPriceHighNaira: number;
  tags: string[];
};

export type AssistResponse = {
  draft: AiListingDraft;
  listing: PublicListing | Record<string, unknown>;
};

export type CreateListingBody = {
  title?: string;
  description?: string;
  categoryId?: string;
  subcategoryId?: string;
  brand?: string;
  model?: string;
  condition?: ItemConditionValue | string;
  ageText?: string;
  originalPriceKobo?: number;
  priceKobo?: number;
  /** Units for sale. Price is per unit. */
  quantity?: number;
  negotiable?: boolean;
  sellingMode?: SellingModeValue | string;
  community?: string;
  communityId?: string | null;
  communityOnly?: boolean;
  movingSaleId?: string | null;
  fulfilmentPickup?: boolean;
  fulfilmentMeet?: boolean;
  fulfilmentDelivery?: boolean;
  /** Phase 2.4 — vehicle attributes (VIN stripped server-side on public DTO). */
  vehicle?: Record<string, unknown> | null;
  /** Phase 2.4 — luxury authentication gate. */
  authRequired?: boolean;
  /** Phase 3.2 — city key from GET /regions (config-driven). */
  city?: string;
  /** Phase 3.2 — donate / circular hand-off after N unsold days (null = off). */
  donateIfUnsoldDays?: number | null;
};

export type UpdateListingBody = CreateListingBody;

/** Phase 3 — Discovery */

export type RadiusKm = 2 | 5 | 10 | 25;

export type SearchSort = "newest" | "price_asc" | "price_desc" | "distance";

export type SearchFilters = {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  priceMinKobo?: number;
  priceMaxKobo?: number;
  condition?: string;
  community?: string;
  city?: string;
  radiusKm?: RadiusKm;
  lat?: number;
  lng?: number;
  verifiedOnly?: boolean;
  deliveryAvailable?: boolean;
  listedAfter?: string;
  sort?: SearchSort;
  cursor?: string;
  limit?: number;
};

export type SearchFacets = {
  categories: Array<{ id: string; slug: string; name: string; count: number }>;
  conditions: Array<{ value: string; count: number }>;
  communities: Array<{ value: string; count: number }>;
};

export type SearchResult = {
  items: PublicListing[];
  nextCursor?: string;
  facets: SearchFacets;
  tookMs: number;
  total: number;
};

export type NlInterpreted = {
  chips: string[];
  filters: SearchFilters;
};

export type NlSearchResponse = {
  interpreted: NlInterpreted;
  results: SearchResult;
};

export type HomeMovingSaleRailItem = {
  id: string;
  title: string;
  itemCount: number;
  combinedPriceKobo: number;
  deadline: string;
  community: string;
  coverListingId?: string;
};

export type HomeRail = {
  id: string;
  title: string;
  items: PublicListing[];
  emptyMessage?: string;
  movingSales?: HomeMovingSaleRailItem[];
};

export type HomeResponse = {
  rails: HomeRail[];
  community?: string;
  radiusKm?: number;
};

export type FavouriteItem = {
  favouriteId: string;
  savedAt: string;
  listing: PublicListing;
};

export type FollowedSeller = {
  followId: string;
  followedAt: string;
  seller: {
    id: string;
    displayName: string;
    verificationBadge: boolean;
  };
};

export type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  newMatchesCount: number;
  lastCheckedAt: string | null;
  /** Pause alert evaluation without deleting. */
  paused?: boolean;
  /** Opt-in daily digest (9am WAT). */
  digestEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MeFavouritesResponse = {
  items: FavouriteItem[];
  sellers: FollowedSeller[];
  searches: SavedSearch[];
};

/* ─── Phase 3.1 — AI & Platform Services ─────────────────────────────── */

export type AssistantMessageRole =
  | "USER"
  | "ASSISTANT"
  | "SYSTEM"
  | "TOOL";

export type AssistantSession = {
  id: string;
  userId: string;
  city: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantToolSearchResult = {
  type: "search";
  listings: PublicListing[];
  query?: string;
};

export type AssistantToolBundleResult = {
  type: "bundle";
  brief: string;
  budgetKobo: number;
  totalKobo: number;
  listings: PublicListing[];
  shareToken?: string | null;
  /** Present when saving the bundle requires explicit confirm. */
  actionId?: string;
  confirmToken?: string;
};

export type AssistantToolValuationResult = {
  type: "valuation";
  result: ValuationCard;
  listingId?: string | null;
};

export type AssistantToolMutationPending = {
  type: "mutation_pending";
  actionId: string;
  confirmToken: string;
  toolName: string;
  summary: string;
};

export type AssistantToolResult =
  | AssistantToolSearchResult
  | AssistantToolBundleResult
  | AssistantToolValuationResult
  | AssistantToolMutationPending
  | { type: string; [key: string]: unknown };

export type AssistantMessage = {
  id: string;
  sessionId: string;
  role: AssistantMessageRole | string;
  content: string;
  toolName?: string | null;
  toolPayload?: AssistantToolResult | AssistantToolResult[] | Record<string, unknown> | null;
  createdAt: string;
};

export type AssistantSessionDetail = AssistantSession & {
  messages: AssistantMessage[];
};

export type AssistantSendMessageResponse = {
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  toolResults?: AssistantToolResult[];
};

export type AssistantConfirmResponse = {
  ok: boolean;
  actionId: string;
  result?: unknown;
  message?: string;
};

export type SavedBundle = {
  id: string;
  userId?: string;
  city: string;
  brief: string;
  budgetKobo: number;
  listingIds: string[];
  totalKobo: number;
  shareToken: string;
  createdAt: string;
  /** Full PublicListing or lightweight share preview rows from BundleService. */
  listings?: Array<
    | PublicListing
    | {
        id: string;
        title: string;
        priceKobo: number;
        city?: string;
        status?: string;
      }
  >;
};

export type RoomScanStatusValue =
  | "UPLOADED"
  | "DETECTING"
  | "READY"
  | "DRAFTS_CREATED"
  | "FAILED"
  | "CANCELLED"
  | string;

export type RoomScanItem = {
  id: string;
  roomScanId: string;
  label: string;
  brandHint?: string | null;
  categoryHint?: string | null;
  cropKey?: string | null;
  bbox?: unknown;
  selected: boolean;
  condition: string;
  sortOrder: number;
};

export type RoomScanDraft = {
  id: string;
  roomScanId: string;
  listingId: string;
  itemLabel: string;
  listing?: PublicListing | null;
};

export type RoomScan = {
  id: string;
  userId: string;
  city: string;
  status: RoomScanStatusValue;
  photoKeys: string[];
  detections?: unknown;
  draftBatchId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: RoomScanItem[];
  drafts?: RoomScanDraft[];
};

export type RoomScanDraftBatchAction =
  | "publish"
  | "edit"
  | "discard";

export type ValuationCard = {
  currency?: string;
  estimatedLowKobo: number;
  estimatedHighKobo: number;
  recommendedKobo: number;
  quickSaleKobo?: number;
  maxValueKobo?: number;
  confidenceLabel?: string;
  sampleCount?: number;
  city?: string;
  label?: string;
  categoryHint?: string | null;
  brandHint?: string | null;
  basis?: string;
};

export type ValuationResponse = {
  id?: string;
  source: string;
  city: string;
  photoKey?: string | null;
  listingId?: string | null;
  result: ValuationCard;
  createdAt?: string;
};

export type InstantBuyFulfilmentStatusValue =
  | "PENDING_PICKUP"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CONFIRMED"
  | "SLA_BREACHED"
  | "REFUNDED"
  | "CANCELLED"
  | string;

export type InstantBuyFulfilment = {
  id: string;
  orderId: string;
  listingId: string;
  status: InstantBuyFulfilmentStatusValue;
  slaDeadlineAt: string;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  confirmedAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConsignmentStatusValue =
  | "INTAKE"
  | "LISTED"
  | "SOLD"
  | "RETURNED"
  | "EXPIRED"
  | "CANCELLED"
  | string;

export type Consignment = {
  id: string;
  consignorId: string;
  listingId?: string | null;
  status: ConsignmentStatusValue;
  city: string;
  title: string;
  floorPriceKobo: number;
  askingPriceKobo: number;
  feeBps: number;
  soldPriceKobo?: number | null;
  feeKobo?: number | null;
  netPayoutKobo?: number | null;
  listedAt?: string | null;
  soldAt?: string | null;
  returnBy?: string | null;
  returnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  listing?: PublicListing | null;
};

export type ConsignmentEarnings = {
  currency: string;
  listedCount: number;
  soldCount: number;
  pendingPayoutKobo: number;
  paidOutKobo: number;
  totalFeesKobo: number;
  items: Consignment[];
};

export type ManagedPickupStatusValue =
  | "BOOKED"
  | "ASSIGNED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | string;

export type ManagedPickupSlot = {
  slotStartAt: string;
  slotEndAt: string;
  label?: string;
  available?: boolean;
};

export type ManagedPickup = {
  id: string;
  userId: string;
  city: string;
  status: ManagedPickupStatusValue;
  slotStartAt: string;
  slotEndAt: string;
  addressLine: string;
  photoAddon: boolean;
  photoKeys: string[];
  partnerRef?: string | null;
  roomScanId?: string | null;
  createdAt: string;
  updatedAt: string;
};
