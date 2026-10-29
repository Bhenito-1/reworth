"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../../components/discovery/DiscoveryListingCard";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  createCommunityInvite,
  getEstateCommunity,
  listCommunityListings,
  listMyCommunities,
  requestJoinCommunity,
  type EstateCommunityDetail,
} from "../../../lib/estate-communities";
import { sentenceCaseLabel } from "../../../lib/listings";
import type { PublicListing } from "../../../lib/types";

export default function CommunityDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const router = useRouter();

  const [community, setCommunity] = useState<EstateCommunityDetail | null>(
    null,
  );
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setListingsError(null);
    try {
      const token = getAccessToken();
      const detail = await getEstateCommunity(slug, token);
      setCommunity(detail);

      if (token) {
        try {
          const mine = await listMyCommunities(token);
          const match = mine.items.find((m) => m.community.id === detail.id);
          setMembershipId(match?.membershipId ?? null);
        } catch {
          setMembershipId(null);
        }
      }

      try {
        const listRes = await listCommunityListings(detail.id, token);
        setListings(listRes.items ?? []);
      } catch (err) {
        setListings([]);
        setListingsError(
          err instanceof ApiError
            ? err.message
            : "Listings unavailable for this community",
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Community not found");
      setCommunity(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  function requireAuth(): string | null {
    const token = getAccessToken();
    if (!token) {
      setToast("Sign in to continue");
      router.push("/");
      return null;
    }
    return token;
  }

  async function onJoin() {
    if (!community) return;
    const token = requireAuth();
    if (!token) return;
    setBusy(true);
    try {
      await requestJoinCommunity(token, community.id);
      setToast(
        community.privacy === "PUBLIC"
          ? "You’re in"
          : "Join request sent — awaiting approval",
      );
      await load();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  async function onInvite() {
    if (!community) return;
    const token = requireAuth();
    if (!token) return;
    setBusy(true);
    try {
      const invite = await createCommunityInvite(token, community.id, {
        maxUses: 5,
        expiryDays: 7,
      });
      setInviteCode(invite.code);
      setToast("Invite code ready — share with friends");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  const isMember = Boolean(community?.isMember);
  const pending = community?.membershipStatus === "INVITED";

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/communities"
            className="text-sm font-medium text-[var(--rw-accent)]"
          >
            ← Communities
          </Link>
        </header>

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-56" label="Loading community" />
            <Skeleton className="h-24 w-full" label="Loading about" />
          </div>
        ) : error || !community ? (
          <EmptyState
            title="Community unavailable"
            description={error ?? "Not found"}
            action={
              <Link href="/communities">
                <Button variant="secondary">Browse communities</Button>
              </Link>
            }
          />
        ) : (
          <>
            <section className="rw-fade-up">
              <p className="text-sm font-medium text-[var(--rw-ink-muted)]">
                {sentenceCaseLabel(community.type)} ·{" "}
                {sentenceCaseLabel(community.privacy)}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {community.name}
                {community.verified ? (
                  <span className="ml-3 text-base font-medium text-[var(--rw-accent)]">
                    Verified ✓
                  </span>
                ) : null}
              </h1>
              {community.membershipCount != null ? (
                <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                  {community.membershipCount} member
                  {community.membershipCount === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                  {listings.length > 0
                    ? `${listings.length} listing${listings.length === 1 ? "" : "s"}`
                    : "Estate marketplace"}
                </p>
              )}
              <p className="mt-4 max-w-2xl text-[var(--rw-ink-muted)]">
                {community.about || "Estate marketplace on ReWorth."}
              </p>
            </section>

            <div className="mt-6 flex flex-wrap gap-2">
              {!isMember && !pending ? (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void onJoin()}
                >
                  {community.privacy === "PUBLIC"
                    ? "Join community"
                    : "Request to join"}
                </Button>
              ) : null}
              {pending ? (
                <span className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] px-3 py-2 text-sm text-[var(--rw-ink-muted)]">
                  Request pending
                </span>
              ) : null}
              {isMember ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onInvite()}
                >
                  Invite friends
                </Button>
              ) : null}
              {membershipId ? (
                <Link href="/account/communities">
                  <Button variant="ghost" size="sm">
                    Manage membership
                  </Button>
                </Link>
              ) : null}
            </div>

            {inviteCode ? (
              <p
                className="mt-4 rounded-[var(--rw-radius)] bg-[var(--rw-accent-muted)] px-4 py-3 text-sm"
                role="status"
              >
                Invite code:{" "}
                <strong className="tracking-wider">{inviteCode}</strong>
              </p>
            ) : null}

            <section className="mt-10" aria-labelledby="comm-listings">
              <h2
                id="comm-listings"
                className="text-xl font-semibold tracking-tight"
              >
                Community listings
              </h2>
              {listingsError ? (
                <EmptyState
                  title="Listings are members-only"
                  description={
                    community.privacy === "PRIVATE"
                      ? "Join this estate community to browse inventory."
                      : listingsError
                  }
                  action={
                    !isMember ? (
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void onJoin()}
                      >
                        Request to join
                      </Button>
                    ) : undefined
                  }
                />
              ) : listings.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
                  No listings in this community yet.
                </p>
              ) : (
                <ul className="mt-4 flex flex-wrap gap-3">
                  {listings.map((item) => (
                    <li key={item.id} className="w-44 shrink-0">
                      <DiscoveryListingCard listing={item} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </main>
  );
}
