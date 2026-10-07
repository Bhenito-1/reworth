"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  leaveCommunity,
  listMyCommunities,
  type MyCommunityMembership,
} from "../../../lib/estate-communities";

export default function MyCommunitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<MyCommunityMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listMyCommunities(token);
      setItems(res.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load communities",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onLeave(membershipId: string) {
    const token = getAccessToken();
    if (!token) return;
    if (!window.confirm("Leave this community?")) return;
    setBusyId(membershipId);
    try {
      await leaveCommunity(token, membershipId);
      setToast("Left community");
      await load();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not leave");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/account"
            className="text-sm font-medium text-[var(--rw-accent)]"
          >
            ← Account
          </Link>
          <Link
            href="/communities"
            className="text-sm font-medium text-[var(--rw-ink-muted)]"
          >
            Browse
          </Link>
        </header>

        <h1 className="text-3xl font-semibold tracking-tight">
          My communities
        </h1>
        <p className="mt-2 text-[var(--rw-ink-muted)]">
          Estate and group memberships on ReWorth.
        </p>

        {loading ? (
          <div className="mt-8 space-y-3" aria-busy="true">
            <Skeleton className="h-16 w-full" label="Loading" />
            <Skeleton className="h-16 w-full" label="Loading" />
          </div>
        ) : error ? (
          <div className="mt-8">
            <EmptyState
              title="Couldn’t load"
              description={error}
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No communities yet"
              description="Join an estate community or redeem an invite."
              action={
                <Link href="/communities">
                  <Button variant="primary">Find communities</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]">
            {items.map((m) => (
              <li
                key={m.membershipId}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    href={`/communities/${m.community.slug}`}
                    className="font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                  >
                    {m.community.name}
                  </Link>
                  <p className="text-sm text-[var(--rw-ink-muted)]">
                    {m.status}
                    {m.community.verified ? " · Verified" : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === m.membershipId}
                  onClick={() => void onLeave(m.membershipId)}
                >
                  {busyId === m.membershipId ? "…" : "Leave"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </main>
  );
}
