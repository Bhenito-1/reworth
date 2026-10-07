"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  EmptyState,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../../components/discovery/DiscoveryListingCard";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import { followSeller, unfollowSeller } from "../../../lib/discovery";
import type { MeResponse } from "../../../lib/types";
import {
  formatResponseMinutes,
  formatStars,
  getPublicProfile,
  listUserReviews,
  replyToReview,
  type PublicProfile,
  type ReviewDto,
} from "../../../lib/trust";

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;
  const router = useRouter();
  const from = useSearchParams().get("from");
  const backHref =
    from && /^\/listings\/[\w-]+$/.test(from) ? from : null;

  const [meId, setMeId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const token = getAccessToken();
    try {
      if (token) {
        try {
          const me = await apiFetch<MeResponse>("/me", { token });
          setMeId(me.id);
        } catch {
          setMeId(null);
        }
      } else {
        setMeId(null);
      }
      const [p, revs] = await Promise.all([
        getPublicProfile(userId, token),
        listUserReviews(userId),
      ]);
      setProfile(p);
      setReviews(revs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Profile not found");
      setProfile(null);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!profile) return;
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to follow sellers", tone: "warn" });
      router.push("/");
      return;
    }
    if (meId === profile.id) return;
    setFollowBusy(true);
    const next = !profile.isFollowing;
    setProfile({ ...profile, isFollowing: next });
    try {
      if (next) await followSeller(profile.id, token);
      else await unfollowSeller(profile.id, token);
      setToast({
        message: next ? "Following" : "Unfollowed",
        tone: "success",
      });
    } catch (err) {
      setProfile({ ...profile, isFollowing: !next });
      setToast({
        message: err instanceof ApiError ? err.message : "Could not update",
        tone: "error",
      });
    } finally {
      setFollowBusy(false);
    }
  }

  async function submitReply(e: FormEvent, reviewId: string) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to reply", tone: "warn" });
      return;
    }
    const text = (replyDrafts[reviewId] ?? "").trim();
    if (!text) {
      setToast({ message: "Write a short reply", tone: "warn" });
      return;
    }
    setReplyBusyId(reviewId);
    try {
      const updated = await replyToReview(token, reviewId, text);
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, ...updated } : r)),
      );
      setReplyDrafts((d) => ({ ...d, [reviewId]: "" }));
      setToast({ message: "Reply posted", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Reply failed",
        tone: "error",
      });
    } finally {
      setReplyBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-10 w-48" label="Loading name" />
          <Skeleton className="h-24 w-full" label="Loading profile" />
          <Skeleton className="h-40 w-full" label="Loading listings" />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Profile unavailable"
          description={error ?? "This member may have left ReWorth."}
          action={
            <Link href="/">
              <Button variant="primary">Back home</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const responseLine = formatResponseMinutes(
    profile.usuallyRespondsWithinMinutes,
  );
  const isSelf = meId === profile.id;
  const canFollow = !isSelf;

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[36vh]"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 40% 0%, rgba(14,159,110,0.14), transparent 68%), radial-gradient(ellipse 50% 40% at 90% 10%, rgba(201,162,39,0.12), transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
              >
                ← Back
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
              >
                ← Back
              </button>
            )}
          </div>
        </header>

        <section className="rw-fade-up" aria-labelledby="profile-name">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--rw-accent-muted)] text-2xl font-semibold text-[var(--rw-accent)]"
              aria-hidden
            >
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                (profile.displayName || "M").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1
                id="profile-name"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                {profile.displayName}
              </h1>
              <p className="mt-2 text-base text-[var(--rw-ink-muted)]">
                {formatStars(profile.avgRating, profile.reviewCount)}
              </p>
              {profile.trustTier ? (
                <p className="mt-2 inline-block rounded-[var(--rw-radius)] bg-[var(--rw-gold-muted)] px-2.5 py-1 text-sm font-semibold text-[var(--rw-ink)]">
                  {profile.trustTier}
                </p>
              ) : null}
            </div>
            {canFollow ? (
              <Button
                variant={profile.isFollowing ? "secondary" : "primary"}
                disabled={followBusy}
                onClick={() => void toggleFollow()}
              >
                {followBusy
                  ? "…"
                  : profile.isFollowing
                    ? "Following"
                    : "Follow"}
              </Button>
            ) : null}
          </div>

          <ul className="mt-6 space-y-2 text-sm sm:text-base">
            {profile.identityVerified ? (
              <li className="font-medium text-[var(--rw-accent)]">
                Identity Verified ✓
              </li>
            ) : null}
            <li>
              {profile.successfulTransactions} successful transaction
              {profile.successfulTransactions === 1 ? "" : "s"}
            </li>
            <li>Member since {profile.memberSince}</li>
            {responseLine ? <li>{responseLine}</li> : null}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="active-listings">
          <h2 id="active-listings" className="text-lg font-semibold">
            Active listings
          </h2>
          {profile.activeListings.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
              No live listings right now.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {profile.activeListings.map((listing) => (
                <li key={listing.id}>
                  <DiscoveryListingCard
                    listing={listing}
                    href={`/listings/${listing.id}?from=/users/${userId}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="text-lg font-semibold">
            Reviews
          </h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
              No published reviews yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {reviews.map((review) => {
                const canReply =
                  meId === review.revieweeId && !review.reply;
                return (
                  <li
                    key={review.id}
                    className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">
                        {review.reviewer?.displayName ?? "Member"}
                      </p>
                      <p className="text-sm text-[var(--rw-gold)]" aria-label={`${review.overall} of 5 stars`}>
                        {"★".repeat(review.overall)}
                        {"☆".repeat(5 - review.overall)}
                      </p>
                    </div>
                    {review.body ? (
                      <p className="mt-2 text-sm leading-relaxed text-[var(--rw-ink-muted)]">
                        {review.body}
                      </p>
                    ) : null}
                    {review.reply ? (
                      <div className="mt-3 border-l-2 border-[var(--rw-accent)] pl-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
                          Reply from {profile.displayName}
                        </p>
                        <p className="mt-1 text-sm">{review.reply}</p>
                      </div>
                    ) : null}
                    {canReply ? (
                      <form
                        className="mt-3 flex flex-col gap-2"
                        onSubmit={(e) => void submitReply(e, review.id)}
                      >
                        <label
                          htmlFor={`reply-${review.id}`}
                          className="text-sm font-medium"
                        >
                          Reply (max 200)
                        </label>
                        <textarea
                          id={`reply-${review.id}`}
                          value={replyDrafts[review.id] ?? ""}
                          onChange={(e) =>
                            setReplyDrafts((d) => ({
                              ...d,
                              [review.id]: e.target.value,
                            }))
                          }
                          maxLength={200}
                          rows={2}
                          className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                          placeholder="Thank them for the fair deal…"
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          disabled={replyBusyId === review.id}
                        >
                          {replyBusyId === review.id
                            ? "Sending…"
                            : "Post reply"}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {toast ? (
        <div className="fixed bottom-8 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
          <Toast
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </main>
  );
}
