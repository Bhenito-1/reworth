import { apiFetch } from "./api";

export type AddressKind = "PICKUP" | "DELIVERY";

export type DeliveryAddress = {
  id: string;
  kind?: AddressKind;
  line1: string;
  line2: string | null;
  city: string;
  community: string;
  country: string;
  geoLat: number | null;
  geoLng: number | null;
  hasGeo: boolean;
};

export async function getMyDeliveryAddress(
  token: string,
): Promise<DeliveryAddress | null> {
  const res = await apiFetch<{ deliveryAddress: DeliveryAddress | null }>(
    "/me/delivery-address",
    { token },
  );
  return res.deliveryAddress;
}

export async function saveMyDeliveryAddress(
  token: string,
  body: {
    line1: string;
    line2?: string;
    city: string;
    community: string;
    country?: string;
  },
): Promise<DeliveryAddress> {
  const res = await apiFetch<{ deliveryAddress: DeliveryAddress }>(
    "/me/delivery-address",
    { method: "PUT", token, body },
  );
  return res.deliveryAddress;
}

export async function geocodeStreetAddress(
  token: string,
  body: {
    line1: string;
    line2?: string;
    city?: string;
    community?: string;
    country?: string;
    focusLat?: number;
    focusLng?: number;
  },
): Promise<{ lat: number; lng: number; source: string }> {
  const res = await apiFetch<{
    ok: boolean;
    lat?: number;
    lng?: number;
    source?: string;
    message?: string;
  }>("/routing/geocode", { method: "POST", token, body });
  if (!res.ok || res.lat == null || res.lng == null) {
    throw new Error(res.message ?? "Could not locate that address");
  }
  return { lat: res.lat, lng: res.lng, source: res.source ?? "unknown" };
}

export function formatDeliveryAddressLine(addr: DeliveryAddress): string {
  return [addr.line1, addr.line2, addr.community, addr.city]
    .filter(Boolean)
    .join(", ");
}
