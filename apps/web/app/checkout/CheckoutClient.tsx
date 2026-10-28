"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import {
  Button,
  EmptyState,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  fallbackDeliveryDestination,
  getDeliveryQuote,
} from "../../lib/delivery";
import { getListing, listingImageUrl } from "../../lib/listings";
import {
  computeOrderTotalKobo,
  computeProtectionFeeKobo,
  createOrder,
  initiatePayment,
  isMockPsp,
  newIdempotencyKey,
  simulateMockPspCharge,
  type PaymentDto,
} from "../../lib/orders";
import { createGiveawayClaim, getGiftDeliveryQuote } from "../../lib/swap";
import type { PublicListing } from "../../lib/types";

export default function CheckoutPage() {
  const router = useRouter();
  const search = useSearchParams();
  const listingId = search.get("listingId") ?? "";
  const offerId = search.get("offerId") ?? undefined;
  const orderIntentId = search.get("orderIntentId") ?? undefined;
  const qty = Math.max(1, Number(search.get("qty") ?? "1") || 1);

  const [listing, setListing] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [deliveryFeeKobo, setDeliveryFeeKobo] = useState(0);
  const [giftArea, setGiftArea] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    if (!listingId) {
      setError("Missing listing");
      setLoading(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      router.replace(
        `/onboarding?next=${encodeURIComponent(
          `/checkout?listingId=${listingId}${
            orderIntentId ? `&orderIntentId=${orderIntentId}` : ""
          }${offerId ? `&offerId=${offerId}` : ""}`,
        )}`,
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getListing(listingId, token);
      setListing(data);
      if (data.sellingMode === "GIVE_AWAY") {
        const quote = await getGiftDeliveryQuote(token, listingId);
        setDeliveryFeeKobo(quote.deliveryFeeKobo);
        setGiftArea(quote.area);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load listing");
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [listingId, offerId, orderIntentId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const isGift = listing?.sellingMode === "GIVE_AWAY";
  const unitKobo = listing?.priceKobo ?? 0;
  const amountKobo =
    offerId || orderIntentId ? unitKobo : unitKobo * qty;
  const protectionFeeKobo = useMemo(
    () => (isGift ? 0 : computeProtectionFeeKobo(amountKobo)),
    [amountKobo, isGift],
  );
  const totalKobo = useMemo(
    () =>
      computeOrderTotalKobo({
        amountKobo,
        protectionFeeKobo,
        deliveryFeeKobo,
      }),
    [amountKobo, protectionFeeKobo, deliveryFeeKobo],
  );

  async function placeAndPay() {
    const token = getAccessToken();
    if (!token || !listingId) return;
    setBusy(true);
    setError(null);
    try {
      if (listing?.sellingMode === "GIVE_AWAY") {
        const claimed = await createGiveawayClaim(token, listingId);
        setOrderId(claimed.order.id);
        setDeliveryFeeKobo(claimed.order.deliveryFeeKobo);
        const pay = await initiatePayment(token, {
          orderId: claimed.order.id,
          idempotencyKey: newIdempotencyKey(),
        });
        setPayment(pay);
        setToast({ message: "Delivery fee ready to pay", tone: "success" });
        return;
      }
      const order = await createOrder(token, {
        listingId,
        fulfilmentMethod: "DELIVERY",
        ...(qty > 1 ? { quantity: qty } : {}),
        ...(orderIntentId
          ? { orderIntentId }
          : offerId
            ? { offerId }
            : { buyNow: true }),
      });
      setOrderId(order.id);

      if (order.confirmationStatus === "PENDING" || order.status === "CREATED") {
        setToast({
          message: "Order placed. The seller confirms it before you pay.",
          tone: "success",
        });
        router.replace(`/orders/${order.id}`);
        return;
      }

      const dest = fallbackDeliveryDestination(
        (listing as { geoLat?: number | null } | null)?.geoLat,
        (listing as { geoLng?: number | null } | null)?.geoLng,
      );
      const quote = await getDeliveryQuote(
        token,
        order.id,
        dest.toLat,
        dest.toLng,
      );
      setDeliveryFeeKobo(quote.deliveryFeeKobo ?? quote.feeKobo);

      const pay = await initiatePayment(token, {
        orderId: order.id,
        idempotencyKey: newIdempotencyKey(),
      });
      setPayment(pay);
      setToast({ message: "Order created — complete payment", tone: "success" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function simulatePay() {
    if (!payment || !orderId) return;
    setSimulating(true);
    try {
      await simulateMockPspCharge({
        reference: payment.reference,
        event: "charge.success",
      });
      router.replace(`/orders/${orderId}`);
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Simulate pay failed",
        tone: "error",
      });
    } finally {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-lg space-y-4">
          <Skeleton className="h-8 w-40" label="Loading checkout" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    );
  }

  if (error && !listing) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Checkout unavailable"
          description={error}
          action={
            <Link href="/">
              <Button variant="primary">Back home</Button>
            </Link>
          }
        />
      </main>
    );
  }

  if (!listing) return null;

  const thumb = listingImageUrl(
    [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder)[0],
  );
  const showSimulate = payment && isMockPsp(payment);

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[36vh]"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(14,159,110,0.14), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-28 pt-6 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href={`/listings/${listing.id}`}
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Back
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        {thumb ? (
          <div className="mb-6 aspect-[4/3] w-full overflow-hidden rounded-[var(--rw-radius-lg)] bg-[var(--rw-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {isGift ? "Get this gift" : "Checkout"}
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          {isGift
            ? `Delivery to ${giftArea || "your area"}. The item is free. You pay the delivery fee for that area.`
            : "Place an order. The seller confirms the delivery date before you pay. Units are reserved until you pay, cancel, or the seller declines."}
        </p>

        <section
          className="mt-8 flex gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
          aria-label="Item summary"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">
              {listing.title || "Untitled"}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight">
              {formatNgn({ amountKobo })}
            </p>
            {!offerId && !orderIntentId ? (
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                {qty} × {formatNgn({ amountKobo: unitKobo })} per unit
              </p>
            ) : null}
            {offerId || orderIntentId ? (
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                {orderIntentId ? "From accepted offer" : "Offer price at pay"}
              </p>
            ) : null}
          </div>
        </section>

        {isGift ? null : (
        <aside
          className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/50 px-4 py-3"
          aria-label="Buyer protection"
        >
          <p className="text-sm font-semibold text-[var(--rw-accent)]">
            Buyer protection
          </p>
          <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
            Your payment is held until you confirm the item. Protection fee
            covers eligible claims within the coverage window.
          </p>
        </aside>
        )}

        <section className="mt-8" aria-labelledby="fulfil-heading">
          <h2 id="fulfil-heading" className="text-lg font-semibold">
            ReWorth delivery
          </h2>
          <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
            {isGift
              ? `Delivery to ${giftArea || "your area"}. The fee is ₦1,500 plus ₦150 per kilometre.`
              : "Every order is delivered by ReWorth. The courier is simulated for now. The fee is ₦1,500 plus ₦150 per kilometre, added before you pay."}
          </p>
        </section>

        <section
          className="mt-8 space-y-2 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
          aria-label="Price breakdown"
        >
          <div className="flex justify-between text-sm">
            <span className="text-[var(--rw-ink-muted)]">Item</span>
            <span>{formatNgn({ amountKobo })}</span>
          </div>
          {isGift ? null : (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--rw-ink-muted)]">Protection fee</span>
            <span>{formatNgn({ amountKobo: protectionFeeKobo })}</span>
          </div>
          )}
          {isGift || deliveryFeeKobo > 0 ? (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--rw-ink-muted)]">
                {isGift ? `Delivery to ${giftArea || "your area"}` : "Delivery"}
              </span>
              <span>{formatNgn({ amountKobo: deliveryFeeKobo })}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-[var(--rw-border)] pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatNgn({ amountKobo: totalKobo })}</span>
          </div>
          {isGift ? null : (
          <p className="text-xs text-[var(--rw-ink-muted)]">
            Final total uses offer/intent amount when applicable.
          </p>
          )}
        </section>

        {error ? (
          <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}

        {!payment ? (
          <div className="mt-8">
            <Button
              variant="primary"
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={() => void placeAndPay()}
            >
              {busy ? "Placing order…" : isGift ? "Pay delivery" : "Place order"}
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-[var(--rw-ink-muted)]">
              Payment reference:{" "}
              <span className="font-mono text-[var(--rw-ink)]">
                {payment.reference}
              </span>
            </p>
            {showSimulate ? (
              <Button
                variant="primary"
                className="w-full"
                size="lg"
                disabled={simulating}
                onClick={() => void simulatePay()}
              >
                {simulating ? "Confirming…" : "Simulate pay"}
              </Button>
            ) : payment.checkoutUrl ? (
              <a
                href={payment.checkoutUrl}
                className="inline-flex w-full items-center justify-center rounded-[var(--rw-radius)] bg-[var(--rw-accent)] px-4 py-3 text-base font-medium text-white"
              >
                Continue to Paystack
              </a>
            ) : (
              <p className="text-sm text-[var(--rw-ink-muted)]">
                Complete payment in your PSP window, then open{" "}
                <Link
                  href={`/orders/${orderId}`}
                  className="font-medium text-[var(--rw-accent)] underline"
                >
                  your order
                </Link>
                .
              </p>
            )}
            {orderId ? (
              <Link
                href={`/orders/${orderId}`}
                className="block text-center text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
              >
                View order
              </Link>
            ) : null}
          </div>
        )}
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
