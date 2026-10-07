/**
 * Referral programme — mobile client (aligns with GET /me/referrals).
 */

import { Linking, Share } from "react-native";
import { apiFetch } from "./api";

export type MyReferralInvite = {
  referredUserId: string;
  displayName: string | null;
  registeredAt?: string;
  phoneVerifiedAt?: string | null;
  firstTxnAt?: string | null;
  riskFlagged?: boolean;
  status: string;
};

export type MyReferralsResponse = {
  code: string;
  invited: MyReferralInvite[];
};

export async function getMyReferrals(
  token: string,
): Promise<MyReferralsResponse> {
  return apiFetch("/me/referrals", { token });
}

export async function attributeReferral(
  token: string,
  code: string,
): Promise<unknown> {
  return apiFetch("/referrals/attribute", {
    method: "POST",
    token,
    body: { code: code.trim().toUpperCase() },
  });
}

export function referralShareUrl(code: string): string {
  return `https://reworth.ng/onboarding?ref=${encodeURIComponent(code)}`;
}

export function referralStatusLabel(status: string): string {
  switch (status) {
    case "rewarded":
    case "REWARDED":
    case "FIRST_TXN":
      return "Reward unlocked";
    case "registered":
    case "PHONE_VERIFIED":
      return "Phone verified";
    case "invited":
    case "REGISTERED":
      return "Signed up";
    case "RISK_FLAGGED":
      return "Under review";
    default:
      return status.replace(/_/g, " ");
  }
}

export async function shareReferralInvite(code: string): Promise<void> {
  const url = referralShareUrl(code);
  const message = `Join me on ReWorth — Lagos, your unused things are worth something. Use my code ${code}: ${url}`;
  try {
    await Share.share({ message, title: "Invite to ReWorth" });
  } catch {
    await Linking.openURL(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
    );
  }
}
