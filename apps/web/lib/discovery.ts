import { formatNgn } from "@reworth/shared";
import { apiFetch } from "./api";
import type {
  CategoryNode,
  HomeResponse,
  MeFavouritesResponse,
  NlSearchResponse,
  PublicListing,
  RadiusKm,
  SavedSearch,
  SearchFilters,
  SearchResult,
} from "./types";

export function radiusOptionsForCity(
  cityLabel = "Lagos",
): Array<{ label: string; value: RadiusKm | "all" }> {
  return [
    { label: "2 km", value: 2 },
    { label: "5 km", value: 5 },
    { label: "10 km", value: 10 },
    { label: "25 km", value: 25 },
    { label: `All ${cityLabel}`, value: "all" },
  ];
}

/** @deprecated Prefer radiusOptionsForCity — kept for callers that ignore city. */
export const RADIUS_OPTIONS = radiusOptionsForCity("Lagos");

export const SORT_OPTIONS: Array<{
  label: string;
  value: NonNullable<SearchFilters["sort"]>;
}> = [
  { label: "Newest", value: "newest" },
  { label: "Price ↑", value: "price_asc" },
  { label: "Price ↓", value: "price_desc" },
  { label: "Distance", value: "distance" },
];

/** Heuristic: long / conversational queries → NL search. */
export function looksLikeNaturalLanguage(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return true;
  if (/[?]/.test(q)) return true;
  const nlHints =
    /\b(under|over|near|around|within|cheap|budget|looking for|i want|show me|find me|with delivery|verified)\b/i;
  return words.length >= 3 && nlHints.test(q);
}

export function listingPriceLabel(listing: PublicListing): string {
  if (listing.sellingMode === "GIVE_AWAY") return "Free";
  if (
    listing.sellingMode === "SWAP" ||
    listing.sellingMode === "SWAP_CASH"
  ) {
    return "Swap";
  }
  return formatNgn({ amountKobo: listing.priceKobo });
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined | null,
) {
  if (value === undefined || value === null || value === "") return;
  params.set(key, String(value));
}

