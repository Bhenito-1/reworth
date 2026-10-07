/**
 * Valuations, consignments, managed pickup (Phase 3.1).
 */

import { apiFetch } from "./api";

export type ValuationCard = {
  id: string;
  city: string;
  currency: string;
  estimatedLowKobo: number;
  estimatedHighKobo: number;
  recommendedKobo: number;
  quickSaleKobo: number;
  maxValueKobo: number;
  confidenceLabel?: string;
  basis?: string;
};

export async function createValuation(
  token: string | null | undefined,
  body: { city?: string; listingId?: string; photoKey?: string },
): Promise<ValuationCard> {
  return apiFetch("/valuations", {
    method: "POST",
    token,
    body,
  });
}

export type Consignment = {
  id: string;
  title: string;
  status: string;
  floorPriceKobo: number;
  askingPriceKobo: number;
  netPayoutKobo?: number | null;
  feeKobo?: number | null;
};

export async function listMyConsignments(token: string): Promise<Consignment[]> {
  return apiFetch("/me/consignments", { token });
}

export async function createConsignment(
  token: string,
  body: {
    title: string;
    floorPriceKobo: number;
    askingPriceKobo: number;
    city?: string;
  },
): Promise<Consignment> {
  return apiFetch("/consignments", {
    method: "POST",
    token,
    body,
  });
}

export async function listConsignmentOnPlatform(
  token: string,
  id: string,
): Promise<Consignment> {
  return apiFetch(`/consignments/${id}/list`, { method: "POST", token });
}

export async function returnConsignment(
  token: string,
  id: string,
): Promise<Consignment> {
  return apiFetch(`/consignments/${id}/return`, { method: "POST", token });
}

export async function markConsignmentSold(
  token: string,
  id: string,
  soldPriceKobo: number,
): Promise<Consignment> {
  return apiFetch(`/consignments/${id}/sold`, {
    method: "POST",
    token,
    body: { soldPriceKobo },
  });
}

export function consignmentStatusLabel(status: string): string {
  switch (status) {
    case "INTAKE":
      return "Intake";
    case "LISTED":
      return "Listed";
    case "SOLD":
      return "Sold";
    case "RETURNED":
      return "Returned";
    case "EXPIRED":
      return "Expired";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function pickupStatusLabel(status: string): string {
  switch (status) {
    case "BOOKED":
    case "SCHEDULED":
      return "Booked";
    case "PICKED_UP":
      return "Picked up";
    case "IN_TRANSIT":
      return "In transit";
    case "DELIVERED":
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

export type ManagedPickup = {
  id: string;
  status: string;
  slotStartAt: string;
  slotEndAt: string;
  addressLine: string;
  city?: string;
};

export type ManagedPickupSlot = {
  slotStartAt: string;
  slotEndAt: string;
  label: string;
  available: boolean;
};

export function generateWatPickupSlots(count = 6): ManagedPickupSlot[] {
  const slots: ManagedPickupSlot[] = [];
  const now = new Date();
  let cursor = new Date(now.getTime() + 60 * 60 * 1000);
  cursor.setMinutes(0, 0, 0);
  while (slots.length < count) {
    const watHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        hour12: false,
      }).format(cursor),
    );
    if (watHour >= 9 && watHour < 17) {
      const end = new Date(cursor.getTime() + 60 * 60 * 1000);
      slots.push({
        slotStartAt: cursor.toISOString(),
        slotEndAt: end.toISOString(),
        label: formatWat(cursor.toISOString()),
        available: true,
      });
    }
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    if (cursor.getTime() - now.getTime() > 14 * 24 * 60 * 60 * 1000) break;
  }
  return slots;
}

export type InstantBuyFulfilment = {
  id: string;
  orderId: string;
  listingId?: string;
  status: string;
  slotStartAt?: string | null;
  slotEndAt?: string | null;
  slaDeadlineAt?: string | null;
};

export async function getInstantBuyByOrder(
  token: string,
  orderId: string,
): Promise<InstantBuyFulfilment> {
  return apiFetch(`/instant-buy/by-order/${orderId}`, { token });
}

export async function scheduleInstantBuy(
  token: string,
  fulfilmentId: string,
  body: { slotStartAt: string; slotEndAt: string },
): Promise<unknown> {
  return apiFetch(`/instant-buy/fulfilments/${fulfilmentId}/schedule`, {
    method: "POST",
    token,
    body,
  });
}

export async function confirmInstantBuy(
  token: string,
  fulfilmentId: string,
): Promise<unknown> {
  return apiFetch(`/instant-buy/fulfilments/${fulfilmentId}/confirm`, {
    method: "POST",
    token,
    body: {},
  });
}

export async function bookManagedPickup(
  token: string,
  body: {
    slotStartAt: string;
    slotEndAt: string;
    addressLine: string;
    city?: string;
  },
): Promise<ManagedPickup> {
  return apiFetch("/managed-pickups", {
    method: "POST",
    token,
    body,
  });
}

export async function listMyManagedPickups(
  token: string,
): Promise<ManagedPickup[]> {
  return apiFetch("/me/managed-pickups", { token });
}

function formatWat(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
