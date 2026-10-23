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

/** Customer-facing labels (delivery-journey design). */
export function shipmentStatusLabel(status: string): string {
  switch (status) {
    case "QUOTED":
      return "Delivery quoted";
    case "ASSIGNED":
      return "Rider assigned";
    case "PICKED_UP":
      return "Collected from seller";
    case "IN_TRANSIT":
      return "On the way";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return "Delivered — confirm";
    case "FAILED":
      return "Needs attention";
    default:
      return status
        .trim()
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

export type JourneyStep = {
  key: string;
  title: string;
  buyerHint: string;
  sellerHint: string;
};

export const DELIVERY_JOURNEY_STEPS: JourneyStep[] = [
  {
    key: "QUOTED",
    title: "Paid & protected",
    buyerHint: "Your payment is held until you confirm the item.",
    sellerHint: "Buyer paid — prepare the item for collection.",
  },
  {
    key: "ASSIGNED",
    title: "Rider assigned",
    buyerHint: "A rider will collect from the seller next.",
    sellerHint: "Have the item packed and accessible.",
  },
  {
    key: "PICKED_UP",
    title: "Collected from seller",
    buyerHint: "The item is with the rider.",
    sellerHint: "Collected — payout unlocks after the buyer confirms.",
  },
  {
    key: "IN_TRANSIT",
    title: "On the way",
    buyerHint: "Heading toward your area.",
    sellerHint: "In transit to the buyer.",
  },
  {
    key: "OUT_FOR_DELIVERY",
    title: "Out for delivery",
    buyerHint: "Be available to receive the item.",
    sellerHint: "Rider is delivering to the buyer.",
  },
  {
    key: "DELIVERED",
    title: "Delivered",
    buyerHint: "Confirm it looks right to release payment.",
    sellerHint: "Waiting for the buyer to confirm receipt.",
  },
];

const JOURNEY_RANK: Record<string, number> = {
  QUOTED: 0,
  ASSIGNED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  FAILED: -1,
};

export function journeyStepIndex(status: string): number {
  return JOURNEY_RANK[status] ?? 0;
}

export function deliveryWindowHint(): string {
  return "Typically next day · WAT";
}

export function formatDeliveryEta(
  etaFrom: string | null | undefined,
  etaTo: string | null | undefined,
): string {
  if (!etaFrom && !etaTo) return deliveryWindowHint();
  try {
    const from = etaFrom ? new Date(etaFrom) : null;
    const to = etaTo ? new Date(etaTo) : null;
    if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const sameDay = from.toDateString() === to.toDateString();
      const day = from.toLocaleDateString("en-NG", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const t0 = from.toLocaleTimeString("en-NG", {
        hour: "numeric",
        minute: "2-digit",
      });
      const t1 = to.toLocaleTimeString("en-NG", {
        hour: "numeric",
        minute: "2-digit",
      });
      return sameDay ? `${day} · ${t0}–${t1} WAT` : `${day} onward · WAT`;
    }
    if (from && !Number.isNaN(from.getTime())) {
      return `${from.toLocaleString("en-NG")} · WAT`;
    }
  } catch {
    /* fall through */
  }
  return deliveryWindowHint();
}

export function privacyBeforePayCopy(): string {
  return "Exact address stays private until payment.";
}

/** Corridor pins for D3 map — community-level only, never exact home. */
export function buildDeliveryCorridor(input: {
  listingLat?: number | null;
  listingLng?: number | null;
  distanceKm?: number | null;
  sellerLabel?: string;
  buyerLabel?: string;
}): {
  sellerLat: number;
  sellerLng: number;
  sellerLabel: string;
  buyerLat: number;
  buyerLng: number;
  buyerLabel: string;
} {
  const sellerLat = input.listingLat ?? 6.45;
  const sellerLng = input.listingLng ?? 3.4;
  const km = Math.max(1, input.distanceKm ?? 8);
  const delta = Math.min(0.12, (km / 111) * 0.85);
  return {
    sellerLat,
    sellerLng,
    sellerLabel: input.sellerLabel?.trim() || "Seller area",
    buyerLat: sellerLat + delta * 0.35,
    buyerLng: sellerLng + delta,
    buyerLabel: input.buyerLabel?.trim() || "Buyer area",
  };
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
