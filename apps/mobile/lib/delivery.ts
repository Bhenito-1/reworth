/**
 * Phase 6 — Mobile delivery / logistics helpers.
 */

import { apiFetch } from "./api";

export type MeetPoint = {
  id: string;
  community: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
};

export type DeliveryQuote = {
  orderId: string;
  feeKobo: number;
  deliveryFeeKobo: number;
  distanceKm: number;
  provider: string;
  totalKobo: number;
};

export type DeliveryShipment = {
  id: string;
  orderId: string;
  status: string;
  quoteKobo: number;
  distanceKm: number | null;
  etaFrom: string | null;
  etaTo: string | null;
  failureReason: string | null;
  events: {
    id: string;
    status: string;
    createdAt: string;
  }[];
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
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
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
  token: string,
  community?: string,
): Promise<MeetPoint[]> {
  const q = community
    ? `?community=${encodeURIComponent(community)}`
    : "";
  return apiFetch(`/meet-points${q}`, { token });
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
  return apiFetch(`/orders/${orderId}/delivery-quote?${q.toString()}`, {
    token,
  });
}

export function setOrderMeetPoint(
  token: string,
  orderId: string,
  meetPointId: string,
): Promise<unknown> {
  return apiFetch(`/orders/${orderId}/fulfilment/meet-point`, {
    method: "POST",
    token,
    body: { meetPointId },
  });
}

export function discloseOrderAddress(
  token: string,
  orderId: string,
): Promise<{ id: string; addressSnapshot: string; createdAt: string }> {
  return apiFetch(`/orders/${orderId}/disclose-address`, {
    method: "POST",
    token,
  });
}

export function getOrderShipment(
  token: string,
  orderId: string,
): Promise<DeliveryShipment> {
  return apiFetch(`/orders/${orderId}/shipment`, { token });
}

export function fallbackDeliveryDestination(
  listingLat?: number | null,
  listingLng?: number | null,
): { toLat: number; toLng: number } {
  const baseLat = listingLat ?? 6.45;
  const baseLng = listingLng ?? 3.45;
  return { toLat: baseLat + 0.008, toLng: baseLng + 0.008 };
}
