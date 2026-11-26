import { haversineKm } from '../providers/search.provider';
import type { LatLng } from './openrouteservice.client';

export type OrsGeocodeFeature = {
  label: string;
  lat: number;
  lng: number;
};

function communityTokens(community: string): string[] {
  return community
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function labelMatchesCommunity(label: string, community: string): boolean {
  const tokens = communityTokens(community);
  if (tokens.length === 0) return false;
  const labelLower = label.toLowerCase();
  return tokens.every((token) => labelLower.includes(token));
}

/**
 * Choose the Pelias hit nearest the focus point (usually the area centroid).
 * Prefer a label that includes the area name the user entered. No city lists.
 */
export function pickOrsGeocodeCandidate(
  features: OrsGeocodeFeature[],
  focus: LatLng,
  opts?: { community?: string | null; maxKmFromFocus?: number },
): OrsGeocodeFeature | null {
  const maxKm = opts?.maxKmFromFocus ?? 8;
  const community = opts?.community?.trim() ?? '';
  let best: { feature: OrsGeocodeFeature; score: number } | null = null;

  for (const feature of features) {
    const km = haversineKm(focus.lat, focus.lng, feature.lat, feature.lng);
    if (km > maxKm) continue;
    let score = maxKm - km;
    if (community && labelMatchesCommunity(feature.label, community)) {
      score += 4;
    }
    if (!best || score > best.score) {
      best = { feature, score };
    }
  }

  return best?.feature ?? null;
}
