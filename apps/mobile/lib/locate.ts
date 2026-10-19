/**
 * ADR-011 Phase A — device GPS → nearest community (no public street address).
 */

import * as Location from "expo-location";
import { apiFetch } from "./api";
import { communityChipFromLocate, type RegionCity } from "./region";

export type LocateResult = {
  found: boolean;
  city?: string;
  key?: string;
  displayName?: string;
  community?: string;
  communityLabel?: string;
  geoLat?: number;
  geoLng?: number;
  distanceKm?: number;
};

export type LocateMeOutcome = {
  city: RegionCity;
  communityLabel: string;
  communityCode: string;
  distanceKm: number;
  /** Device GPS (on-device / one-shot — not published on browse). */
  userLat: number;
  userLng: number;
  /** Snapped community centroid for map pin. */
  communityLat: number;
  communityLng: number;
};

export async function requestLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted;
}

export async function getDeviceCoords(): Promise<{
  lat: number;
  lng: number;
} | null> {
  const granted = await requestLocationPermission();
  if (!granted) return null;
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
  };
}

export async function locateNearestCommunity(
  lat: number,
  lng: number,
): Promise<LocateResult> {
  const qs = `lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  return apiFetch<LocateResult>(`/regions/locate?${qs}`);
}

/** Permission → GPS → API snap. Throws with user-facing message on failure. */
export async function locateMe(): Promise<LocateMeOutcome> {
  const coords = await getDeviceCoords();
  if (!coords) {
    throw new Error(
      "Location permission is required to find your area on ReWorth.",
    );
  }
  const res = await locateNearestCommunity(coords.lat, coords.lng);
  if (!res.found || !res.city || !res.displayName) {
    throw new Error("Could not match your location to a ReWorth city yet.");
  }
  const communityLabel = communityChipFromLocate(
    res.city,
    res.community,
    res.communityLabel,
  );
  return {
    city: {
      city: res.city,
      key: res.key ?? res.city,
      displayName: res.displayName,
    },
    communityLabel,
    communityCode: res.community ?? "",
    distanceKm: res.distanceKm ?? 0,
    userLat: coords.lat,
    userLng: coords.lng,
    communityLat: res.geoLat ?? coords.lat,
    communityLng: res.geoLng ?? coords.lng,
  };
}
