/**
 * Phase 2.4 — Vehicle inspection + luxury auth helpers.
 * Paths tolerate slight API naming (inspections vs vehicle-inspections).
 */

import { apiFetch } from "./api";
import type { InspectedBadge, PublicListing } from "./types";

export type InspectionStatus =
  | "REQUESTED"
  | "PAYMENT_PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | string;

export type VehicleInspection = {
  id: string;
  listingId: string;
  status: InspectionStatus;
  feeKobo?: number;
  paymentRef?: string | null;
  scheduledAt?: string | null;
  slotLabel?: string | null;
  partnerRef?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
};

export type InspectionReport = {
  id: string;
  listingId: string;
  status: InspectionStatus;
  conditionScore?: number | null;
  verifiedMileage?: number | null;
  accidentNotes?: string | null;
  tyreBatteryNotes?: string | null;
  registrationOk?: boolean | null;
  reportPhotos?: unknown;
  reportChecklist?: Record<string, unknown> | unknown;
  completedAt?: string | null;
  slotLabel?: string | null;
  scheduledAt?: string | null;
};

export type RequestInspectionBody = {
  listingId?: string;
  notes?: string;
};

export type ScheduleInspectionBody = {
  scheduledAt?: string;
  slotLabel?: string;
};

/** True when category or vehicle payload indicates a vehicle listing. */
export function isVehicleListing(listing: PublicListing): boolean {
  const slug = listing.category?.slug?.toLowerCase() ?? "";
  const name = listing.category?.name?.toLowerCase() ?? "";
  if (slug.includes("vehicle") || name.includes("vehicle") || slug === "cars") {
    return true;
  }
  return Boolean(listing.vehicle && Object.keys(listing.vehicle).length > 0);
}

/** True when luxury auth UI should appear. */
export function isLuxuryListing(listing: PublicListing): boolean {
  const slug = listing.category?.slug?.toLowerCase() ?? "";
  const name = listing.category?.name?.toLowerCase() ?? "";
  if (slug.includes("luxury") || name.includes("luxury")) return true;
  if (listing.authRequired) return true;
  const status = listing.authenticationStatus;
  return Boolean(status && status !== "NOT_REQUIRED");
}

export function resolveInspectedBadge(
  listing: PublicListing,
): { inspected: boolean; completedAt: string | null; inspectionId: string | null } {
  const raw = listing.inspectedBadge;
  if (raw === true) {
    return {
      inspected: true,
      completedAt: listing.inspectedAt ?? null,
      inspectionId: listing.inspectionId ?? null,
    };
  }
  if (raw && typeof raw === "object") {
    const badge = raw as InspectedBadge;
    return {
      inspected: Boolean(badge.inspected),
      completedAt: badge.completedAt ?? listing.inspectedAt ?? null,
      inspectionId: badge.inspectionId ?? listing.inspectionId ?? null,
    };
  }
  return {
    inspected: false,
    completedAt: listing.inspectedAt ?? null,
    inspectionId: listing.inspectionId ?? null,
  };
}

/** Authentic ✓ when PASSED; Unauthenticated when REQUIRED/PENDING/FAILED/OPTED_OUT. */
export function luxuryAuthLabel(
  listing: PublicListing,
): "Authentic ✓" | "Unauthenticated" | null {
  if (!isLuxuryListing(listing) && !listing.authRequired) return null;
  const status = listing.authenticationStatus;
  if (status === "PASSED") return "Authentic ✓";
  if (
    status === "REQUIRED" ||
    status === "PENDING" ||
    status === "FAILED" ||
    status === "OPTED_OUT" ||
    listing.authRequired
  ) {
    return "Unauthenticated";
  }
  return null;
}

export function formatInspectedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export async function requestInspection(
  listingId: string,
  token: string,
  body: RequestInspectionBody = {},
): Promise<VehicleInspection> {
  return apiFetch<VehicleInspection>(`/listings/${listingId}/inspections`, {
    method: "POST",
    token,
    body,
  });
}

export async function payInspection(
  inspectionId: string,
  token: string,
  body?: { paymentRef?: string },
): Promise<VehicleInspection> {
  return apiFetch<VehicleInspection>(`/inspections/${inspectionId}/pay`, {
    method: "POST",
    token,
    body: body ?? {},
  });
}

export async function scheduleInspection(
  inspectionId: string,
  token: string,
  body: ScheduleInspectionBody,
): Promise<VehicleInspection> {
  return apiFetch<VehicleInspection>(`/inspections/${inspectionId}/schedule`, {
    method: "POST",
    token,
    body,
  });
}

export async function getInspectionReport(
  inspectionId: string,
  token?: string | null,
): Promise<InspectionReport> {
  return apiFetch<InspectionReport>(`/inspections/${inspectionId}`, {
    token,
  });
}

/** Prefer listing-scoped latest inspection when API exposes it. */
export async function getListingInspectionReport(
  listingId: string,
  token?: string | null,
): Promise<InspectionReport> {
  return apiFetch<InspectionReport>(`/listings/${listingId}/inspections`, {
    token,
  });
}
