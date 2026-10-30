/**
 * Shared Playwright helpers for ReWorth golden-path e2e (API-assisted).
 *
 * Env:
 *   API_BASE_URL          default http://localhost:3001/api/v1
 *   WEB_BASE_URL          default http://localhost:3000
 *   E2E_SELLER_EMAIL      default ori@demo.reworth.ng
 *   E2E_SELLER_PASSWORD   default DemoOri!2026
 *   E2E_SELLER_PHONE      default +2348010000001
 *   E2E_BUYER_EMAIL       default ayo@demo.reworth.ng
 *   E2E_BUYER_PASSWORD    default DemoAyo!2026
 *   E2E_ADMIN_EMAIL       default admin@example.com (Super Admin from main seed)
 *   E2E_ADMIN_PASSWORD    default change-me-strong-password
 */
import { APIRequestContext, expect, test } from '@playwright/test';

export const API_BASE =
  process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1';
export const WEB_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3000';

export const DEMO = {
  seller: {
    phone: process.env.E2E_SELLER_PHONE ?? '+2348010000001',
    email: process.env.E2E_SELLER_EMAIL ?? 'ori@demo.reworth.ng',
    password: process.env.E2E_SELLER_PASSWORD ?? 'DemoOri!2026',
  },
  buyer: {
    email: process.env.E2E_BUYER_EMAIL ?? 'ayo@demo.reworth.ng',
    password: process.env.E2E_BUYER_PASSWORD ?? 'DemoAyo!2026',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
    password:
      process.env.E2E_ADMIN_PASSWORD ?? 'change-me-strong-password',
  },
};

export async function apiHealthy(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${API_BASE}/healthz`, { timeout: 5_000 });
    return res.ok();
  } catch {
    return false;
  }
}

/** Skip unless the API is up. A required E2E run fails instead of skipping. */
export async function skipUnlessApiUp(request: APIRequestContext) {
  const ok = await apiHealthy(request);
  if (!ok && process.env.E2E_REQUIRED === '1') {
    throw new Error(`API not reachable at ${API_BASE}/healthz`);
  }
  test.skip(!ok, `API not reachable at ${API_BASE}/healthz`);
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ accessToken: string; userId: string }> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: {
      email,
      password,
      device: { name: 'e2e-playwright', platform: 'WEB' },
    },
  });
  if (!res.ok()) {
    const message = `login failed for ${email} (${res.status()}) — run pnpm prisma:seed && pnpm seed:staging`;
    if (process.env.E2E_REQUIRED === '1') {
      throw new Error(message);
    }
    test.skip(true, message);
  }
  const body = await res.json();
  expect(body.accessToken).toBeTruthy();
  return {
    accessToken: body.accessToken as string,
    userId: body.userId as string,
  };
}

export function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function jsonOrThrow<T = unknown>(
  res: { ok: () => boolean; status: () => number; text: () => Promise<string>; json: () => Promise<unknown> },
  label: string,
): Promise<T> {
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`${label} → ${res.status()}: ${text}`);
  }
  return (await res.json()) as T;
}
