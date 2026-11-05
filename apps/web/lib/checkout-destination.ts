import type { RegionDetail } from "./region";

const LAGOS = { lat: 6.5244, lng: 3.3792 };

function hashOffset(text: string): { dLat: number; dLng: number } {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  const scale = 0.012;
  return {
    dLat: ((h & 0xff) / 255 - 0.5) * scale,
    dLng: (((h >> 8) & 0xff) / 255 - 0.5) * scale,
  };
}

/** Approximate buyer delivery coordinates from area + street (for fee quotes). */
export function buyerDeliveryCoords(
  addressLine: string,
  addressArea: string,
  region?: RegionDetail | null,
): { toLat: number; toLng: number } {
  const areaKey = addressArea.trim();
  const geo = region?.geocoding ?? {};
  let base = LAGOS;
  if (areaKey && geo[areaKey]) {
    base = { lat: geo[areaKey].lat, lng: geo[areaKey].lng };
  } else if (areaKey) {
    const normalized = areaKey.toLowerCase();
    const hit = Object.entries(geo).find(([key]) => {
      const k = key.toLowerCase().replace(/_/g, " ");
      return normalized.includes(k) || k.includes(normalized);
    });
    if (hit) {
      base = { lat: hit[1].lat, lng: hit[1].lng };
    }
  }
  const { dLat, dLng } = hashOffset(`${addressLine.trim()}|${areaKey}`);
  return { toLat: base.lat + dLat, toLng: base.lng + dLng };
}
