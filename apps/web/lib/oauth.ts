/**
 * Google / Apple OAuth — web companion.
 * Calls POST /auth/oauth/:provider/callback (mock adapter when secrets unset).
 */

import { apiFetch } from "./api";
import { setTokens } from "./auth";

export type OAuthProvider = "google" | "apple";

export type OAuthResult = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

/**
 * Complete OAuth. When `idToken` is omitted, uses the API mock token path.
 */
export async function completeOAuth(
  provider: OAuthProvider,
  idToken?: string,
): Promise<OAuthResult> {
  const res = await apiFetch<OAuthResult>(
    `/auth/oauth/${provider}/callback`,
    {
      method: "POST",
      body: {
        idToken: idToken?.trim() || `mock-${provider}-id-token`,
        device: { name: "ReWorth Web", platform: "WEB" },
      },
    },
  );
  setTokens({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
  });
  return res;
}