export function buildSearchQueryString(filters: SearchFilters): string {
  const params = new URLSearchParams();
  appendParam(params, "q", filters.q);
  appendParam(params, "categoryId", filters.categoryId);
  appendParam(params, "subcategoryId", filters.subcategoryId);
  appendParam(params, "priceMinKobo", filters.priceMinKobo);
  appendParam(params, "priceMaxKobo", filters.priceMaxKobo);
  appendParam(params, "condition", filters.condition);
  appendParam(params, "community", filters.community);
  appendParam(params, "city", filters.city);
  appendParam(params, "radiusKm", filters.radiusKm);
  appendParam(params, "lat", filters.lat);
  appendParam(params, "lng", filters.lng);
  if (filters.verifiedOnly) params.set("verifiedOnly", "true");
  if (filters.deliveryAvailable) params.set("deliveryAvailable", "true");
  appendParam(params, "listedAfter", filters.listedAfter);
  appendParam(params, "sort", filters.sort);
  appendParam(params, "cursor", filters.cursor);
  appendParam(params, "limit", filters.limit);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function searchFiltersFromParams(
  params: URLSearchParams,
): SearchFilters {
  const num = (k: string) => {
    const v = params.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (k: string) => {
    const v = params.get(k);
    if (v == null) return undefined;
    return v === "true" || v === "1";
  };
  const radiusRaw = num("radiusKm");
  const radiusKm =
    radiusRaw === 2 ||
    radiusRaw === 5 ||
    radiusRaw === 10 ||
    radiusRaw === 25
      ? (radiusRaw as RadiusKm)
      : undefined;

  const sortRaw = params.get("sort");
  const sort =
    sortRaw === "newest" ||
    sortRaw === "price_asc" ||
    sortRaw === "price_desc" ||
    sortRaw === "distance"
      ? sortRaw
      : undefined;

  return {
    q: params.get("q") || undefined,
    categoryId: params.get("categoryId") || undefined,
    subcategoryId: params.get("subcategoryId") || undefined,
    priceMinKobo: num("priceMinKobo"),
    priceMaxKobo: num("priceMaxKobo"),
    condition: params.get("condition") || undefined,
    community: params.get("community") || undefined,
    city: params.get("city") || undefined,
    radiusKm,
    lat: num("lat"),
    lng: num("lng"),
    verifiedOnly: bool("verifiedOnly") || undefined,
    deliveryAvailable: bool("deliveryAvailable") || undefined,
    listedAfter: params.get("listedAfter") || undefined,
    sort,
  };
}

/** Strip empty values for URL sync / saved search payloads. */
export function compactFilters(filters: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  if (filters.q) out.q = filters.q;
  if (filters.categoryId) out.categoryId = filters.categoryId;
  if (filters.subcategoryId) out.subcategoryId = filters.subcategoryId;
  if (filters.priceMinKobo != null) out.priceMinKobo = filters.priceMinKobo;
  if (filters.priceMaxKobo != null) out.priceMaxKobo = filters.priceMaxKobo;
  if (filters.condition) out.condition = filters.condition;
  if (filters.community) out.community = filters.community;
  if (filters.radiusKm != null) out.radiusKm = filters.radiusKm;
  if (filters.lat != null) out.lat = filters.lat;
  if (filters.lng != null) out.lng = filters.lng;
  if (filters.verifiedOnly) out.verifiedOnly = true;
  if (filters.deliveryAvailable) out.deliveryAvailable = true;
  if (filters.listedAfter) out.listedAfter = filters.listedAfter;
  if (filters.sort) out.sort = filters.sort;
  return out;
}

export async function fetchCategories(): Promise<CategoryNode[]> {
  return apiFetch<CategoryNode[]>("/categories");
}

export async function fetchHome(
  params: {
    community?: string;
    city?: string;
    radiusKm?: RadiusKm;
    lat?: number;
    lng?: number;
  },
  token?: string | null,
): Promise<HomeResponse> {
  const qs = buildSearchQueryString({
    community: params.community,
    city: params.city,
    radiusKm: params.radiusKm,
    lat: params.lat,
    lng: params.lng,
  });
  return apiFetch<HomeResponse>(`/home${qs}`, { token });
}

export async function searchListings(
  filters: SearchFilters,
  token?: string | null,
): Promise<SearchResult> {
  const qs = buildSearchQueryString(filters);
  return apiFetch<SearchResult>(`/search${qs}`, { token });
}

export async function searchNl(
  body: { query: string; lat?: number; lng?: number },
  token?: string | null,
): Promise<NlSearchResponse> {
  return apiFetch<NlSearchResponse>("/search/nl", {
    method: "POST",
    token,
    body,
  });
}

export async function favouriteListing(
  id: string,
  token: string,
): Promise<{ ok: boolean; favouriteId: string }> {
  return apiFetch(`/listings/${id}/favourite`, {
    method: "POST",
    token,
  });
}

export async function unfavouriteListing(
  id: string,
  token: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/listings/${id}/favourite`, {
    method: "DELETE",
    token,
  });
}

export async function getMeFavourites(
  token: string,
): Promise<MeFavouritesResponse> {
  return apiFetch<MeFavouritesResponse>("/me/favourites", { token });
}

export async function followSeller(
  id: string,
  token: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/users/${id}/follow`, { method: "POST", token });
}

export async function unfollowSeller(
  id: string,
  token: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/users/${id}/follow`, { method: "DELETE", token });
}

export async function listSavedSearches(
  token: string,
): Promise<SavedSearch[]> {
  return apiFetch<SavedSearch[]>("/me/saved-searches", { token });
}

export async function createSavedSearch(
  token: string,
  name: string,
  filters: Record<string, unknown>,
): Promise<SavedSearch> {
  return apiFetch<SavedSearch>("/me/saved-searches", {
    method: "POST",
    token,
    body: { name, filters },
  });
}

export async function deleteSavedSearch(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/me/saved-searches/${id}`, {
    method: "DELETE",
    token,
  });
}

export type UpdateSavedSearchBody = {
  name?: string;
  filters?: Record<string, unknown>;
  paused?: boolean;
  digestEnabled?: boolean;
  newMatchesCount?: number;
};

export async function updateSavedSearch(
  token: string,
  id: string,
  body: UpdateSavedSearchBody,
): Promise<SavedSearch> {
  return apiFetch<SavedSearch>(`/me/saved-searches/${id}`, {
    method: "PATCH",
    token,
    body,
  });
}

const LOC_KEY = "rw_discovery_location";

export type DiscoveryLocation = {
  city: string;
  community: string;
  radiusKm: RadiusKm | "all";
};

export function loadDiscoveryLocation(): DiscoveryLocation {
  if (typeof window === "undefined") {
    return { city: "lagos", community: "", radiusKm: "all" };
  }
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return { city: "lagos", community: "", radiusKm: "all" };
    const parsed = JSON.parse(raw) as DiscoveryLocation;
    return {
      city: parsed.city || "lagos",
      community: parsed.community ?? "",
      radiusKm: parsed.radiusKm ?? "all",
    };
  } catch {
    return { city: "lagos", community: "", radiusKm: "all" };
  }
}

export function saveDiscoveryLocation(loc: DiscoveryLocation): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOC_KEY, JSON.stringify(loc));
}
