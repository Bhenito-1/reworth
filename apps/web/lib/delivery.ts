/**
 * Phase 6 — Logistics / delivery API helpers.
 * Shapes match MeetPointsController + OrderDeliveryController.
 */

import { apiFetch } from "./api";

export type MeetPoint = {
  id: string;
  community: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
  active?: boolean;
  createdAt?: string;
};

export type DeliveryQuote = {
  orderId: string;
  feeKobo: number;
  deliveryFeeKobo: number;
  distanceKm: number;
  provider: string;
  totalKobo: number;
};

export type DeliveryShipmentStatus =
  | "QUOTED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | string;

export type DeliveryEvent = {
  id: string;
  shipmentId: string;
  status: DeliveryShipmentStatus;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type DeliveryShipment = {
  id: string;
  orderId: string;
  provider: string;
  providerRef: string | null;
  quoteKobo: number;
  distanceKm: number | null;
  status: DeliveryShipmentStatus;
  etaFrom: string | null;
  etaTo: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  events: DeliveryEvent[];
};

export type AddressDisclosureResult = {
  id: string;
  orderId: string;
  createdAt: string;
  addressSnapshot: string;
};

export type MeetPointFulfilmentResult = {
  orderId: string;
  meetPoint: MeetPoint;
  fulfilmentMethod: string;
};

export function shipmentStatusLabel(status: string): string {
  switch (status) {
    case "QUOTED":
      return "Quoted";
    case "ASSIGNED":
      return "Courier assigned";
    case "PICKED_UP":
      return "Picked up";
    case "IN_TRANSIT":
      return "In transit";
    case "DELIVERED":
      return "Delivered";
    case "FAILED":
      return "Failed";
    default:
      return status
        .trim()
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

export function listMeetPoints(
  token: string | null | undefined,
  community?: string,
): Promise<MeetPoint[]> {
  const q = community
    ? `?community=${encodeURIComponent(community)}`
    : "";
  return apiFetch<MeetPoint[]>(`/meet-points${q}`, {
    token: token ?? undefined,
  });
}

export function getDeliveryQuote(
  token: string,
  orderId: string,
  toLat: number,
  toLng: number,
): Promise<DeliveryQuote> {
  const q = new URLSearchParams({
    toLat: String(toLat),
    toLng: String(toLng),
  });
  return apiFetch<DeliveryQuote>(
    `/orders/${orderId}/delivery-quote?${q.toString()}`,
    { token },
  );
}

export function setOrderMeetPoint(
  token: string,
  orderId: string,
  meetPointId: string,
): Promise<MeetPointFulfilmentResult> {
  return apiFetch<MeetPointFulfilmentResult>(
    `/orders/${orderId}/fulfilment/meet-point`,
    { method: "POST", token, body: { meetPointId } },
  );
}

export function discloseOrderAddress(
  token: string,
  orderId: string,
): Promise<AddressDisclosureResult> {
  return apiFetch<AddressDisclosureResult>(
    `/orders/${orderId}/disclose-address`,
    { method: "POST", token },
  );
}

export function getOrderShipment(
  token: string,
  orderId: string,
): Promise<DeliveryShipment> {
  return apiFetch<DeliveryShipment>(`/orders/${orderId}/shipment`, { token });
}

/** Fallback destination ~1 km east of listing when GPS unavailable. */
export function fallbackDeliveryDestination(
  listingLat: number | null | undefined,
  listingLng: number | null | undefined,
): { toLat: number; toLng: number } {
  const baseLat = listingLat ?? 6.45;
  const baseLng = listingLng ?? 3.45;
  return { toLat: baseLat + 0.008, toLng: baseLng + 0.008 };
}
