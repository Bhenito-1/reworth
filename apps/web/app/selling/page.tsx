"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton } from "@reworth/ui-web";
import { apiFetch, ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { removeListing } from "../../lib/inventory";

type MineItem = {
  id: string;
  title: string;
  status: string;
  priceKobo: number;
  updatedAt: string;
  reviewState: string;
  reviewLabel: string;
  reviewNote: string | null;
  canRemove?: boolean;
  hasAcceptedOrder?: boolean;
};

type ListingFilter =
  | "all"
  | "live"
  | "review"
  | "rejected"
  | "sold"
  | "closed"
  | "removed";

const FILTERS: { id: ListingFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "review", label: "In review" },
  { id: "rejected", label: "Rejected" },
  { id: "sold", label: "Sold" },
  { id: "closed", label: "Closed" },
  { id: "removed", label: "Removed" },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "LIVE":
      return "bg-emerald-50 text-emerald-800";
    case "RESERVED":
      return "bg-blue-50 text-blue-800";
    case "SOLD":
      return "bg-slate-100 text-slate-800";
    case "UNDER_REVIEW":
      return "bg-amber-50 text-amber-800";
    case "REJECTED":
      return "bg-red-50 text-red-700";
    case "DRAFT":
      return "bg-zinc-100 text-zinc-700";
    case "EXPIRED":
      return "bg-orange-50 text-orange-800";
    case "REMOVED":
      return "bg-rose-50 text-rose-800";
    default:
      return "bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]";
  }
}

function groupOf(item: MineItem): Exclude<ListingFilter, "all"> | "draft" {
  if (item.reviewState === "rejected" || item.status === "REJECTED") {
    return "rejected";
  }
  if (item.status === "SOLD") return "sold";
  if (item.status === "REMOVED" || item.reviewState === "removed") return "removed";
  if (item.status === "EXPIRED" || item.reviewState === "closed") return "closed";
  if (item.status === "LIVE" || item.status === "RESERVED") return "live";
  if (item.status === "UNDER_REVIEW" || item.reviewState === "waiting") return "review";
  if (item.status === "DRAFT") return "draft";
  return "closed";
}

function removalMessage(item: MineItem): string {
  const title = item.title || "this listing";
  if (item.status === "DRAFT") {
    return `Delete the draft “${title}”? This cannot be undone.`;
  }
  if (item.hasAcceptedOrder) {
    return `Remove “${title}” from the marketplace? An order for this listing is already accepted. You still have to fulfil that order. If you do not, your account can be sanctioned. The remaining units will leave the marketplace and this listing will be marked Removed.`;
  }
  return `Remove “${title}” from the marketplace? The remaining units will leave the marketplace and this listing will be marked Removed.`;
}

export default function SellingPage() {
  const router = useRouter();
  const [items, setItems] = useState<MineItem[]>([]);
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  async function onRemove(item: MineItem) {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const confirmed = window.confirm(removalMessage(item));
    if (!confirmed) return;
    setRemovingId(item.id);
    setError(null);
    try {
      await removeListing(token, item.id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : item.status === "DRAFT"
            ? "Could not delete this draft"
            : "Could not remove this listing",
      );
    } finally {
      setRemovingId(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    filter === "all" ? items : items.filter((item) => groupOf(item) === filter);
  const shown = expanded ? visible : visible.slice(0, 10);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-2xl bg-[var(--rw-bg)] px-4 py-8 text-[var(--rw-ink)] sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">My listings</h1>
      <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
        Every listing you have made, including live, in review, rejected, sold, closed, and removed.
      </p>

      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Listing status">
        {FILTERS.map((tab) => {
          const selected = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setFilter(tab.id);
                setExpanded(false);
              }}
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
          {shown.map((item) => {
            const group = groupOf(item);
            return (
              <li
                key={item.id}
                className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-4"
              >
                <Link href={`/listings/${item.id}`} className="block">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{item.title || "Untitled listing"}</p>
                      <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                        {formatNgn({ amountKobo: item.priceKobo })}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                    >
                      {item.reviewLabel}
                    </span>
                  </div>
                  {item.reviewNote ? (
                    <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                      {item.reviewNote}
                    </p>
                  ) : null}
                </Link>
                {group === "rejected" ? (
                  <Link
                    href={`/selling/${item.id}`}
                    className="mt-3 inline-block text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
                  >
                    See why and fix it
                  </Link>
                ) : null}
                {item.status === "DRAFT" || item.canRemove ? (
                  <button
                    type="button"
                    className="mt-3 block text-sm font-medium text-[var(--rw-error)] hover:underline disabled:opacity-50"
                    disabled={removingId === item.id}
                    onClick={() => void onRemove(item)}
                  >
                    {removingId === item.id
                      ? item.status === "DRAFT"
                        ? "Deleting…"
                        : "Removing…"
                      : item.status === "DRAFT"
                        ? "Delete draft"
                        : "Remove from marketplace"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!loading && visible.length > 10 && !expanded ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setExpanded(true)}>
            See more
          </Button>
        </div>
      ) : null}
    </main>
  );
}
