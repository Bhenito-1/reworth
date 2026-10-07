import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";
import type { PublicListing } from "./types";

export type RadiusKm = 2 | 5 | 10 | 25;

export type SearchFilters = {
  q?: string;
  categoryId?: string;
  condition?: string;
  community?: string;
  radiusKm?: RadiusKm;
  priceMinKobo?: number;
  priceMaxKobo?: number;
  verifiedOnly?: boolean;
  deliveryAvailable?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "distance";
  cursor?: string;
  limit?: number;
};

export type HomeRail = {
  id: string;
  title: string;
  items: PublicListing[];
  emptyMessage?: string;
  movingSales?: Array<{
    id: string;
    title: string;
    itemCount: number;
    combinedPriceKobo: number;
    deadline: string;
    community: string;
    coverListingId?: string;
  }>;
};

export type HomeResponse = {
  rails: HomeRail[];
  community?: string;
  radiusKm?: number;
};

export type SearchResult = {
  items: PublicListing[];
  nextCursor?: string;
  tookMs: number;
  total: number;
};

export type FavouriteItem = {
  favouriteId: string;
  savedAt: string;
  listing: PublicListing;
};

export type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  newMatchesCount: number;
  lastCheckedAt?: string | null;
  paused?: boolean;
  digestEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MeFavouritesResponse = {
  items: FavouriteItem[];
  sellers: Array<{
    followId: string;
    seller: { id: string; displayName: string; verificationBadge: boolean };
  }>;
  searches: SavedSearch[];
};

const HOME_CACHE_KEY = "rw_home_cache_v1";

function qs(filters: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function fetchHome(
  params: {
    community?: string;
    radiusKm?: RadiusKm;
  },
  token?: string | null,
): Promise<HomeResponse> {
  return apiFetch<HomeResponse>(
    `/home${qs({
      community: params.community,
      radiusKm: params.radiusKm,
    })}`,
    { token },
  );
}

export async function cacheHome(data: HomeResponse): Promise<void> {
  try {
    await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export async function loadCachedHome(): Promise<HomeResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HomeResponse;
  } catch {
    return null;
  }
}

export async function searchListings(
  filters: SearchFilters,
  token?: string | null,
): Promise<SearchResult> {
  return apiFetch<SearchResult>(
    `/search${qs({
      q: filters.q,
      categoryId: filters.categoryId,
      condition: filters.condition,
      community: filters.community,
      radiusKm: filters.radiusKm,
      priceMinKobo: filters.priceMinKobo,
      priceMaxKobo: filters.priceMaxKobo,
      verifiedOnly: filters.verifiedOnly,
      deliveryAvailable: filters.deliveryAvailable,
      sort: filters.sort,
      cursor: filters.cursor,
      limit: filters.limit ?? 24,
    })}`,
    { token },
  );
}

export async function favouriteListing(
  id: string,
  token: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/listings/${id}/favourite`, { method: "POST", token });
}

export async function unfavouriteListing(
  id: string,
  token: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/listings/${id}/favourite`, { method: "DELETE", token });
}

export async function getMeFavourites(
  token: string,
): Promise<MeFavouritesResponse> {
  return apiFetch<MeFavouritesResponse>("/me/favourites", { token });
}

export function compactSearchFilters(filters: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  if (filters.q) out.q = filters.q;
  if (filters.categoryId) out.categoryId = filters.categoryId;
  if (filters.condition) out.condition = filters.condition;
  if (filters.community) out.community = filters.community;
  if (filters.radiusKm != null) out.radiusKm = filters.radiusKm;
  if (filters.priceMinKobo != null) out.priceMinKobo = filters.priceMinKobo;
  if (filters.priceMaxKobo != null) out.priceMaxKobo = filters.priceMaxKobo;
  if (filters.verifiedOnly) out.verifiedOnly = true;
  if (filters.deliveryAvailable) out.deliveryAvailable = true;
  if (filters.sort) out.sort = filters.sort;
  return out;
}

export function summarizeSavedFilters(
  filters: Record<string, unknown>,
): string {
  const parts: string[] = [];
  if (typeof filters.q === "string" && filters.q) parts.push(`“${filters.q}”`);
  if (typeof filters.community === "string" && filters.community)
    parts.push(filters.community);
  if (filters.radiusKm != null) parts.push(`${filters.radiusKm} km`);
  if (typeof filters.condition === "string" && filters.condition)
    parts.push(String(filters.condition).replace(/_/g, " "));
  if (filters.priceMinKobo != null || filters.priceMaxKobo != null) {
    const min =
      typeof filters.priceMinKobo === "number"
        ? `₦${Math.round(filters.priceMinKobo / 100).toLocaleString("en-NG")}`
        : null;
    const max =
      typeof filters.priceMaxKobo === "number"
        ? `₦${Math.round(filters.priceMaxKobo / 100).toLocaleString("en-NG")}`
        : null;
    if (min && max) parts.push(`${min}–${max}`);
    else if (min) parts.push(`from ${min}`);
    else if (max) parts.push(`up to ${max}`);
  }
  if (filters.verifiedOnly) parts.push("Verified");
  return parts.join(" · ") || "Custom filters";
}

export function filtersFromSaved(
  filters: Record<string, unknown>,
): SearchFilters {
  const sort =
    filters.sort === "price_asc" ||
    filters.sort === "price_desc" ||
    filters.sort === "newest" ||
    filters.sort === "distance"
      ? filters.sort
      : undefined;
  return compactSearchFilters({
    q: typeof filters.q === "string" ? filters.q : undefined,
    categoryId:
      typeof filters.categoryId === "string" ? filters.categoryId : undefined,
    condition:
      typeof filters.condition === "string" ? filters.condition : undefined,
    community:
      typeof filters.community === "string" ? filters.community : undefined,
    radiusKm:
      filters.radiusKm === 2 ||
      filters.radiusKm === 5 ||
      filters.radiusKm === 10 ||
      filters.radiusKm === 25
        ? filters.radiusKm
        : undefined,
    priceMinKobo:
      typeof filters.priceMinKobo === "number"
        ? filters.priceMinKobo
        : undefined,
    priceMaxKobo:
      typeof filters.priceMaxKobo === "number"
        ? filters.priceMaxKobo
        : undefined,
    verifiedOnly: Boolean(filters.verifiedOnly) || undefined,
    deliveryAvailable: Boolean(filters.deliveryAvailable) || undefined,
    sort,
  });
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

export async function updateSavedSearch(
  token: string,
  id: string,
  body: {
    name?: string;
    filters?: Record<string, unknown>;
    paused?: boolean;
    digestEnabled?: boolean;
    newMatchesCount?: number;
  },
): Promise<SavedSearch> {
  return apiFetch<SavedSearch>(`/me/saved-searches/${id}`, {
    method: "PATCH",
    token,
    body,
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
