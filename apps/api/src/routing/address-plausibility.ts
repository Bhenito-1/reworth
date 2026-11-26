import { haversineKm } from '../providers/search.provider';

/** Max km from region community centroid before we distrust stored/hint coords. */
/** Generic radius around a region's area centroid. Not tied to any city. */
export const MAX_KM_FROM_COMMUNITY = 8;

export function kmFromPoint(
  lat: number,
  lng: number,
  center?: { lat: number; lng: number } | null,
): number | null {
  if (!center || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return haversineKm(lat, lng, center.lat, center.lng);
}

export function coordsPlausibleForCommunity(
  lat: number,
  lng: number,
  center?: { lat: number; lng: number } | null,
  maxKm = MAX_KM_FROM_COMMUNITY,
): boolean {
  const d = kmFromPoint(lat, lng, center);
  if (d == null) return true;
  return d <= maxKm;
}