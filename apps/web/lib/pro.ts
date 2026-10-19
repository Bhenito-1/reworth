/**
 * Phase 2.4 — Professional seller accounts + public storefront.
 */

import { apiFetch } from "./api";
import type { PublicListing } from "./types";

export type ProAccountStatus =
  | "APPLIED"
  | "APPROVED"
  | "ACTIVE"
  | "GRACE"
  | "SUSPENDED"
  | "REJECTED"
  | string;

export type ProAccount = {
  id: string;
  userId?: string;
  status: ProAccountStatus;
  tier?: string;
  businessName: string;
  businessDetails?: Record<string, unknown>;
  sampleListingIds?: string[];
  applicationNotes?: string | null;
  subscriptionStatus?: string;
  mrrKobo?: number;
  currentPeriodEnd?: string | null;
  handle?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProApplyBody = {
  businessName: string;
  businessDetails?: Record<string, unknown>;
  sampleListingIds?: string[];
  applicationNotes?: string;
  handle?: string;
};

export type BulkUploadError = {
  row?: number;
  line?: number;
  field?: string;
  message: string;
};

export type BulkUploadJob = {
  id: string;
  status: string;
  rowCount?: number;
  successCount?: number;
  errorCount?: number;
  errorsJson?: BulkUploadError[] | unknown;
  errors?: BulkUploadError[];
  createdAt?: string;
};

export type ProStorefront = {
  handle: string;
  displayName?: string;
  businessName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  verificationBadge?: boolean;
  proStatus?: string;
  listings?: PublicListing[];
  items?: PublicListing[];
};

export async function applyPro(
  token: string,
  body: ProApplyBody,
): Promise<ProAccount> {
  return apiFetch<ProAccount>("/pro/apply", {
    method: "POST",
    token,
    body,
  });
}

export async function getMyProAccount(token: string): Promise<ProAccount | null> {
  try {
    return await apiFetch<ProAccount>("/me/pro", { token });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function subscribePro(
  token: string,
  body?: { plan?: string },
): Promise<ProAccount> {
  return apiFetch<ProAccount>("/me/pro/subscribe", {
    method: "POST",
    token,
    body: body ?? {},
  });
}

/**
 * Upload bulk CSV as JSON `{ csv }` (API BulkUploadDto).
 */
export async function uploadProBulkCsv(
  token: string,
  file: File,
): Promise<BulkUploadJob> {
  const csv = await file.text();
  return apiFetch<BulkUploadJob>("/me/pro/bulk-upload", {
    method: "POST",
    token,
    body: { csv },
  });
}

export function bulkUploadErrors(job: BulkUploadJob): BulkUploadError[] {
  if (Array.isArray(job.errors)) return job.errors;
  if (Array.isArray(job.errorsJson)) return job.errorsJson as BulkUploadError[];
  return [];
}

export async function getStorefront(handle: string): Promise<ProStorefront> {
  const clean = handle.replace(/^@/, "").trim();
  return apiFetch<ProStorefront>(`/storefronts/${encodeURIComponent(clean)}`);
}

/** Public path for storefront pages (vanity /@handle rewrites to this). */
export function storefrontPath(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  return `/u/${encodeURIComponent(clean)}`;
}
