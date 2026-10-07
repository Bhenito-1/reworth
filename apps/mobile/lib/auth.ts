import AsyncStorage from "@react-native-async-storage/async-storage";

declare function atob(data: string): string;

const ACCESS_KEY = "rw_access_token";
const REFRESH_KEY = "rw_refresh_token";

const API_URL =
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const REFRESH_SKEW_MS = 30_000;

export type RefreshOutcome = "ok" | "rejected" | "offline";

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** App registers this to return to the landing screen on session loss. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized() {
  unauthorizedHandler?.();
}

export async function getAccessToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(ACCESS_KEY);
  if (token && !accessTokenNeedsRefresh(token)) return token;
  if (!token && !(await getRefreshToken())) return null;
  const outcome = await refreshSession();
  if (outcome === "ok") return AsyncStorage.getItem(ACCESS_KEY);
  if (outcome === "offline" && token) return token;
  return null;
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ]);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

function accessExpiryMs(token: string): number | "none" | "bad" {
  try {
    const part = token.split(".")[1];
    if (!part) return "bad";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return "none";
    return payload.exp * 1000;
  } catch {
    return "bad";
  }
}

export function isAccessTokenExpired(token: string): boolean {
  const exp = accessExpiryMs(token);
  if (exp === "none") return false;
  if (exp === "bad") return true;
  return exp <= Date.now();
}

export function accessTokenNeedsRefresh(token: string): boolean {
  const exp = accessExpiryMs(token);
  if (exp === "none") return false;
  if (exp === "bad") return true;
  return exp <= Date.now() + REFRESH_SKEW_MS;
}

let refreshInFlight: { force: boolean; promise: Promise<RefreshOutcome> } | null =
  null;

/** One renewal at a time. A reused refresh token revokes the whole session family. */
export function refreshSession(force = false): Promise<RefreshOutcome> {
  if (refreshInFlight) {
    if (refreshInFlight.force || !force) return refreshInFlight.promise;
    return refreshInFlight.promise.then((outcome) =>
      outcome === "ok" ? refreshSession(true) : outcome,
    );
  }
  const promise = performRefresh(force).finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = { force, promise };
  return promise;
}

async function performRefresh(force: boolean): Promise<RefreshOutcome> {
  const current = await AsyncStorage.getItem(ACCESS_KEY);
  if (!force && current && !accessTokenNeedsRefresh(current)) return "ok";
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    if (current) {
      await clearTokens();
      notifyUnauthorized();
    }
    return "rejected";
  }
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.status === 401 || res.status === 403) {
      await clearTokens();
      notifyUnauthorized();
      return "rejected";
    }
    if (!res.ok) return "offline";
    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!data.accessToken || !data.refreshToken) {
      await clearTokens();
      notifyUnauthorized();
      return "rejected";
    }
    await setTokens(data.accessToken, data.refreshToken);
    return "ok";
  } catch {
    return "offline";
  }
}
