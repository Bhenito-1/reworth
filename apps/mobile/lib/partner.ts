/**
 * Estate partner console — JWT and/or x-reworth-partner-key.
 * Partner key is kept in memory for the app session only (not persisted).
 */

import { apiFetch, ApiError } from "./api";

let memoryPartnerKey: string | null = null;

export type PartnerKpis = {
  members?: number;
  pending?: number;
  liveListings?: number;
  joins7d?: number;
  leaves7d?: number;
  communityId?: string;
  communityName?: string;
  companyName?: string;
  [key: string]: unknown;
};

export type PartnerMembership = {
  id: string;
  userId?: string;
  status: string;
  displayName?: string | null;
  phoneMasked?: string | null;
  createdAt?: string;
  joinedAt?: string | null;
};

export type PartnerMe = {
  partnerId?: string;
  companyName?: string;
  communityId?: string;
  communityName?: string;
  status?: string;
  kpis?: PartnerKpis;
};

export function getStoredPartnerKey(): string | null {
  return memoryPartnerKey;
}

export function setStoredPartnerKey(key: string | null): void {
  memoryPartnerKey = key?.trim() || null;
}

function partnerHeaders(partnerKey?: string | null): Record<string, string> | undefined {
  const key = partnerKey ?? memoryPartnerKey;
  if (!key) return undefined;
  return { "x-reworth-partner-key": key };
}

export async function getPartnerMe(
  token?: string | null,
  partnerKey?: string | null,
): Promise<PartnerMe> {
  return apiFetch<PartnerMe>("/partner/me", {
    token,
    headers: partnerHeaders(partnerKey),
  });
}

export async function getPartnerKpis(
  token?: string | null,
  partnerKey?: string | null,
): Promise<PartnerKpis> {
  try {
    return await apiFetch<PartnerKpis>("/partner/me/kpis", {
      token,
      headers: partnerHeaders(partnerKey),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const me = await getPartnerMe(token, partnerKey);
      return me.kpis ?? {};
    }
    throw err;
  }
}

export async function listPartnerMembershipQueue(
  token?: string | null,
  partnerKey?: string | null,
  status = "INVITED",
): Promise<PartnerMembership[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiFetch<
    PartnerMembership[] | { items?: PartnerMembership[] }
  >(`/partner/memberships${qs}`, {
    token,
    headers: partnerHeaders(partnerKey),
  });
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}

export async function decidePartnerMembership(
  membershipId: string,
  action: "approve" | "reject" | "suspend",
  token?: string | null,
  partnerKey?: string | null,
): Promise<unknown> {
  return apiFetch(
    `/partner/memberships/${encodeURIComponent(membershipId)}/${action}`,
    {
      method: "POST",
      token,
      headers: partnerHeaders(partnerKey),
      body: {},
    },
  );
}
