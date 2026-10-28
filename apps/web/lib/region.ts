/**
 * Phase 3.2 — Config-driven cities (GET /regions).
 * Consumer list defaults to pilot (SW + Abuja + PH).
 */

import { apiFetch } from "./api";

export type RegionCity = {
  key: string;
  city?: string;
  displayName: string;
  timezone?: string;
  communities?: string[];
  enabled?: boolean;
  status?: string;
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

function normalizeCity(raw: unknown): RegionCity | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const city =
    typeof o.city === "string"
      ? o.city
      : typeof o.key === "string"
        ? o.key
        : "";
  if (!city) return null;
  return {
    key: typeof o.key === "string" ? o.key : city,
    city,
    displayName:
      typeof o.displayName === "string" ? o.displayName : city,
    status: typeof o.status === "string" ? o.status : undefined,
    communities: Array.isArray(o.communities)
      ? (o.communities as string[])
      : undefined,
  };
}

function asCities(
  res: RegionCity[] | { items?: unknown[]; cities?: unknown[] } | null,
): RegionCity[] {
  if (!res) return [];
  if (Array.isArray(res)) {
    return res.map(normalizeCity).filter(Boolean) as RegionCity[];
  }
  const list = res.items ?? res.cities ?? [];
  return list.map(normalizeCity).filter(Boolean) as RegionCity[];
}

/** List pilot cities (SW + Abuja + PH). Pass all=true for ops. */
export async function listRegions(opts?: {
  all?: boolean;
}): Promise<RegionCity[]> {
  try {
    const qs = opts?.all ? "?all=1" : "";
    const res = await apiFetch<
      RegionCity[] | { items?: unknown[]; cities?: unknown[] }
    >(`/regions${qs}`);
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
