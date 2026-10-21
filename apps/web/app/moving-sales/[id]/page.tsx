"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../../components/discovery/DiscoveryListingCard";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  followMovingSale,
  getMovingSale,
  recordMovingSaleEvent,
  unfollowMovingSale,
  type MovingSaleDetail,
} from "../../../lib/moving-sales";

function countdownLabel(deadline: string): string {
  const end = new Date(deadline).getTime();
  const now = Date.now();
  const ms = end - now;
  if (Number.isNaN(end)) return "Deadline unknown";
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m left`;
}

export default function MovingSalePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [sale, setSale] = useState<MovingSaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const data = await getMovingSale(id, token);
      setSale(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Moving sale not found");
      setSale(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id || !sale) return;
    const token = getAccessToken();
    void recordMovingSaleEvent(id, "moving_sale_viewed", undefined, token).catch(
      () => undefined,
    );
  }, [id, sale?.id]);

  const liveItems = useMemo(
    () =>
      (sale?.items ?? []).filter((l) =>
        ["LIVE", "RESERVED"].includes(l.status),
      ),
    [sale],
  );

  async function toggleFollow() {
    if (!id) return;
    const token = getAccessToken();
    if (!token) {
      setToast("Sign in to follow");
      router.push("/");
      return;
    }
    setFollowBusy(true);
    try {
      if (sale?.followed) {
        await unfollowMovingSale(token, id);
        setSale((s) => (s ? { ...s, followed: false } : s));
        setToast("Unfollowed");
      } else {
        await followMovingSale(token, id);
        setSale((s) => (s ? { ...s, followed: true } : s));
        setToast("Following — you’ll get updates");
      }
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not update follow");
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-end gap-4">
          <Link
            href="/moving-sales/new"
            className="text-sm font-medium text-[var(--rw-accent)]"
          >
            Create moving sale
          </Link>
        </header>

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-64" label="Loading title" />
            <Skeleton className="h-24 w-full" label="Loading details" />
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-52 w-44 shrink-0 rounded-[var(--rw-radius-lg)]"
                  label="Loading listing"
                />
              ))}
            </div>
          </div>
        ) : error || !sale ? (
          <EmptyState
            title="Moving sale unavailable"
            description={error ?? "Not found"}
            action={
              <Link href="/">
                <Button variant="secondary">Back home</Button>
              </Link>
            }
          />
        ) : (
          <>
            <section className="rw-fade-up">
              <p className="text-sm font-medium text-[var(--rw-accent)]">
                Moving sale · {countdownLabel(sale.deadline)}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {sale.title}
              </h1>
              {sale.blurb ? (
                <p className="mt-3 max-w-2xl text-[var(--rw-ink-muted)]">
                  {sale.blurb}
                </p>
              ) : null}
              <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
                {sale.itemCount} item{sale.itemCount === 1 ? "" : "s"} ·{" "}
                {formatNgn({ amountKobo: sale.combinedAskingPriceKobo })}{" "}
                combined
                {sale.community ? ` · ${sale.community}` : ""}
              </p>
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                Deadline{" "}
                <time dateTime={sale.deadline}>
                  {new Date(sale.deadline).toLocaleString("en-NG")}
                </time>
              </p>
            </section>

            <section
              className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
              aria-label="Seller"
            >
              <Link
                href={`/users/${sale.seller.id}`}
                className="font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              >
                {sale.seller.displayName}
              </Link>
              <Button
                variant={sale.followed ? "secondary" : "primary"}
                size="sm"
                disabled={followBusy}
                onClick={() => void toggleFollow()}
              >
                {followBusy
                  ? "…"
                  : sale.followed
                    ? "Following"
                    : "Follow sale"}
              </Button>
            </section>

            <section className="mt-10" aria-labelledby="ms-items">
              <h2 id="ms-items" className="text-xl font-semibold tracking-tight">
                Items in this sale
              </h2>
              {liveItems.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
                  No live items yet.
                </p>
              ) : (
                <ul className="mt-4 flex flex-wrap gap-3">
                  {liveItems.map((item) => (
                    <li
                      key={item.id}
                      className="w-44 shrink-0"
                      onClick={() => {
                        const token = getAccessToken();
                        void recordMovingSaleEvent(
                          id!,
                          "moving_sale_item_click",
                          { listingId: item.id },
                          token,
                        ).catch(() => undefined);
                      }}
                    >
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
