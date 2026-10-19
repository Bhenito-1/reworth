/**
 * Pro seller accounts — mobile client (aligns with /pro/apply, /me/pro).
 */

import { apiFetch } from "./api";

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
  status: ProAccountStatus;
  businessName: string;
  handle?: string | null;
  applicationNotes?: string | null;
  subscriptionStatus?: string;
  mrrKobo?: number;
  currentPeriodEnd?: string | null;
};

export async function getMyProAccount(
  token: string,
): Promise<ProAccount | null> {
  try {
    return await apiFetch<ProAccount>("/me/pro", { token });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function applyPro(
  token: string,
  body: {
    businessName: string;
    handle?: string;
    applicationNotes?: string;
  },
): Promise<ProAccount> {
  return apiFetch("/pro/apply", {
    method: "POST",
    token,
    body,
  });
}

export async function subscribePro(token: string): Promise<ProAccount> {
  return apiFetch("/me/pro/subscribe", {
    method: "POST",
    token,
    body: {},
  });
}

export async function uploadProBulkCsvText(
  token: string,
  csv: string,
): Promise<{ id: string; status: string; errorCount?: number; successCount?: number }> {
  return apiFetch("/me/pro/bulk-upload", {
    method: "POST",
    token,
    body: { csv },
  });
}

export function storefrontPath(handle: string): string {
  return `/u/${encodeURIComponent(handle.replace(/^@/, "").trim())}`;
}

export function storefrontShareUrl(handle: string): string {
  return `https://reworth.ng${storefrontPath(handle)}`;
}

export type StorefrontListing = {
  id: string;
  title: string;
  priceKobo: number;
  condition?: string;
  community?: string | null;
  publishedAt?: string | null;
  images?: Array<{
    url?: string;
    variants?: Record<string, string> | unknown;
  }>;
};

export type ProStorefront = {
  handle: string;
  displayName?: string;
  businessName?: string | null;
  about?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  verificationBadge?: boolean;
  proBadge?: string | null;
  proStatus?: string;
  rating?: number | null;
  reviewCount?: number | null;
  responseMinutes?: number | null;
  listings?: StorefrontListing[];
  items?: StorefrontListing[];
};

export async function getStorefront(handle: string): Promise<ProStorefront> {
  const clean = handle.replace(/^@/, "").trim();
  return apiFetch<ProStorefront>(
    `/storefronts/${encodeURIComponent(clean)}`,
  );
}
