"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../components/discovery/DiscoveryListingCard";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { addToCart } from "../../lib/cart";
import {
  getMeFavourites,
  savedListingCanCart,
  savedListingNote,
  unfavouriteListing,
} from "../../lib/discovery";
import type { FavouriteItem, PublicListing } from "../../lib/types";

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<FavouriteItem[] | null>(null);
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
    setError(null);
    try {
      const res = await getMeFavourites(token);
      setItems(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load wishlist");
      setItems([]);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(listing: PublicListing) {
    const token = getAccessToken();
    if (!token) return;
    setItems((prev) =>
      prev ? prev.filter((row) => row.listing.id !== listing.id) : prev,
    );
    try {
      await unfavouriteListing(listing.id, token);
      setToast({ message: "Removed from wishlist", tone: "success" });
    } catch (err) {
      await load();
      setToast({
        message: err instanceof ApiError ? err.message : "Could not update wishlist",
        tone: "error",
      });
    }
  }

  async function addListingToCart(listing: PublicListing) {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to use the cart", tone: "warn" });
      return;
    }
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

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Wishlist</h1>
            <p className="mt-1 text-[var(--rw-ink-muted)]">
              Items you want to look at later. Add one to the cart when you are ready to order.
            </p>
          </div>
          <Link
            href="/cart"
            className="shrink-0 text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
          >
            Cart
          </Link>
        </header>

        <div className="mt-8">
          {items === null && !error ? (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-52 w-44 shrink-0 rounded-[var(--rw-radius-lg)]"
                  label="Loading wishlist"
                />
              ))}
            </div>
          ) : error && items?.length === 0 ? (
            <EmptyState
              title="Couldn’t load wishlist"
              description={error}
              action={
                <Button variant="primary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          ) : items && items.length === 0 ? (
            <EmptyState
              title="Your wishlist is empty"
              description="Tap the heart on a listing to keep it here."
              action={
                <Link href="/search">
                  <Button variant="primary">Search for favorites</Button>
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-wrap gap-3">
              {(items ?? []).map((row) => (
                <li key={row.favouriteId} className="w-44 shrink-0">
                  <DiscoveryListingCard
                    listing={row.listing}
                    favourited
                    note={savedListingNote(row.listing)}
                    onToggleFavourite={(listing) => void remove(listing)}
                    onAddToCart={
                      savedListingCanCart(row.listing)
                        ? (listing) => void addListingToCart(listing)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 lg:left-[calc(50%+var(--rw-sidebar-offset,0px))]">
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
