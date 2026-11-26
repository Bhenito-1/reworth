import type { AddressParts } from '../routing/routing.service';

function normToken(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Street line match ignoring punctuation and spacing. */
export function normAddressLine(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[,.'"#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s: string): string {
  return normToken(s).replace(/\s+/g, '_');
}

/** Whether checkout/cart delivery lines match a row in `addresses`. */
export function deliveryCommunityMatch(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return norm(a) === norm(b);
}

/** Same street when normalized equal or one line is a prefix of the other (e.g. comma / unit). */
export function deliveryLineCompatible(
  checkoutLine: string,
  storedLine: string,
): boolean {
  const a = normAddressLine(checkoutLine);
  const b = normAddressLine(storedLine);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

/** Checkout lines refer to a saved delivery row — use stored geo, no geocode API. */
export function deliveryUsesStoredRow(
  parts: AddressParts,
  stored: {
    line1: string;
    community: string;
    city?: string;
  },
): boolean {
  if (deliveryPartsMatchStored(parts, stored)) return true;
  return (
    deliveryCommunityMatch(parts.community, stored.community) &&
    deliveryLineCompatible(parts.line1, stored.line1)
  );
}

export function deliveryPartsMatchStored(
  parts: AddressParts,
  stored: {
    line1: string;
    community: string;
    city?: string;
  },
): boolean {
  if (!deliveryLineCompatible(parts.line1, stored.line1)) {
    return false;
  }
  if (!deliveryCommunityMatch(parts.community, stored.community)) return false;
  const partCity = norm(parts.city ?? 'lagos');
  const storedCity = norm(stored.city ?? 'lagos');
  return partCity === storedCity;
}

export type StoredAddressGeo = {
  geoLat: number | null;
  geoLng: number | null;
  line1: string;
  community: string;
  city: string;
  geocodeSource?: string | null;
};

const TRUSTED_DELIVERY_GEO_SOURCES = new Set([
  'ors',
  'street_cache',
  'street_estimate',
]);

export function isTrustedStoredGeocode(source?: string | null): boolean {
  const s = source?.trim().toLowerCase() ?? '';
  return TRUSTED_DELIVERY_GEO_SOURCES.has(s);
}

export function storedAddressCoords(
  row:
    | StoredAddressGeo
    | { geoLat?: number | null; geoLng?: number | null }
    | null
    | undefined,
): { lat: number; lng: number } | null {
  if (row?.geoLat == null || row?.geoLng == null) return null;
  if (!Number.isFinite(row.geoLat) || !Number.isFinite(row.geoLng)) {
    return null;
  }
  return { lat: row.geoLat, lng: row.geoLng };
}