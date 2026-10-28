/**
 * Phase 8 admin session — localStorage (prefer httpOnly cookies before prod).
 */

import { useSyncExternalStore } from "react";

const ACCESS_KEY = "rw_admin_access";
const REFRESH_KEY = "rw_admin_refresh";
const REFRESH_LOCK_KEY = "rw_admin_refresh_lock";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const REFRESH_SKEW_MS = 30_000;

export type RefreshOutcome = "ok" | "rejected" | "offline";
const ROLES_KEY = "rw_admin_roles";
const EMAIL_KEY = "rw_admin_email";
const SESSION_EVENT = "rw-admin-session";
const SERVER_ROLES: string[] = [];

let roleCacheKey = "";
let roleCache: string[] = SERVER_ROLES;

function emitSession() {
  if (!canUse()) return;
  roleCacheKey = "\0";
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribeAdminSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SESSION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
}

function rolesSnapshot(): string[] {
  const next = getRoles();
  const key = next.join("|");
  if (key === roleCacheKey) return roleCache;
  roleCacheKey = key;
  roleCache = next;
  return roleCache;
}

/** Roles for render. The server snapshot is empty so hydration matches. */
export function useAdminRoles(): string[] {
  return useSyncExternalStore(
    subscribeAdminSession,
    rolesSnapshot,
    () => SERVER_ROLES,
  );
}

/** Email for render. The server snapshot is null so hydration matches. */
export function useAdminEmail(): string | null {
  return useSyncExternalStore(subscribeAdminSession, getEmail, () => null);
}

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  roles: string[];
  email: string;
};

function canUse(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  if (!canUse()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!canUse()) return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getRoles(): string[] {
  if (!canUse()) return [];
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function getEmail(): string | null {
  if (!canUse()) return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function setSession(session: AdminSession): void {
  if (!canUse()) return;
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem(ROLES_KEY, JSON.stringify(session.roles));
  localStorage.setItem(EMAIL_KEY, session.email);
  emitSession();
}

export function clearSession(): void {
  if (!canUse()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ROLES_KEY);
  localStorage.removeItem(EMAIL_KEY);
  emitSession();
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

export function accessTokenNeedsRefresh(token: string): boolean {
  const exp = accessExpiryMs(token);
  if (exp === "none") return false;
  if (exp === "bad") return true;
  return exp <= Date.now() + REFRESH_SKEW_MS;
}

/** Signed in while the access token is valid, or a refresh token can renew it. */
export function isAuthed(): boolean {
  const token = getAccessToken();
  if (token && !isAccessTokenExpired(token)) return true;
  return Boolean(getRefreshToken());
}

let refreshInFlight: { force: boolean; promise: Promise<RefreshOutcome> } | null =
  null;

/** One renewal at a time. Reusing a rotated refresh token revokes the family. */
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
  const email = getEmail() ?? "";
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
      clearSession();
      return "rejected";
    }
    if (!res.ok) return "offline";
    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!data.accessToken || !data.refreshToken) {
      clearSession();
      return "rejected";
    }
    const roles = rolesFromAccessToken(data.accessToken);
    setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      roles: roles.length ? roles : getRoles(),
      email,
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
 * Clear local session and hard-navigate to login so the UI refreshes
 * immediately (logout, expired session, or unauthenticated).
 */
export function forceLoginRedirect(): void {
  clearSession();
  if (!canUse()) return;
  if (window.location.pathname === "/login") return;
  window.location.replace("/login");
}

/** Decode JWT payload (roles live on access token). */
export function rolesFromAccessToken(token: string): string[] {
  try {
    const part = token.split(".")[1];
    if (!part) return [];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { roles?: string[] };
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

export function hasAnyRole(roles: string[], allowed: readonly string[]): boolean {
  if (roles.includes("SUPER_ADMIN")) return true;
  return allowed.some((r) => roles.includes(r));
}

export function canSeeFinance(roles: string[]): boolean {
  return hasAnyRole(roles, ["FINANCE"]);
}

export const NAV_ROLES = {
  dashboard: [
    "SUPER_ADMIN",
    "OPERATIONS",
    "FINANCE",
    "CUSTOMER_SUPPORT",
    "RISK_FRAUD",
    "MARKETING",
    "CONTENT_MODERATOR",
  ],
  users: ["SUPER_ADMIN", "OPERATIONS", "CUSTOMER_SUPPORT", "RISK_FRAUD"],
  listings: ["SUPER_ADMIN", "OPERATIONS", "CONTENT_MODERATOR"],
  orders: ["SUPER_ADMIN", "OPERATIONS", "FINANCE", "CUSTOMER_SUPPORT"],
  disputes: ["SUPER_ADMIN", "OPERATIONS", "FINANCE", "CUSTOMER_SUPPORT"],
  verifications: [
    "SUPER_ADMIN",
    "OPERATIONS",
    "RISK_FRAUD",
    "CUSTOMER_SUPPORT",
  ],
  reports: [
    "SUPER_ADMIN",
    "OPERATIONS",
    "CONTENT_MODERATOR",
    "RISK_FRAUD",
  ],
  fraud: ["SUPER_ADMIN", "OPERATIONS", "RISK_FRAUD"],
  support: ["SUPER_ADMIN", "OPERATIONS", "CUSTOMER_SUPPORT"],
  catalog: [
    "SUPER_ADMIN",
    "OPERATIONS",
    "CONTENT_MODERATOR",
    "MARKETING",
  ],
  promotions: ["SUPER_ADMIN", "OPERATIONS", "MARKETING"],
  analytics: ["SUPER_ADMIN", "OPERATIONS", "FINANCE", "MARKETING"],
  finance: ["SUPER_ADMIN", "FINANCE", "OPERATIONS"],
  audit: ["SUPER_ADMIN", "OPERATIONS", "RISK_FRAUD"],
  security: [
    "SUPER_ADMIN",
    "OPERATIONS",
    "FINANCE",
    "CUSTOMER_SUPPORT",
    "RISK_FRAUD",
    "MARKETING",
    "CONTENT_MODERATOR",
  ],
} as const;

/** Map admin app paths → allowed roles (page-level gate). */
export function rolesForPath(pathname: string): readonly string[] | null {
  if (pathname === "/login") return null;
  if (pathname === "/" || pathname === "") return NAV_ROLES.dashboard;
  const map: Record<string, readonly string[]> = {
    "/users": NAV_ROLES.users,
    "/listings": NAV_ROLES.listings,
    "/orders": NAV_ROLES.orders,
    "/disputes": NAV_ROLES.disputes,
    "/verifications": NAV_ROLES.verifications,
    "/reports": NAV_ROLES.reports,
    "/appeals": NAV_ROLES.reports,
    "/fraud": NAV_ROLES.fraud,
    "/support": NAV_ROLES.support,
    "/catalog": NAV_ROLES.catalog,
    "/communities": NAV_ROLES.catalog,
    "/promotions": NAV_ROLES.promotions,
    "/analytics": NAV_ROLES.analytics,
    "/finance": NAV_ROLES.finance,
    "/audit": NAV_ROLES.audit,
    "/security": NAV_ROLES.security,
    "/pro-sellers": NAV_ROLES.listings,
    "/corporate": NAV_ROLES.listings,
    "/partners": NAV_ROLES.catalog,
    "/inspections": NAV_ROLES.orders,
    "/referrals": NAV_ROLES.promotions,
  };
  for (const [prefix, roles] of Object.entries(map)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return roles;
    }
  }
  return NAV_ROLES.dashboard;
}
