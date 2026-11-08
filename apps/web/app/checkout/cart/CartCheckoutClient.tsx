"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import {
  Button,
  EmptyState,
  Input,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  checkoutCart,
  listCart,
  quoteCart,
  type CartItem,
  type CartQuote,
} from "../../../lib/cart";
import { buyerDeliveryCoords } from "../../../lib/checkout-destination";
import { listingImageUrl } from "../../../lib/listings";
import { getRegion } from "../../../lib/region";
import type { PublicListing } from "../../../lib/types";

export default function CartCheckoutClient() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [addressArea, setAddressArea] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const ready = useMemo(
    () => (items ?? []).filter((i) => !i.unavailable),
    [items],
  );

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login?next=%2Fcheckout%2Fcart");
      return;
    }
    setLoading(true);
    try {
      setItems(await listCart(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load cart");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliveryAddress = useMemo(
    () => [addressLine.trim(), addressArea.trim()].filter(Boolean).join(", "),
    [addressLine, addressArea],
  );

  const refreshQuote = useCallback(async () => {
    const token = getAccessToken();
    if (!token || ready.length === 0 || !deliveryAddress) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    try {
      const region = await getRegion("lagos");
      const { toLat, toLng } = buyerDeliveryCoords(
        addressLine,
        addressArea,
        region,
      );
      const q = await quoteCart(token, { toLat, toLng });
      setQuote(q);
      setError(null);
    } catch (err) {
      setQuote(null);
      setError(err instanceof ApiError ? err.message : "Could not quote delivery");
    } finally {
      setQuoting(false);
    }
  }, [addressArea, addressLine, deliveryAddress, ready.length]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshQuote();
    }, 400);
    return () => window.clearTimeout(t);
  }, [refreshQuote]);

  const sellerGroups = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of ready) {
      const sid = item.listing.sellerId;
      const list = map.get(sid) ?? [];
      list.push(item);
      map.set(sid, list);
    }
    return [...map.entries()];
  }, [ready]);

  async function placeOrders() {
    const token = getAccessToken();
    if (!token || ready.length === 0) return;
    if (!addressLine.trim()) {
      setError("Enter your delivery address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const region = await getRegion("lagos");
      const { toLat, toLng } = buyerDeliveryCoords(
        addressLine,
        addressArea,
        region,
      );
      const result = await checkoutCart(token, {
        fulfilmentMethod: "DELIVERY",
        toLat,
        toLng,
        deliveryAddress,
      });
      setToast(
        `${result.orders.length} order${result.orders.length === 1 ? "" : "s"} placed. Sellers confirm before you pay.`,
      );
      window.setTimeout(() => {
        if (result.orders.length === 1) {
          router.replace(`/orders/${result.orders[0]!.id}`);
        } else {
          router.replace("/orders");
        }
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 text-[var(--rw-ink)] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/cart"
            className="text-sm font-semibold text-[var(--rw-accent)] hover:underline"
          >
            ← Cart
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}

        {!loading && ready.length === 0 ? (
          <EmptyState
            title="Nothing to checkout"
            description="Add available items to your cart first."
            action={
              <Link href="/cart">
                <Button variant="primary">Back to cart</Button>
              </Link>
            }
          />
        ) : null}

        {ready.length > 0 ? (
          <>
            <p className="mb-4 text-sm text-[var(--rw-ink-muted)]">
              {ready.length} item{ready.length === 1 ? "" : "s"} from{" "}
              {sellerGroups.length} seller
              {sellerGroups.length === 1 ? "" : "s"}. Delivery is quoted from
              each seller&apos;s pickup location to your address (one delivery
              fee per seller).
            </p>

            <ul className="space-y-4">
              {sellerGroups.map(([sellerId, lines]) => (
                <li
                  key={sellerId}
                  className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
                    Seller shipment
                  </p>
                  <ul className="mt-3 space-y-3">
                    {lines.map((item) => {
                      const thumb = listingImageUrl(
                        item.listing.images[0] as
                          | PublicListing["images"][number]
                          | undefined,
                      );
                      const lineQuote = quote?.lines.find(
                        (l) => l.listingId === item.listing.id,
                      );
                      return (
                        <li key={item.id} className="flex gap-3">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--rw-radius)] bg-[var(--rw-border)]">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{item.listing.title}</p>
                            <p className="text-sm text-[var(--rw-ink-muted)]">
                              {item.quantity} ×{" "}
                              {formatNgn({ amountKobo: item.listing.priceKobo })}
                            </p>
                            {lineQuote && lineQuote.deliveryFeeKobo > 0 ? (
                              <p className="text-sm text-[var(--rw-ink-muted)]">
                                Includes delivery{" "}
                                {formatNgn({
                                  amountKobo: lineQuote.deliveryFeeKobo,
                                })}
                              </p>
                            ) : lineQuote ? (
                              <p className="text-sm text-[var(--rw-ink-muted)]">
                                Delivery included with another item from this
                                seller
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">Delivery address</h2>
              <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                Used to quote distance from each seller&apos;s pickup point.
              </p>
              <div className="mt-4 space-y-3">
                <Input
                  label="Street / building"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  disabled={busy}
                />
                <Input
                  label="Area (e.g. Lekki Ph1, VI)"
                  value={addressArea}
                  onChange={(e) => setAddressArea(e.target.value)}
                  disabled={busy}
                />
              </div>
            </section>

            {quote ? (
              <section className="mt-8 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] p-4">
                <h2 className="text-lg font-semibold">Total</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt>Items</dt>
                    <dd>{formatNgn({ amountKobo: quote.itemsSubtotalKobo })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Delivery ({quote.deliveryBySeller.length} seller(s))</dt>
                    <dd>
                      {formatNgn({ amountKobo: quote.deliveryTotalKobo })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Buyer protection</dt>
                    <dd>
                      {formatNgn({ amountKobo: quote.protectionTotalKobo })}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-[var(--rw-border)] pt-2 text-base font-semibold">
                    <dt>Estimated total</dt>
                    <dd>{formatNgn({ amountKobo: quote.grandTotalKobo })}</dd>
                  </div>
                </dl>
                {quoting ? (
                  <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">
                    Updating quote…
                  </p>
                ) : null}
              </section>
            ) : null}

            {error ? (
              <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-8">
              <Button
                variant="primary"
                className="w-full"
                disabled={
                  busy ||
                  !deliveryAddress ||
                  !quote ||
                  quoting ||
                  ready.length === 0
                }
                onClick={() => void placeOrders()}
              >
                Place {ready.length} order{ready.length === 1 ? "" : "s"}
              </Button>
            </div>
          </>
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
