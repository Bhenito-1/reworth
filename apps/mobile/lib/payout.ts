import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

export type PayoutBank = { code: string; name: string };

export type PayoutAccountView = {
  bankCode: string;
  bankName: string;
  accountNumberMasked: string;
  firstName: string;
  middleName: string;
  lastName: string;
  verifiedAt: string;
};

export type VerifyPayoutResult = { ok: true; account: PayoutAccountView };

export const FALLBACK_BANKS: PayoutBank[] = [
  { code: "058", name: "GTBank" },
  { code: "044", name: "Access Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "033", name: "UBA" },
  { code: "999992", name: "OPay" },
  { code: "50211", name: "Kuda" },
];

export function payoutDisplayName(account: {
  firstName: string;
  middleName: string;
  lastName: string;
}): string {
  return [account.firstName, account.middleName, account.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

async function tokenOrNull() {
  return getAccessToken();
}

export async function getPayoutSetup() {
  const token = await tokenOrNull();
  if (!token) throw new Error("Not signed in");
  return apiFetch<{ account: PayoutAccountView | null }>(
    "/sellers/payout-account",
    { token },
  );
}

export async function listPayoutBanks() {
  const token = await tokenOrNull();
  if (!token) return [...FALLBACK_BANKS];
  try {
    const result = await apiFetch<{ items: PayoutBank[] }>("/sellers/banks", {
      token,
    });
    return result.items.length > 0 ? result.items : [...FALLBACK_BANKS];
  } catch {
    return [...FALLBACK_BANKS];
  }
}

export async function verifyPayoutAccount(body: {
  accountNumber: string;
  bankCode: string;
  firstName: string;
  middleName: string;
  lastName: string;
}) {
  const token = await tokenOrNull();
  if (!token) throw new Error("Not signed in");
  return apiFetch<VerifyPayoutResult>("/sellers/payout-account/verify", {
    method: "POST",
    token,
    body,
  });
}
