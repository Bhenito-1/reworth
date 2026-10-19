import { apiFetch } from "./api";

export type IdentityVerifyResult = {
  id: string;
  level: string;
  status: string;
  method: string;
  identityVerifiedBadge: boolean;
  verifiedAt: string | null;
};

export async function verifyNin(token: string, nin: string) {
  return apiFetch<IdentityVerifyResult>("/verifications/identity", {
    method: "POST",
    token,
    body: { method: "NIN", nin },
  });
}
