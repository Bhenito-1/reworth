/**
 * Expo API helper. Tokens via AsyncStorage (Phase 1).
 * Prefer EXPO_PUBLIC_API_URL when injected by the bundler.
 */

import { getAccessToken, refreshSession } from "./auth";

const fromEnv = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.EXPO_PUBLIC_API_URL;

export const API_URL = fromEnv ?? "http://localhost:3001/api/v1";

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
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    cache?: RequestCache;
    /** Internal: do not rotate again after one renewal attempt. */
    retried?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", body, token, retried, cache } = options;
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    cache,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    if (res.status === 401 && token && !retried) {
      const outcome = await refreshSession(true);
      if (outcome === "ok") {
        return apiFetch<T>(path, {
          ...options,
          token: await getAccessToken(),
          retried: true,
        });
      }
    }
    throw new ApiError(
      messageFromBody(parsed, res.statusText || "Request failed"),
      res.status,
    );
  }

  return parsed as T;
}
