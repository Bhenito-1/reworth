/**
 * Phase 3.2 — Circular-economy hand-offs (charity / recycler).
 */

import { apiFetch } from "./api";

export type CircularPartnerKind = "CHARITY" | "RECYCLER" | string;

export type CircularHandoffStatus =
  | "SCHEDULED"
  | "PICKED_UP"
  | "COMPLETED"
  | "CANCELLED"
  | string;

export type CircularPartner = {
  id: string;
  name: string;
  kind: CircularPartnerKind;
  city: string;
  acceptedCategories?: string[];
  verified?: boolean;
  active?: boolean;
  contactEmail?: string | null;
};

export type CircularHandoff = {
  id: string;
  listingId: string;
  sellerId?: string;
  circularPartnerId: string;
  status: CircularHandoffStatus;
  scheduledAt?: string | null;
  completedAt?: string | null;
  receiptKey?: string | null;
  recipientLabel?: string;
  partner?: CircularPartner;
  listingTitle?: string;
  createdAt?: string;
};

function asList<T>(res: T[] | { items?: T[]; partners?: T[] } | null | undefined): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.partners)) return res.partners;
  return [];
}

export async function listCircularPartners(
  token?: string | null,
  opts?: { city?: string; kind?: string },
): Promise<CircularPartner[]> {
  const params = new URLSearchParams();
  if (opts?.city) params.set("city", opts.city);
  if (opts?.kind) params.set("kind", opts.kind);
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch<
    CircularPartner[] | { items?: CircularPartner[]; partners?: CircularPartner[] }
  >(`/circular/partners${qs}`, { token });
  return asList(res);
}

export async function scheduleCircularHandoff(
  token: string,
  body: {
    listingId: string;
    circularPartnerId: string;
    scheduledAt?: string;
  },
): Promise<CircularHandoff> {
  return apiFetch<CircularHandoff>("/circular/handoffs", {
    method: "POST",
    token,
    body,
  });
}

export async function listMyCircularHandoffs(
  token: string,
): Promise<CircularHandoff[]> {
  const res = await apiFetch<CircularHandoff[] | { items?: CircularHandoff[] }>(
    "/circular/handoffs/me",
    { token },
  );
  return asList(res);
}

export async function setDonateIfUnsold(
  token: string,
  listingId: string,
  donateIfUnsoldDays: number | null,
): Promise<unknown> {
  return apiFetch(`/listings/${listingId}/donate-if-unsold`, {
    method: "POST",
    token,
    body: { donateIfUnsoldDays },
  });
}

export function handoffStatusLabel(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: "Scheduled",
    PICKED_UP: "Picked up",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return map[status] ?? status;
}
