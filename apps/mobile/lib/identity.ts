import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

export type IdentityVerifyResult = {
  id: string;
  level: string;
  status: string;
  method: string;
  identityVerifiedBadge: boolean;
  verifiedAt: string | null;
};

export async function verifyNin(nin: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in");
  return apiFetch<IdentityVerifyResult>("/verifications/identity", {
    method: "POST",
    token,
    body: { method: "NIN", nin },
  });
}
