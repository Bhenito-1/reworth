"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton } from "@reworth/ui-web";
import { apiFetch, ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

type MineItem = {
  id: string;
  title: string;
  status: string;
  priceKobo: number;
  updatedAt: string;
  reviewState: string;
  reviewLabel: string;
  reviewNote: string | null;
};

type ListingFilter = "all" | "live" | "review" | "rejected" | "sold";

const FILTERS: { id: ListingFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "review", label: "In review" },
  { id: "rejected", label: "Rejected" },
  { id: "sold", label: "Sold" },
];

function groupOf(item: MineItem): Exclude<ListingFilter, "all"> {
  if (item.reviewState === "rejected" || item.status === "REJECTED") {
    return "rejected";
  }
  if (item.status === "SOLD") return "sold";
  if (item.status === "LIVE" || item.status === "RESERVED") return "live";
  return "review";
}

export default function SellingPage() {
  const router = useRouter();
  const [items, setItems] = useState<MineItem[]>([]);
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: MineItem[] }>("/listings/mine", {
        token,
      });
      setItems(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load listings");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    filter === "all" ? items : items.filter((item) => groupOf(item) === filter);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-2xl bg-[var(--rw-bg)] px-4 py-8 text-[var(--rw-ink)] sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">My listings</h1>
      <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
        Live listings, items still in review, and anything that was rejected.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Listing status">
        {FILTERS.map((tab) => {
          const selected = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(tab.id)}
              className={[
                "rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                selected
                  ? "bg-[var(--rw-accent)] text-white"
                  : "border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="mt-8 text-sm text-[var(--rw-error)]" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No listings yet"
            description="When you publish, live, in-review, and rejected listings show up here."
            action={
              <Link href="/sell">
                <Button variant="primary">List an item</Button>
              </Link>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={`No ${FILTERS.find((tab) => tab.id === filter)?.label.toLowerCase()} listings`}
            description="Try another status, or list something new."
          />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {visible.map((item) => {
            const group = groupOf(item);
            return (
              <li
                key={item.id}
                className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title || "Untitled listing"}</p>
                    <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                      {formatNgn({ amountKobo: item.priceKobo })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      group === "rejected"
                        ? "bg-red-50 text-red-700"
                        : group === "review"
                          ? "bg-amber-50 text-amber-800"
                          : group === "live"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]"
                    }`}
                  >
                    {item.reviewLabel}
                  </span>
                </div>
                {item.reviewNote ? (
                  <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                    {item.reviewNote}
                  </p>
                ) : null}
                {group === "rejected" ? (
                  <Link
                    href={`/selling/${item.id}`}
                    className="mt-3 inline-block text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
                  >
                    See why and fix it
                  </Link>
                ) : group === "live" ? (
                  <Link
                    href={`/listings/${item.id}`}
                    className="mt-3 inline-block text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
                  >
                    View listing
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
