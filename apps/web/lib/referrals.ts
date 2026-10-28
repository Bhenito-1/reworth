/**
 * Phase 2.4 — Referral programme client.
 * API: GET /me/referrals · POST /referrals/attribute
 */

import { apiFetch } from "./api";

export type ReferralCodeResponse = {
  code: string;
  shareUrl?: string;
  invited?: MyReferralRow[];
};

export type ReferralAttributionStatus = string;

export type MyReferralRow = {
  id?: string;
  referredUserId?: string;
  displayName?: string | null;
  status: ReferralAttributionStatus;
  registeredAt?: string;
  phoneVerifiedAt?: string | null;
  firstTxnAt?: string | null;
  riskFlagged?: boolean;
  rewardStatus?: string | null;
  rewardType?: string | null;
};

export type MyReferralsResponse = {
  items: MyReferralRow[];
  code?: string;
};

export type AttributeReferralBody = {
  code: string;
  deviceFingerprintHash?: string;
};

export async function getMyReferralCode(
  token: string,
): Promise<ReferralCodeResponse> {
  const raw = await apiFetch<{
    code: string;
    invited?: MyReferralRow[];
  }>("/me/referrals", { token });
  return {
    code: raw.code,
    invited: raw.invited,
    shareUrl: referralShareUrl(raw.code),
  };
}

export async function attributeReferral(
  token: string,
  body: AttributeReferralBody,
): Promise<{ ok: boolean; attributionId?: string }> {
  return apiFetch("/referrals/attribute", {
    method: "POST",
    token,
    body,
  });
}

export async function listMyReferrals(
  token: string,
): Promise<MyReferralsResponse> {
  const raw = await apiFetch<{
    code: string;
    invited?: MyReferralRow[];
  }>("/me/referrals", { token });
  const items = (raw.invited ?? []).map((row, i) => ({
    ...row,
    id: row.referredUserId ?? `ref-${i}`,
  }));
  return { items, code: raw.code };
}

export function referralShareUrl(code: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://reworth.ng");
  return `${base}/onboarding?ref=${encodeURIComponent(code)}`;
}

export function whatsappShareHref(code: string, shareUrl: string): string {
  const text = `Join me on ReWorth — Lagos, your unused things are worth something. Use my code ${code}: ${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function referralStatusLabel(status: string): string {
  switch (status) {
    case "REGISTERED":
    case "invited":
      return "Signed up";
    case "PHONE_VERIFIED":
    case "registered":
      return "Phone verified";
    case "FIRST_TXN":
    case "rewarded":
    case "REWARDED":
      return "Reward granted";
    case "RISK_FLAGGED":
      return "Under review";
    case "PENDING":
      return "Pending";
    default:
      return status
        .trim()
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase());
  }
}
