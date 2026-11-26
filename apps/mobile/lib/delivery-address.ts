import { apiFetch } from "./api";

export type DeliveryAddress = {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  community: string;
  country: string;
  geoLat: number | null;
  geoLng: number | null;
  hasGeo: boolean;
};

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
  },
): Promise<{ lat: number; lng: number }> {
  const res = await apiFetch<{
    ok: boolean;
    lat?: number;
    lng?: number;
    message?: string;
  }>("/routing/geocode", { method: "POST", token, body });
  if (!res.ok || res.lat == null || res.lng == null) {
    throw new Error(res.message ?? "Could not locate that address");
  }
  return { lat: res.lat, lng: res.lng };
}
