/**
 * Phase 3.2 — Config-driven cities (GET /regions).
 */

import { apiFetch } from "./api";

export type RegionCity = {
  key: string;
  displayName: string;
  timezone?: string;
  communities?: string[];
  enabled?: boolean;
  pspEnabled?: boolean;
};

export type RegionArea = {
  key: string;
  label: string;
};

export type RegionDetail = RegionCity & {
  areas?: RegionArea[];
  logistics?: {
    baseFeeKobo?: number;
    perKmKobo?: number;
  };
  priceBands?: unknown;
  geocoding?: Record<string, { lat: number; lng: number }>;
};

type RegionRow = RegionCity & { city?: string };

/** API list payload uses `city`; the web select uses `key`. */
function normalizeCity(row: RegionRow): RegionCity | null {
  const key = (row.key || row.city || "").trim();
  if (!key) return null;
  return { ...row, key, displayName: row.displayName || key };
}

function asCities(
  res: RegionRow[] | { items?: RegionRow[]; cities?: RegionRow[] } | null,
): RegionCity[] {
  const rows = !res
    ? []
    : Array.isArray(res)
      ? res
      : Array.isArray(res.items)
        ? res.items
        : Array.isArray(res.cities)
          ? res.cities
          : [];
  return rows
    .map((row) => normalizeCity(row))
    .filter((row): row is RegionCity => row !== null);
}

/** List enabled cities. Returns [] if endpoint missing (404). */
export async function listRegions(): Promise<RegionCity[]> {
  try {
    const res = await apiFetch<
      RegionCity[] | { items?: RegionCity[]; cities?: RegionCity[] }
    >("/regions");
    return asCities(res);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return [];
    throw err;
  }
}

export async function getRegion(key: string): Promise<RegionDetail | null> {
  try {
    return await apiFetch<RegionDetail>(
      `/regions/${encodeURIComponent(key)}`,
    );
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null;
    throw err;
  }
}

export function regionLabel(city: RegionCity): string {
  return city.displayName || city.key;
}
