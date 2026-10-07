/**
 * Phase 1 interim auth storage — localStorage (document as non-httpOnly).
 * Replace with httpOnly cookies / BFF before production hardening.
 */

const ACCESS_KEY = "rw_access_token";
const REFRESH_KEY = "rw_refresh_token";
const REFRESH_LOCK_KEY = "rw_refresh_lock";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

/** Renew this long before `exp` so a request does not race the cutoff. */
const REFRESH_SKEW_MS = 30_000;

export type RefreshOutcome = "ok" | "rejected" | "offline";

/** Fired in-tab when tokens change so root can switch landing ↔ home. */
export const AUTH_CHANGED_EVENT = "rw-auth-changed";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function notifyAuthChanged(): void {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: TokenPair): void {
  if (!canUseStorage()) return;
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  notifyAuthChanged();
}

export function clearTokens(): void {
  sessionGeneration += 1;
  if (!canUseStorage()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  notifyAuthChanged();
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

/** True when JWT `exp` is in the past (or token is unreadable). */
export function isAccessTokenExpired(token: string): boolean {
  const exp = accessExpiryMs(token);
  if (exp === "none") return false;
  if (exp === "bad") return true;
  return exp <= Date.now();
}

/** True when the access token is expired or inside the renewal window. */
export function accessTokenNeedsRefresh(token: string): boolean {
  const exp = accessExpiryMs(token);
  if (exp === "none") return false;
  if (exp === "bad") return true;
  return exp <= Date.now() + REFRESH_SKEW_MS;
}

/**
 * Signed in while the access token is valid, or a refresh token can renew it.
 * The access token itself only lasts 15 minutes.
 */
export function isAuthed(): boolean {
  const token = getAccessToken();
  if (token && !isAccessTokenExpired(token)) return true;
  return Boolean(getRefreshToken());
}

let refreshInFlight: { force: boolean; promise: Promise<RefreshOutcome> } | null =
  null;
/** Bumped on logout so an in-flight refresh cannot sign the user back in. */
let sessionGeneration = 0;

/**
 * Exchange the stored refresh token for a new pair.
 * One renewal at a time: the API revokes the whole family if a rotated token is reused.
 * `force` skips the "token still fresh" shortcut after the server has rejected it.
 */
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
  const generation = sessionGeneration;
  if (!force) {
    const current = getAccessToken();
    if (current && !accessTokenNeedsRefresh(current)) return "ok";
  }

  if (await anotherTabIsRefreshing()) {
    const latest = getAccessToken();
    if (latest && !accessTokenNeedsRefresh(latest)) return "ok";
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) return "rejected";

  localStorage.setItem(REFRESH_LOCK_KEY, String(Date.now()));
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
      clearTokens();
      return "rejected";
    }
    if (!res.ok) return "offline";
    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (generation !== sessionGeneration) return "rejected";
    if (!data.accessToken || !data.refreshToken) {
      clearTokens();
      return "rejected";
    }
    if (generation !== sessionGeneration) return "rejected";
    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return "ok";
  } catch {
    return "offline";
  } finally {
    localStorage.removeItem(REFRESH_LOCK_KEY);
  }
}

async function anotherTabIsRefreshing(): Promise<boolean> {
  const started = Number(localStorage.getItem(REFRESH_LOCK_KEY) || 0);
  if (!started || Date.now() - started > 8_000) return false;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const access = getAccessToken();
    if (access && !accessTokenNeedsRefresh(access)) return true;
    const lock = Number(localStorage.getItem(REFRESH_LOCK_KEY) || 0);
    if (!lock || Date.now() - lock > 8_000) return false;
  }
  return false;
}

/**
 * Guest-only routes: landing, login, and register/onboarding.
 * Everything else requires a session.
 */
export function isPublicAuthPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return true;
  }
  return false;
}

/**
 * Clear session and hard-navigate to landing so guests always see
 * Login / Create account (logout, expired, or missing session).
 */
export function forceLandingRedirect(): void {
  clearTokens();
  if (!canUseStorage()) return;
  if (window.location.pathname === "/") return;
  window.location.replace("/");
}
