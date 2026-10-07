"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  checkoutCart,
  listCart,
  removeFromCart,
  updateCartQuantity,
  type CartItem,
} from "../../lib/cart";
import { listingImageUrl } from "../../lib/listings";
import type { PublicListing } from "../../lib/types";

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      setItems(await listCart(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load cart");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeQty(item: CartItem, quantity: number) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(item.listing.id);
    try {
      await updateCartQuantity(token, item.listing.id, quantity);
      await load();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not update quantity");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: CartItem) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(item.listing.id);
    try {
      await removeFromCart(token, item.listing.id);
      await load();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not remove item");
    } finally {
      setBusyId(null);
    }
  }

  async function checkout() {
    const token = getAccessToken();
    if (!token) return;
    setCheckingOut(true);
    try {
      const res = await checkoutCart(token, { fulfilmentMethod: "PICKUP" });
      const n = res.orders.length;
      setToast(
        n === 1
          ? "Order placed. The seller needs to confirm before you pay."
          : `${n} orders placed. Each seller confirms before you pay.`,
      );
      router.push("/orders");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Checkout failed");
      await load();
    } finally {
      setCheckingOut(false);
    }
  }

  const ready = (items ?? []).filter((item) => !item.unavailable);
  const totalKobo = ready.reduce(
    (sum, item) => sum + item.listing.priceKobo * item.quantity,
    0,
  );

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 text-[var(--rw-ink)] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Cart</h1>
        <p className="mb-6 text-sm text-[var(--rw-ink-muted)]">
          Saving an item here does not place an order or hold the units. Checkout
          asks each seller to confirm before you pay.
        </p>

        {items === null && !error ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        {error ? (
          <EmptyState title="Cart unavailable" description={error} />
        ) : null}
        {items && items.length === 0 ? (
          <EmptyState
            title="Your cart is empty"
            description="Add items from a listing. You can still browse without ordering."
            action={
              <Link href="/">
                <Button variant="primary">Browse</Button>
              </Link>
            }
          />
        ) : null}

        <ul className="space-y-3">
          {items?.map((item) => {
            const thumb = listingImageUrl(
              item.listing.images[0] as PublicListing["images"][number] | undefined,
            );
            return (
              <li
                key={item.id}
                className="flex gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--rw-radius)] bg-[var(--rw-border)]">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/listings/${item.listing.id}`} className="font-semibold hover:underline">
                    {item.listing.title || "Untitled"}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                    {formatNgn({ amountKobo: item.listing.priceKobo })} per unit
                    {item.unavailable
                      ? " · Unavailable"
                      : ` · ${item.listing.quantityAvailable} available`}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded-full border border-[var(--rw-border)]"
                      disabled={busyId === item.listing.id || item.quantity <= 1}
                      onClick={() => void changeQty(item, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-full border border-[var(--rw-border)]"
                      disabled={
                        busyId === item.listing.id ||
                        item.quantity >= item.listing.quantityAvailable
                      }
                      onClick={() => void changeQty(item, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-sm text-red-600 hover:underline"
                      disabled={busyId === item.listing.id}
                      onClick={() => void remove(item)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold">
                  {formatNgn({ amountKobo: item.listing.priceKobo * item.quantity })}
                </p>
              </li>
            );
          })}
        </ul>

        {ready.length > 0 ? (
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--rw-ink-muted)]">
              {ready.length} item{ready.length === 1 ? "" : "s"} ·{" "}
              {formatNgn({ amountKobo: totalKobo })} before fees
            </p>
            <Button variant="primary" disabled={checkingOut} onClick={() => void checkout()}>
              {checkingOut ? "Placing orders…" : "Place orders"}
            </Button>
          </div>
        ) : null}
      </div>
      {toast ? (
        <div className="fixed bottom-8 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
          <Toast message={toast} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </main>
  );
}
