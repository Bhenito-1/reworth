/**
 * Phase 7 — Reviews + public profile API helpers (mobile).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";
import type { PublicListing } from "./types";

export type TrustBadge = "Top Seller" | "Trusted";

export type ReviewDto = {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  overall: number;
  accuracy: number;
  communication: number;
  punctuality: number;
  transactionExperience: number;
  body: string | null;
  photoKeys: string[];
  listingTitle?: string | null;
  similar?: boolean;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  reviewer?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type PublicProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  memberSince: number;
  identityVerified: boolean;
  successfulTransactions: number;
  avgRating: number | null;
  reviewCount: number;
  trustTier: TrustBadge | null;
  usuallyRespondsWithinMinutes: number | null;
  activeListings: PublicListing[];
  isFollowing: boolean | null;
};

export type CreateReviewBody = {
  overall: number;
  accuracy: number;
  communication: number;
  punctuality: number;
  transactionExperience: number;
  body?: string;
};

export type OrderReviewUiState = "form" | "waiting" | "done";

const pendingKey = (orderId: string) => `rw_review_pending_${orderId}`;

export async function markOrderReviewPending(orderId: string) {
  try {
    await AsyncStorage.setItem(pendingKey(orderId), "1");
  } catch {
    /* ignore */
  }
}

export async function clearOrderReviewPending(orderId: string) {
  try {
    await AsyncStorage.removeItem(pendingKey(orderId));
  } catch {
    /* ignore */
  }
}

export async function isOrderReviewPendingLocal(
  orderId: string,
): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(pendingKey(orderId))) === "1";
  } catch {
    return false;
  }
}

export async function getPublicProfile(
  userId: string,
  token?: string | null,
): Promise<PublicProfile> {
  return apiFetch<PublicProfile>(`/users/${userId}`, {
    token: token ?? undefined,
  });
}

export async function listUserReviews(userId: string): Promise<ReviewDto[]> {
  return apiFetch<ReviewDto[]>(`/users/${userId}/reviews`);
}

export type ListingReviewsResponse = {
  soldUnits: number;
  average: number | null;
  count: number;
  items: ReviewDto[];
  seller?: {
    average: number | null;
    count: number;
    items: ReviewDto[];
  };
};

export async function listListingReviews(
  listingId: string,
): Promise<ListingReviewsResponse> {
  return apiFetch<ListingReviewsResponse>(`/listings/${listingId}/reviews`);
}

export async function createOrderReview(
  token: string,
  orderId: string,
  body: CreateReviewBody,
): Promise<ReviewDto> {
  return apiFetch<ReviewDto>(`/orders/${orderId}/reviews`, {
    method: "POST",
    token,
    body,
  });
}

export async function replyToReview(
  token: string,
  reviewId: string,
  text: string,
): Promise<ReviewDto> {
  return apiFetch<ReviewDto>(`/reviews/${reviewId}/reply`, {
    method: "POST",
    token,
    body: { text },
  });
}

export async function followSeller(
  token: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/users/${userId}/follow`, { method: "POST", token });
}

export async function unfollowSeller(
  token: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/users/${userId}/follow`, { method: "DELETE", token });
}

export async function resolveOrderReviewState(opts: {
  orderId: string;
  meId: string;
  counterpartId: string;
}): Promise<{ state: OrderReviewUiState }> {
  const published = await listUserReviews(opts.counterpartId);
  const mine = published.find(
    (r) => r.orderId === opts.orderId && r.reviewerId === opts.meId,
  );
  if (mine) {
    await clearOrderReviewPending(opts.orderId);
    return { state: "done" };
  }
  if (await isOrderReviewPendingLocal(opts.orderId)) {
    return { state: "waiting" };
  }
  return { state: "form" };
}

export function formatStars(avg: number | null, count: number): string {
  if (avg == null || count === 0) return "New · no reviews yet";
  return `★ ${avg.toFixed(1)} (${count})`;
}

export function formatResponseShort(
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `Responds in ~${minutes} min`;
  return `Responds in ~${Math.round(minutes / 60)} hr`;
}

export function formatResponseMinutes(
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `Usually responds within ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `Usually responds within ${hours} hour${hours === 1 ? "" : "s"}`;
}
