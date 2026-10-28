/**
 * Admin API client. Tokens stored in localStorage (Phase 1 interim).
 */

import {
  accessTokenNeedsRefresh,
  forceLoginRedirect,
  getAccessToken,
  refreshSession,
} from "./auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const msg = (body as { message?: unknown }).message;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg) && msg.every((m) => typeof m === "string")) {
    return msg.join(", ");
  }
  return fallback;
}

export async function apiFetch<T>(
  path: string,
  options: Omit<RequestInit, "body"> & {
    body?: unknown;
    token?: string | null;
    /** When true, 401 clears session and hard-refreshes to /login. */
    redirectOnUnauthorized?: boolean;
    /** Internal: do not rotate again after one renewal attempt. */
    skipAuthRefresh?: boolean;
  } = {},
): Promise<T> {
  const { body, token, headers, redirectOnUnauthorized, skipAuthRefresh, ...rest } =
    options;
  let bearer = token;
  if (bearer && !skipAuthRefresh && accessTokenNeedsRefresh(bearer)) {
    const outcome = await refreshSession();
    if (outcome === "ok") bearer = getAccessToken();
    else if (outcome === "rejected" && (redirectOnUnauthorized || Boolean(token))) {
      forceLoginRedirect();
      throw new ApiError("Session expired", 401);
    }
  }
  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && bearer && !skipAuthRefresh) {
      const outcome = await refreshSession(true);
      if (outcome === "ok") {
        return apiFetch<T>(path, {
          ...options,
          token: getAccessToken(),
          skipAuthRefresh: true,
        });
      }
      if (outcome === "rejected" && (redirectOnUnauthorized || Boolean(token))) {
        forceLoginRedirect();
      }
    } else if (
      res.status === 401 &&
      !bearer &&
      (redirectOnUnauthorized || Boolean(token))
    ) {
      forceLoginRedirect();
    }
    throw new ApiError(
      messageFromBody(parsed, res.statusText || "Request failed"),
      res.status,
    );
  }

  return parsed as T;
}

/** Authenticated admin fetch using stored access token. */
export async function adminFetch<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    const outcome = await refreshSession();
    if (outcome !== "ok") {
      if (outcome === "rejected") forceLoginRedirect();
      throw new ApiError("Not signed in", 401);
    }
  } else if (accessTokenNeedsRefresh(token)) {
    const outcome = await refreshSession();
    if (outcome === "rejected") {
      forceLoginRedirect();
      throw new ApiError("Session expired", 401);
    }
  }
  return apiFetch<T>(path, {
    ...options,
    token: getAccessToken(),
    redirectOnUnauthorized: true,
  });
}

export function csvUrl(path: string): string {
  const token = getAccessToken();
  const base = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  // Browser download cannot set Authorization — use query is not supported.
  // Pages should fetch blob with adminFetch pattern instead.
  void token;
  return base;
}

export async function downloadCsv(
  path: string,
  filename: string,
  retried = false,
): Promise<void> {
  let token = getAccessToken();
  if (!token || accessTokenNeedsRefresh(token)) {
    const outcome = await refreshSession();
    if (outcome === "rejected" || !getAccessToken()) {
      forceLoginRedirect();
      throw new ApiError("Not signed in", 401);
    }
    token = getAccessToken();
  }
  const res = await fetch(
    `${API_URL}${path.startsWith("/") ? path : `/${path}`}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" } },
  );
  if (!res.ok) {
    if (res.status === 401 && !retried) {
      const outcome = await refreshSession(true);
      if (outcome === "ok") return downloadCsv(path, filename, true);
      if (outcome === "rejected") forceLoginRedirect();
    }
    throw new ApiError("CSV download failed", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
