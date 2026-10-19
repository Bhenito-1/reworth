/**
 * Valuations, consignments, and managed pickup.
 * Aligns with PlatformServicesController.
 */

import { apiFetch } from "./api";
import type {
  Consignment,
  ConsignmentEarnings,
  ManagedPickup,
  ManagedPickupSlot,
  ValuationResponse,
} from "./types";

/* ─── What's it worth ───────────────────────────────────────────────── */

/** API returns a flat valuation card (not nested under `result`). */
export type ValuationCardDto = {
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
  shareUrl?: string;
  ctaList?: { label: string; href: string };
  ctaSell?: { label: string; href: string };
  photoKey?: string | null;
  listingId?: string | null;
};

export async function createValuation(
  token: string | null | undefined,
  body: {
    photoKey?: string;
    listingId?: string;
    city?: string;
  },
): Promise<ValuationCardDto> {
  return apiFetch<ValuationCardDto>("/valuations", {
    method: "POST",
    token,
    body,
  });
}

/** @deprecated Prefer createValuation flat DTO; kept for type compatibility. */
export function toValuationResponse(card: ValuationCardDto): ValuationResponse {
  return {
    id: card.id,
    source: card.basis ?? "valuation",
    city: card.city,
    photoKey: card.photoKey,
    listingId: card.listingId,
    result: {
      currency: card.currency,
      estimatedLowKobo: card.estimatedLowKobo,
      estimatedHighKobo: card.estimatedHighKobo,
      recommendedKobo: card.recommendedKobo,
      quickSaleKobo: card.quickSaleKobo,
      maxValueKobo: card.maxValueKobo,
      confidenceLabel: card.confidenceLabel,
      city: card.city,
      basis: card.basis,
    },
  };
}

/* ─── Consignment ───────────────────────────────────────────────────── */

export async function listMyConsignments(
  token: string,
): Promise<Consignment[]> {
  return apiFetch<Consignment[]>("/me/consignments", { token });
}

export function computeConsignmentEarnings(
  items: Consignment[],
): ConsignmentEarnings {
  const sold = items.filter((c) => c.status === "SOLD");
  const listed = items.filter((c) => c.status === "LISTED");
  const pendingPayoutKobo = sold.reduce(
    (s, c) => s + (c.netPayoutKobo ?? 0),
    0,
  );
  const totalFeesKobo = sold.reduce((s, c) => s + (c.feeKobo ?? 0), 0);
  return {
    currency: "NGN",
    listedCount: listed.length,
    soldCount: sold.length,
    pendingPayoutKobo,
    paidOutKobo: 0,
    totalFeesKobo,
    items,
  };
}

export async function createConsignment(
  token: string,
  body: {
    title: string;
    floorPriceKobo: number;
    askingPriceKobo: number;
    city?: string;
    feeBps?: number;
  },
): Promise<Consignment> {
  return apiFetch<Consignment>("/consignments", {
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
      return status
        .trim()
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

/* ─── Managed pickup (WAT slots) ────────────────────────────────────── */

/** Client-generated next N hour slots in Africa/Lagos (API has no slots list). */
export function generateWatPickupSlots(
  count = 8,
  startHour = 9,
  endHour = 17,
): ManagedPickupSlot[] {
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
    if (watHour >= startHour && watHour < endHour) {
      const end = new Date(cursor.getTime() + 60 * 60 * 1000);
      slots.push({
        slotStartAt: cursor.toISOString(),
        slotEndAt: end.toISOString(),
        label: formatWatRange(cursor.toISOString(), end.toISOString()),
        available: true,
      });
    }
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    // Safety: don't scan more than 14 days
    if (cursor.getTime() - now.getTime() > 14 * 24 * 60 * 60 * 1000) break;
  }
  return slots;
}

export async function bookManagedPickup(
  token: string,
  body: {
    slotStartAt: string;
    slotEndAt: string;
    addressLine: string;
    city?: string;
    photoAddon?: boolean;
    photoKeys?: string[];
  },
): Promise<ManagedPickup> {
  return apiFetch<ManagedPickup>("/managed-pickups", {
    method: "POST",
    token,
    body,
  });
}

export async function listMyManagedPickups(
  token: string,
): Promise<ManagedPickup[]> {
  return apiFetch<ManagedPickup[]>("/me/managed-pickups", { token });
}

export function formatWatSlot(iso: string): string {
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

export function formatWatRange(startIso: string, endIso: string): string {
  try {
    const start = new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(startIso));
    const end = new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(endIso));
    return `${start} – ${end} WAT`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}
