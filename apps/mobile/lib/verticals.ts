/**
 * Vehicle inspection + luxury helpers — mobile.
 * Aligns with VerticalsController paths.
 */

import { apiFetch } from "./api";
import type { PublicListing } from "./types";

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
  checkoutUrl?: string | null;
  completedAt?: string | null;
  conditionScore?: number | null;
  verifiedMileage?: number | null;
  accidentNotes?: string | null;
};

export function isVehicleListing(listing: PublicListing): boolean {
  const slug = listing.category?.slug?.toLowerCase() ?? "";
  const name = listing.category?.name?.toLowerCase() ?? "";
  if (slug.includes("vehicle") || name.includes("vehicle") || slug === "cars") {
    return true;
  }
  return Boolean(listing.vehicle && Object.keys(listing.vehicle).length > 0);
}

export function isLuxuryListing(listing: PublicListing): boolean {
  const slug = listing.category?.slug?.toLowerCase() ?? "";
  const name = listing.category?.name?.toLowerCase() ?? "";
  if (slug.includes("luxury") || name.includes("luxury")) return true;
  if (listing.authRequired) return true;
  const status = listing.authenticationStatus;
  return Boolean(status && status !== "NOT_REQUIRED");
}

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

export function inspectedBadgeLabel(listing: PublicListing): string | null {
  const raw = listing.inspectedBadge;
  if (raw === true) return "Inspected ✓";
  if (raw && typeof raw === "object" && (raw as { inspected?: boolean }).inspected) {
    return "Inspected ✓";
  }
  if (listing.inspectedAt) return "Inspected ✓";
  return null;
}

export async function requestInspection(
  token: string,
  listingId: string,
  body?: { slotLabel?: string },
): Promise<VehicleInspection> {
  return apiFetch(`/listings/${listingId}/inspections`, {
    method: "POST",
    token,
    body: body ?? {},
  });
}

export async function payInspection(
  token: string,
  inspectionId: string,
): Promise<VehicleInspection> {
  return apiFetch(`/inspections/${inspectionId}/pay`, {
    method: "POST",
    token,
    body: {},
  });
}

export async function scheduleInspection(
  token: string,
  inspectionId: string,
  body: { slotLabel?: string; scheduledAt?: string },
): Promise<VehicleInspection> {
  return apiFetch(`/inspections/${inspectionId}/schedule`, {
    method: "POST",
    token,
    body,
  });
}

export async function getInspection(
  token: string,
  inspectionId: string,
): Promise<VehicleInspection> {
  return apiFetch(`/inspections/${inspectionId}`, { token });
}

export async function getLatestListingInspection(
  token: string,
  listingId: string,
): Promise<VehicleInspection | null> {
  try {
    return await apiFetch(`/listings/${listingId}/inspections`, { token });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null;
    throw err;
  }
}

export const INSPECTION_SLOTS = [
  "Tomorrow morning (9–12 WAT)",
  "Tomorrow afternoon (1–5 WAT)",
  "This weekend (Sat 10–2 WAT)",
  "Next Mon–Wed (flexible)",
] as const;
