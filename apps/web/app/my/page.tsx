"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../components/discovery/DiscoveryListingCard";
import { ApiError } from "../../lib/api";
import { CONDITION_LABELS } from "../../lib/listings";
import { getAccessToken } from "../../lib/auth";
import { addToCart } from "../../lib/cart";
import {
  buildSearchQueryString,
  compactFilters,
  deleteSavedSearch,
  getMeFavourites,
  savedListingCanCart,
  savedListingNote,
  unfollowSeller,
  unfavouriteListing,
  updateSavedSearch,
} from "../../lib/discovery";
import type {
  FavouriteItem,
  FollowedSeller,
  MeFavouritesResponse,
  PublicListing,
  SavedSearch,
  SearchFilters,
} from "../../lib/types";

type Tab = "items" | "sellers" | "searches";

export default function MyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("items");
  const [data, setData] = useState<MeFavouritesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getMeFavourites(token);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load saved");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFavourite(listing: PublicListing) {
    const token = getAccessToken();
    if (!token) return;
    try {
      await unfavouriteListing(listing.id, token);
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((i) => i.listing.id !== listing.id),
            }
          : prev,
      );
      setToast({ message: "Removed from wishlist", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Failed",
        tone: "error",
      });
    }
  }

  async function addListingToCart(listing: PublicListing) {
    const token = getAccessToken();
    if (!token) return;
    try {
      await addToCart(token, listing.id);
      setToast({ message: "Added to cart", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not add to cart",
        tone: "error",
      });
    }
  }

  async function removeSeller(seller: FollowedSeller) {
    const token = getAccessToken();
    if (!token) return;
    try {
      await unfollowSeller(seller.seller.id, token);
      setData((prev) =>
        prev
          ? {
              ...prev,
              sellers: prev.sellers.filter((s) => s.followId !== seller.followId),
            }
          : prev,
      );
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Failed",
        tone: "error",
      });
    }
  }

  async function removeSearch(search: SavedSearch) {
    const token = getAccessToken();
    if (!token) return;
    try {
      await deleteSavedSearch(token, search.id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              searches: prev.searches.filter((s) => s.id !== search.id),
            }
          : prev,
      );
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Failed",
        tone: "error",
      });
    }
  }

  async function patchSearch(
    search: SavedSearch,
    patch: { paused?: boolean; digestEnabled?: boolean },
  ) {
    const token = getAccessToken();
    if (!token) return;
    try {
      const updated = await updateSavedSearch(token, search.id, patch);
      setData((prev) =>
        prev
          ? {
              ...prev,
              searches: prev.searches.map((s) =>
                s.id === search.id ? { ...s, ...updated } : s,
              ),
            }
          : prev,
      );
      setToast({
        message: patch.paused != null
          ? patch.paused
            ? "Alerts paused"
            : "Alerts resumed"
          : patch.digestEnabled
            ? "Daily digest on"
            : "Daily digest off",
        tone: "success",
      });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not update",
        tone: "error",
      });
    }
  }

  function openSavedSearch(search: SavedSearch) {
    const filters = compactFilters(search.filters as SearchFilters);
    const qs = buildSearchQueryString(filters);
    router.push(`/search${qs}`);
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Saved</h1>
        <p className="mt-1 text-[var(--rw-ink-muted)]">
          Wishlist items, sellers, and searches you follow.
        </p>

        <div
          className="mt-6 flex gap-2"
          role="tablist"
          aria-label="Saved sections"
        >
          {(
            [
              ["items", "Wishlist"],
              ["sellers", "Sellers"],
              ["searches", "Searches"],
            ] as const
          ).map(([id, label]) => (
            <Chip
              key={id}
              role="tab"
              aria-selected={tab === id}
              selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "searches" && data
                ? (() => {
                    const n = data.searches.reduce(
                      (acc, s) => acc + (s.newMatchesCount || 0),
                      0,
                    );
                    return n > 0 ? ` (${n})` : "";
                  })()
                : ""}
            </Chip>
          ))}
        </div>

        <div className="mt-8" role="tabpanel">
          {loading ? (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-52 w-[7.5rem] shrink-0 rounded-[var(--rw-radius-lg)]"
                  label="Loading"
                />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              title="Couldn’t load"
              description={error}
              action={
                <Button variant="primary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          ) : tab === "items" ? (
            <ItemsTab
              items={data?.items ?? []}
              onToggle={toggleFavourite}
              onAddToCart={addListingToCart}
            />
          ) : tab === "sellers" ? (
            <SellersTab
              sellers={data?.sellers ?? []}
              onUnfollow={removeSeller}
            />
          ) : (
            <SearchesTab
              searches={data?.searches ?? []}
              onOpen={openSavedSearch}
              onDelete={removeSearch}
              onPatch={patchSearch}
            />
          )}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
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

function ItemsTab({
  items,
  onToggle,
  onAddToCart,
}: {
  items: FavouriteItem[];
  onToggle: (l: PublicListing) => void;
  onAddToCart: (l: PublicListing) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your wishlist is empty"
        description="Tap the heart on a listing to keep it here, then add it to the cart when you want to order."
        action={
          <Link href="/search">
            <Button variant="primary">Search for favorites</Button>
          </Link>
        }
      />
    );
  }
  return (
    <ul className="flex flex-wrap gap-3">
      {items.map((row) => (
        <li key={row.favouriteId} className="w-[7.5rem] shrink-0">
          <DiscoveryListingCard
            listing={row.listing}
            favourited
            note={savedListingNote(row.listing)}
            onToggleFavourite={(l) => void onToggle(l)}
            onAddToCart={
              savedListingCanCart(row.listing)
                ? (l) => void onAddToCart(l)
                : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}

function SellersTab({
  sellers,
  onUnfollow,
}: {
  sellers: FollowedSeller[];
  onUnfollow: (s: FollowedSeller) => void;
}) {
  if (sellers.length === 0) {
    return (
      <EmptyState
        title="No followed sellers"
        description="Follow sellers from their listings to see them here."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {sellers.map((row) => (
        <li
          key={row.followId}
          className="flex items-center justify-between gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-3"
        >
          <div>
            <p className="font-semibold">
              {row.seller.displayName}
              {row.seller.verificationBadge ? (
                <span className="ml-2 text-sm font-medium text-[var(--rw-accent)]">
                  Verified
                </span>
              ) : null}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onUnfollow(row)}
          >
            Unfollow
          </Button>
        </li>
      ))}
    </ul>
  );
}

function SearchesTab({
  searches,
  onOpen,
  onDelete,
  onPatch,
}: {
  searches: SavedSearch[];
  onOpen: (s: SavedSearch) => void;
  onDelete: (s: SavedSearch) => void;
  onPatch: (
    s: SavedSearch,
    patch: { paused?: boolean; digestEnabled?: boolean },
  ) => void;
}) {
  if (searches.length === 0) {
    return (
      <EmptyState
        title="No saved searches"
        description="Save filters from the search page to get match alerts here."
        action={
          <Link href="/search">
            <Button variant="primary">Open search</Button>
          </Link>
        }
      />
    );
  }
  return (
    <ul className="space-y-3">
      {searches.map((s) => {
        const paused = Boolean(s.paused);
        const digest = Boolean(s.digestEnabled);
        return (
          <li
            key={s.id}
            className="flex flex-col gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              onClick={() => onOpen(s)}
            >
              <p className="font-semibold">
                {s.name}
                {paused ? (
                  <span className="ml-2 text-xs font-medium text-[var(--rw-ink-muted)]">
                    Paused
                  </span>
                ) : null}
                {!paused && s.newMatchesCount > 0 ? (
                  <span className="ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--rw-accent)] px-2 py-0.5 text-xs font-semibold text-white">
                    {s.newMatchesCount}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-sm text-[var(--rw-ink-muted)]">
                {summarizeFilters(s.filters)}
                {digest ? " · Daily digest" : ""}
              </p>
            </button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onPatch(s, { paused: !paused })}
              >
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onPatch(s, { digestEnabled: !digest })}
                aria-pressed={digest}
              >
                {digest ? "Digest on" : "Digest"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onDelete(s)}>
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function summarizeFilters(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof filters.q === "string" && filters.q) parts.push(`“${filters.q}”`);
  if (typeof filters.community === "string" && filters.community)
    parts.push(filters.community);
  if (filters.radiusKm != null) parts.push(`${filters.radiusKm} km`);
  if (typeof filters.condition === "string" && filters.condition) {
    parts.push(CONDITION_LABELS[filters.condition] ?? filters.condition);
  }
  return parts.join(" · ") || "Custom filters";
}
