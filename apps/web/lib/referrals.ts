/**
 * Phase 2.4 — Referral programme client.
 */

import { apiFetch } from "./api";

export type ReferralCodeResponse = {
  code: string;
  shareUrl?: string;
  createdAt?: string;
};

export type ReferralAttributionStatus =
  | "REGISTERED"
  | "PHONE_VERIFIED"
  | "FIRST_TXN"
  | "REWARDED"
  | "RISK_FLAGGED"
  | "PENDING"
  | string;

export type MyReferralRow = {
  id: string;
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
  return apiFetch<ReferralCodeResponse>("/referrals/me", { token });
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
  const raw = await apiFetch<MyReferralsResponse | MyReferralRow[]>(
    "/referrals/mine",
    { token },
  );
  if (Array.isArray(raw)) return { items: raw };
  return { items: raw.items ?? [], code: raw.code };
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
      return "Signed up";
    case "PHONE_VERIFIED":
      return "Phone verified";
    case "FIRST_TXN":
      return "First transaction";
    case "REWARDED":
      return "Reward granted";
    case "RISK_FLAGGED":
      return "Under review";
    case "PENDING":
      return "Pending";
    default:
      return status.replace(/_/g, " ");
  }
}
