/**
 * ReWorth web API client.
 *
 * Token storage (Phase 1 interim): access + refresh tokens live in localStorage
 * (client cookies). Prefer httpOnly cookies + BFF in a later hardening phase.
 */

import {
  accessTokenNeedsRefresh,
  forceLandingRedirect,
  getAccessToken,
  refreshSession,
} from "./auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
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

export type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
  /** Internal: do not rotate again after one renewal attempt. */
  skipAuthRefresh?: boolean;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, token, headers, skipAuthRefresh, ...rest } = options;
  let bearer = token;
  if (bearer && !skipAuthRefresh && accessTokenNeedsRefresh(bearer)) {
    const outcome = await refreshSession();
    if (outcome === "ok") bearer = getAccessToken();
    else if (outcome === "rejected") {
      forceLandingRedirect();
      throw new ApiError("Session expired", 401);
    }
  }
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    cache: rest.cache ?? "no-store",
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
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
      if (outcome === "rejected") forceLandingRedirect();
    }
    throw new ApiError(
      messageFromBody(parsed, res.statusText || "Request failed"),
      res.status,
      parsed,
    );
  }

  return parsed as T;
}
