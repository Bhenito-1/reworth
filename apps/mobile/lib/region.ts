/**
 * Region config — config-driven cities (ADR-008).
 */

import { apiFetch } from "./api";

export type RegionCity = {
  city: string;
  displayName: string;
};

export type RegionArea = {
  key: string;
  label: string;
};

export type RegionDetail = {
  city: string;
  displayName: string;
  areas?: RegionArea[];
};

export async function listRegions(): Promise<RegionCity[]> {
  const res = await apiFetch<{ items: RegionCity[] }>("/regions");
  return res.items ?? [];
}

export async function getRegion(city: string): Promise<RegionDetail | null> {
  const res = await apiFetch<RegionDetail & { found?: boolean }>(
    `/regions/${encodeURIComponent(city)}`,
  );
  if (res.found === false) return null;
  return res;
}
