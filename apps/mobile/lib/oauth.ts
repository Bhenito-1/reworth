/**
 * Google / Apple OAuth — mobile.
 * Calls POST /auth/oauth/:provider/callback.
 * Local/dev uses the API mock (any idToken); pass a real provider idToken when live verification is enabled.
 */

import { Platform } from "react-native";
import { apiFetch } from "./api";
import { setTokens } from "./auth";

export type OAuthProvider = "google" | "apple";

export type OAuthResult = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

function devicePayload() {
  const platform =
    Platform.OS === "ios"
      ? "IOS"
      : Platform.OS === "android"
        ? "ANDROID"
        : "UNKNOWN";
  return { name: "ReWorth Mobile", platform };
}

/**
 * Complete OAuth. When `idToken` is omitted, sends a deterministic mock token
 * (matches API mock adapter used when real Google/Apple secrets are unset).
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
        device: devicePayload(),
      },
    },
  );
  await setTokens(res.accessToken, res.refreshToken);
  return res;
}
