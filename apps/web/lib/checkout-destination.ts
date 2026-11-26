import type { RegionDetail } from "./region";
import {
  formatDeliveryAddressLine,
  geocodeStreetAddress,
  type DeliveryAddress,
} from "./delivery-address";

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
  const configKey = areaKey.toUpperCase().replace(/\s+/g, "_");
  if (areaKey && geo[areaKey]) {
    base = { lat: geo[areaKey].lat, lng: geo[areaKey].lng };
  } else if (configKey && geo[configKey]) {
    base = { lat: geo[configKey].lat, lng: geo[configKey].lng };
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

export type DropoffResolution = {
  toLat: number;
  toLng: number;
  deliveryAddress: string;
  source: "saved" | "ors" | "estimate";
};

async function resolveDropoffCoords(
  token: string,
  input: {
    line1: string;
    community: string;
    city?: string;
    region?: RegionDetail | null;
    focusHint?: { lat: number; lng: number } | null;
  },
): Promise<Pick<DropoffResolution, "toLat" | "toLng" | "source">> {
  const centroid = buyerDeliveryCoords(
    input.line1,
    input.community,
    input.region,
  );
  const focusLat = input.focusHint?.lat ?? centroid.toLat;
  const focusLng = input.focusHint?.lng ?? centroid.toLng;
  const hit = await geocodeStreetAddress(token, {
    line1: input.line1.trim(),
    community: input.community.trim(),
    city: input.city,
    focusLat,
    focusLng,
  });
  return { toLat: hit.lat, toLng: hit.lng, source: "ors" };
}

/** Saved address, ORS geocode, or area-centroid estimate (offline / quota fallback). */
export async function resolveCheckoutDropoff(
  token: string,
  input: {
    mode: "saved" | "new";
    saved?: DeliveryAddress | null;
    addressLine: string;
    addressArea: string;
    city?: string;
    region?: RegionDetail | null;
  },
): Promise<DropoffResolution> {
  const line1 =
    input.mode === "saved" && input.saved?.line1
      ? input.saved.line1
      : input.addressLine.trim();
  const community =
    input.mode === "saved" && input.saved?.community
      ? input.saved.community
      : input.addressArea.trim();
  const city =
    input.mode === "saved" && input.saved?.city
      ? input.saved.city
      : input.city;
  const deliveryAddress =
    input.mode === "saved" && input.saved
      ? formatDeliveryAddressLine(input.saved)
      : [line1, community].filter(Boolean).join(", ");

  if (
    input.mode === "saved" &&
    input.saved?.geoLat != null &&
    input.saved?.geoLng != null
  ) {
    return {
      toLat: input.saved.geoLat,
      toLng: input.saved.geoLng,
      source: "saved",
      deliveryAddress,
    };
  }

  const coords = await resolveDropoffCoords(token, {
    line1,
    community,
    city,
    region: input.region,
    focusHint: null,
  });
  return { ...coords, deliveryAddress };
}
