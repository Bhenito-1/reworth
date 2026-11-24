/**
 * Monetization companion (Boost / Featured / Seller Plus) — web.
 * Web monetization helpers (Pro / boosts / referrals).
 */

import { apiFetch } from "./api";

export type BoostQuote = {
  hours: number;
  priceKobo: number;
  feeConfigVersionId: string;
  version: number;
};

export type FeaturedQuote = {
  hours: number;
  priceKobo: number;
  feeConfigVersionId: string;
  version: number;
};

export type SellerPlan = {
  tier: "STARTER" | "PLUS" | string;
  maxActiveListings: number;
  featuredSlotsPerMonth: number;
  analytics: boolean;
  prioritySupport: boolean;
  subscription?: {
    id?: string;
    tier?: string;
    status?: string;
    priceKobo?: number;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  };
};

export const BOOST_DURATIONS_HOURS = [24, 72, 168] as const;

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function quoteBoost(
  token: string,
  hours: number,
): Promise<BoostQuote> {
  return apiFetch<BoostQuote>(`/monetization/boost/quote?hours=${hours}`, {
    token,
  });
}

/** Boost / featured purchase. PENDING until Paystack confirms the charge. */
export type PromotionPurchase = {
  id: string;
  listingId: string;
  kind: "BOOST" | "FEATURED";
  paymentStatus: string;
  active: boolean;
  checkoutUrl?: string;
};

export async function purchaseBoost(
  token: string,
  body: { listingId: string; hours: number; idempotencyKey: string },
): Promise<PromotionPurchase> {
  return apiFetch<PromotionPurchase>("/monetization/boost", {
    method: "POST",
    token,
    body,
  });
}

export async function quoteFeatured(token: string): Promise<FeaturedQuote> {
  return apiFetch<FeaturedQuote>("/monetization/featured/quote", { token });
}

export async function purchaseFeatured(
  token: string,
  body: { listingId: string; idempotencyKey: string },
): Promise<PromotionPurchase> {
  return apiFetch<PromotionPurchase>("/monetization/featured", {
    method: "POST",
    token,
    body,
  });
}

export async function getSellerPlan(token: string): Promise<SellerPlan> {
  return apiFetch<SellerPlan>("/me/seller-plan", { token });
}

/** Seller Plus checkout. The plan switches on after Paystack confirms. */
export async function upgradeSellerPlus(
  token: string,
  idempotencyKey: string,
): Promise<{ paymentStatus: "PENDING" | "SUCCESS"; reference: string; checkoutUrl?: string }> {
  return apiFetch("/me/seller-plan/plus", {
    method: "POST",
    token,
    body: { idempotencyKey },
  });
}

export async function cancelSellerPlus(token: string): Promise<unknown> {
  return apiFetch("/me/seller-plan/cancel", {
    method: "POST",
    token,
  });
}
