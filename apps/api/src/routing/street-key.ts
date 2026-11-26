/** Normalize street name for DB lookup (house number / unit stripped). */
export function normalizeStreetKey(line1: string): string {
  const withoutNumber = stripLeadingAddressTokens(line1);
  return withoutNumber
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Leading house / plot number when present (e.g. "11" from "11 Bariga Road"). */
export function parseHouseNumber(line1: string): number | null {
  const m = line1.trim().match(/^(\d{1,5})\s*[a-zA-Z]?(?:\s*[,/-]\s*|\s+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function stripLeadingAddressTokens(line1: string): string {
  return line1
    .trim()
    .replace(/^\d{1,5}\s*[a-zA-Z]?(?:\s*[,/-]\s*|\s+)/, '')
    .replace(/^(no|no\.|plot|plt|block|blk)\s*\d+\s*/i, '')
    .trim();
}

/** Pelias query focused on street + area (no house number). */
export function streetSearchQuery(parts: {
  line1: string;
  community?: string | null;
  city?: string | null;
  country?: string | null;
}): string {
  const city = parts.city?.trim() || 'Lagos';
  const community = parts.community?.trim();
  const street = stripLeadingAddressTokens(parts.line1);
  return [street, community, city, parts.country ?? 'Nigeria']
    .filter(Boolean)
    .join(', ');
}

export type NumberedStreetPoint = {
  houseNumber: number;
  lat: number;
  lng: number;
};

const METERS_PER_DEG_LAT = 111_320;

/** ~12 m per house number step — rough urban Lagos spacing. */
export function offsetMetersToLatLng(
  lat: number,
  lng: number,
  bearingDeg: number,
  meters: number,
): { lat: number; lng: number } {
  const br = (bearingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(br)) / METERS_PER_DEG_LAT;
  const dLng =
    (meters * Math.sin(br)) /
    (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

/** Bearing from point A to B in degrees (0 = north). */
export function bearingDeg(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Interpolate lat/lng from anchors on the same street using house numbers.
 * With one anchor, steps along bearing toward community centroid when provided.
 */
export function estimateFromStreetAnchors(
  targetHouse: number | null,
  anchors: NumberedStreetPoint[],
  communityCentroid?: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  if (anchors.length === 0) return null;

  const withNumbers = anchors.filter((a) =>
    Number.isFinite(a.houseNumber),
  );
  if (targetHouse != null && withNumbers.length >= 2) {
    const sorted = [...withNumbers].sort(
      (a, b) => a.houseNumber - b.houseNumber,
    );
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    if (targetHouse <= min.houseNumber) {
      const span = Math.max(1, max.houseNumber - min.houseNumber);
      const t = (targetHouse - min.houseNumber) / span;
      return {
        lat: min.lat + t * (max.lat - min.lat),
        lng: min.lng + t * (max.lng - min.lng),
      };
    }
    if (targetHouse >= max.houseNumber) {
      const span = Math.max(1, max.houseNumber - min.houseNumber);
      const t = (targetHouse - min.houseNumber) / span;
      return {
        lat: min.lat + t * (max.lat - min.lat),
        lng: min.lng + t * (max.lng - min.lng),
      };
    }
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (targetHouse >= a.houseNumber && targetHouse <= b.houseNumber) {
        const span = Math.max(1, b.houseNumber - a.houseNumber);
        const t = (targetHouse - a.houseNumber) / span;
        return {
          lat: a.lat + t * (b.lat - a.lat),
          lng: a.lng + t * (b.lng - a.lng),
        };
      }
    }
  }

  if (targetHouse != null && withNumbers.length === 1) {
    const anchor = withNumbers[0];
    const deltaNums = targetHouse - anchor.houseNumber;
    const meters = deltaNums * 12;
    let br = 90;
    if (communityCentroid) {
      br = bearingDeg(
        communityCentroid.lat,
        communityCentroid.lng,
        anchor.lat,
        anchor.lng,
      );
    }
    return offsetMetersToLatLng(anchor.lat, anchor.lng, br, meters);
  }

  const lat =
    anchors.reduce((s, a) => s + a.lat, 0) / anchors.length;
  const lng =
    anchors.reduce((s, a) => s + a.lng, 0) / anchors.length;
  return { lat, lng };
}