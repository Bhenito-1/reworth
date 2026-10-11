import { apiFetch } from "./api";

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

export type LegalName = {
  firstName: string;
  middleName: string;
  lastName: string;
};

export type VerifyPayoutResult =
  | { ok: true; account: PayoutAccountView }
  | {
      ok: false;
      reason: "ACCOUNT_NOT_FOUND" | "NAME_MISMATCH";
      nibssName?: LegalName;
      message?: string;
    };

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

export async function getPayoutSetup(token: string) {
  return apiFetch<{
    account: PayoutAccountView | null;
    nameEnquiryMode: "mock" | "paystack";
  }>("/sellers/payout-account", { token });
}

export async function listPayoutBanks(token: string) {
  const result = await apiFetch<{ items: PayoutBank[] }>("/sellers/banks", {
    token,
  });
  return result.items.length > 0 ? result.items : [...FALLBACK_BANKS];
}

export async function verifyPayoutAccount(
  token: string,
  body: {
    accountNumber: string;
    bankCode: string;
    firstName: string;
    middleName: string;
    lastName: string;
  },
) {
  return apiFetch<VerifyPayoutResult>("/sellers/payout-account/verify", {
    method: "POST",
    token,
    body,
  });
}
