"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import {
  Button,
  EmptyState,
  Input,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { BackLink } from "../../components/BackLink";
import { CheckoutDeliveryStep } from "../../components/checkout/CheckoutDeliveryStep";
import {
  checkoutCart,
  listCart,
  quoteCart,
  removeFromCart,
  computeCartItemTotals,
  type CartItem,
  type CartQuote,
} from "../../lib/cart";
import { cartDeliveryTotalLabel } from "../../lib/delivery-display";
import { ApiError, apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { deliveryWindowHint, getDeliveryQuote } from "../../lib/delivery";
import { hasSavedAddressLine } from "../../lib/saved-address";
import {
  estimateListingDelivery,
  getListing,
  listingImageUrl,
} from "../../lib/listings";
import { createConversation, getOrderIntent, listOffers } from "../../lib/chat";
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
import { deliveryLineLabel } from "../../lib/delivery-display";
import { resolveCheckoutDropoff } from "../../lib/checkout-destination";
import { getRegion } from "../../lib/region";
import {
  defaultCheckoutFulfilment,
  readFulfilmentPreference,
} from "../../lib/fulfilment-preference";
import type { MeDeliveryAddress, MeResponse, PublicListing } from "../../lib/types";

export default function CheckoutPage() {
  const router = useRouter();
  const search = useSearchParams();
  const cartMode = search.get("cart") === "1";
  const listingId = search.get("listingId") ?? "";
  const offerId = search.get("offerId") ?? undefined;
  const orderIntentId = search.get("orderIntentId") ?? undefined;
  const qty = Math.max(1, Number(search.get("qty") ?? "1") || 1);

  const [listing, setListing] = useState<PublicListing | null>(null);
  const [agreedUnitKobo, setAgreedUnitKobo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [deliveryFeeKobo, setDeliveryFeeKobo] = useState(0);
  const [deliveryHandling, setDeliveryHandling] = useState<
    "bulky" | "parcel" | null
  >(null);
  const [giftArea, setGiftArea] = useState("");
  const [purchaseQty, setPurchaseQty] = useState(qty);
  const [addressLine, setAddressLine] = useState("");
  const [addressArea, setAddressArea] = useState("");
  const [savedDelivery, setSavedDelivery] = useState<MeDeliveryAddress | null>(
    null,
  );
  const [addressMode, setAddressMode] = useState<"saved" | "new">("new");
  const [meetupCheckout, setMeetupCheckout] = useState<{
    locationText: string;
    deliveryDate?: string | null;
  } | null>(null);
  const [buyerFulfilment, setBuyerFulfilment] = useState<
    "DELIVERY" | "MEET_POINT"
  >("DELIVERY");
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [meetupChatBusy, setMeetupChatBusy] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[] | null>(null);
  const [cartQuote, setCartQuote] = useState<CartQuote | null>(null);
  const [cartQuoting, setCartQuoting] = useState(false);
  const [orderIntentListingId, setOrderIntentListingId] = useState<
    string | null
  >(null);

  const cartReady = useMemo(
    () => (cartItems ?? []).filter((i) => !i.unavailable),
    [cartItems],
  );

  const cartLine = cartReady[0] ?? null;

  const cartMeetupTotals = useMemo(() => {
    if (!cartMode || !cartLine) return null;
    return computeCartItemTotals([cartLine]);
  }, [cartMode, cartLine]);

  const effectiveListingId = useMemo(() => {
    if (cartMode && cartLine) {
      return cartLine.listing.id;
    }
    return listingId;
  }, [cartMode, cartLine, listingId]);

  useEffect(() => {
    setPurchaseQty(qty);
  }, [qty]);

  useEffect(() => {
    if (cartLine) setPurchaseQty(cartLine.quantity);
  }, [cartLine]);

  const load = useCallback(async () => {
    if (!cartMode && !listingId) {
      setError("Missing listing");
      setLoading(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      const next = cartMode
        ? `/checkout?cart=1${
            orderIntentId ? `&orderIntentId=${orderIntentId}` : ""
          }`
        : `/checkout?listingId=${listingId}${
            orderIntentId ? `&orderIntentId=${orderIntentId}` : ""
          }${offerId ? `&offerId=${offerId}` : ""}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (cartMode) {
      setLoading(true);
      setError(null);
      try {
        const [items, me] = await Promise.all([
          listCart(token),
          apiFetch<MeResponse>("/me", { token }),
        ]);
        setCartItems(items);
        const saved = me.deliveryAddress ?? null;
        setSavedDelivery(saved);
        if (hasSavedAddressLine(saved)) {
          setAddressMode("saved");
          setAddressLine(saved!.line1);
          setAddressArea(saved!.community);
        }
        const ready = items.filter((i) => !i.unavailable);
        if (ready.length === 0 && orderIntentId) {
          const intent = await getOrderIntent(token, orderIntentId);
          router.replace(
            `/checkout?listingId=${intent.listingId}&orderIntentId=${orderIntentId}`,
          );
          return;
        }
        if (ready.length > 0) {
          setBuyerFulfilment(
            defaultCheckoutFulfilment(
              readFulfilmentPreference(ready[0]!.listing),
            ),
          );
        }
        setOrderIntentListingId(null);
        if (orderIntentId && ready.length > 0) {
          const intent = await getOrderIntent(token, orderIntentId);
          const intentLine = ready.find(
            (i) => i.listing.id === intent.listingId,
          );
          if (!intentLine) {
            throw new ApiError("Checkout does not match this item", 400);
          }
          setOrderIntentListingId(intent.listingId);
          if (intent.fulfilmentMethod === "MEET_POINT") {
            setBuyerFulfilment("MEET_POINT");
            if (intent.meetupLocationText) {
              setMeetupCheckout({
                locationText: intent.meetupLocationText,
                deliveryDate: intent.meetupDeliveryDate ?? null,
              });
              setDeliveryFeeKobo(0);
            }
          }
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load cart");
        setCartItems(null);
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, me] = await Promise.all([
        getListing(listingId, token),
        apiFetch<MeResponse>("/me", { token }),
      ]);
      setListing(data);
      setBuyerFulfilment(
        defaultCheckoutFulfilment(readFulfilmentPreference(data)),
      );
      const saved = me.deliveryAddress ?? null;
      setSavedDelivery(saved);
      if (hasSavedAddressLine(saved)) {
        setAddressMode("saved");
        setAddressLine(saved!.line1);
        setAddressArea(saved!.community);
      }
      let unit = data.priceKobo ?? 0;
      if (orderIntentId) {
        const intent = await getOrderIntent(token, orderIntentId);
        if (intent.listingId !== listingId) {
          throw new ApiError("Checkout does not match this listing", 400);
        }
        unit = intent.amountKobo;
        if (intent.fulfilmentMethod === "MEET_POINT") {
          setBuyerFulfilment("MEET_POINT");
          if (intent.meetupLocationText) {
            setMeetupCheckout({
              locationText: intent.meetupLocationText,
              deliveryDate: intent.meetupDeliveryDate ?? null,
            });
            setDeliveryFeeKobo(0);
          }
        }
      } else if (offerId) {
        const offers = await listOffers(token, listingId);
        const offer = offers.find((o) => o.id === offerId);
        if (offer?.status === "ACCEPTED") {
          unit = offer.amountKobo;
        }
      }
      setAgreedUnitKobo(offerId || orderIntentId ? unit : null);
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
  }, [cartMode, listingId, offerId, orderIntentId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshDeliveryEstimate = useCallback(async () => {
    if (cartMode) return;
    if (meetupCheckout || buyerFulfilment === "MEET_POINT") return;
    if (!listingId || !listing || listing.sellingMode === "GIVE_AWAY") return;
    const token = getAccessToken();
    if (!token) return;
    if (addressMode === "new" && !addressLine.trim()) {
      setDeliveryFeeKobo(0);
      return;
    }
    try {
      const region = await getRegion("lagos").catch(() => null);
      const dropoff = await resolveCheckoutDropoff(token, {
        mode: addressMode,
        saved: savedDelivery,
        addressLine,
        addressArea,
        city: listing.city ?? undefined,
        region,
      });
      const est = await estimateListingDelivery(
        token,
        listingId,
        dropoff.toLat,
        dropoff.toLng,
        {
          line1:
            addressMode === "saved" && savedDelivery?.line1
              ? savedDelivery.line1
              : addressLine.trim(),
          community:
            addressMode === "saved" && savedDelivery?.community
              ? savedDelivery.community
              : addressArea.trim(),
          city:
            addressMode === "saved" && savedDelivery?.city
              ? savedDelivery.city
              : listing.city ?? undefined,
        },
      );
      setDeliveryFeeKobo(est.deliveryFeeKobo);
      setDeliveryHandling(est.handling ?? null);
    } catch {
      setDeliveryFeeKobo(0);
      setDeliveryHandling(null);
    }
  }, [
    addressArea,
    addressLine,
    addressMode,
    listing,
    listingId,
    buyerFulfilment,
    meetupCheckout,
    savedDelivery,
    cartMode,
  ]);

  const cartDeliveryAddress = useMemo(
    () => [addressLine.trim(), addressArea.trim()].filter(Boolean).join(", "),
    [addressLine, addressArea],
  );

  const refreshCartQuote = useCallback(async () => {
    if (!cartMode) return;
    if (buyerFulfilment === "MEET_POINT" || meetupCheckout) {
      setCartQuote(null);
      return;
    }
    const token = getAccessToken();
    if (!token || cartReady.length === 0 || !cartDeliveryAddress) {
      setCartQuote(null);
      return;
    }
    setCartQuoting(true);
    try {
      const region = await getRegion("lagos").catch(() => null);
      const dropoff = await resolveCheckoutDropoff(token, {
        mode: addressMode,
        saved: savedDelivery,
        addressLine,
        addressArea,
        region,
      });
      const q = await quoteCart(token, {
        toLat: dropoff.toLat,
        toLng: dropoff.toLng,
        deliveryLine1:
          addressMode === "saved" && savedDelivery
            ? savedDelivery.line1
            : addressLine.trim(),
        deliveryCommunity:
          addressMode === "saved" && savedDelivery
            ? savedDelivery.community
            : addressArea.trim(),
        deliveryCity: savedDelivery?.city ?? "Lagos",
      });
      setCartQuote(q);
    } catch {
      setCartQuote(null);
    } finally {
      setCartQuoting(false);
    }
  }, [
    addressArea,
    addressLine,
    addressMode,
    buyerFulfilment,
    cartDeliveryAddress,
    cartMode,
    cartReady.length,
    meetupCheckout,
    savedDelivery,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshDeliveryEstimate();
    }, 450);
    return () => window.clearTimeout(t);
  }, [refreshDeliveryEstimate]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshCartQuote();
    }, 400);
    return () => window.clearTimeout(t);
  }, [refreshCartQuote]);

  useEffect(() => {
    if (meetupCheckout || buyerFulfilment === "MEET_POINT") {
      setDeliveryFeeKobo(0);
      setDeliveryHandling(null);
    }
  }, [buyerFulfilment, meetupCheckout]);

  const checkoutReturnPath = useMemo(() => {
    if (cartMode) {
      const q = new URLSearchParams({ cart: "1" });
      if (orderIntentId) q.set("orderIntentId", orderIntentId);
      return `/checkout?${q.toString()}`;
    }
    if (!listingId) return "/checkout";
    const q = new URLSearchParams({ listingId });
    if (orderIntentId) q.set("orderIntentId", orderIntentId);
    if (offerId) q.set("offerId", offerId);
    if (purchaseQty > 1) q.set("qty", String(purchaseQty));
    return `/checkout?${q.toString()}`;
  }, [cartMode, listingId, offerId, orderIntentId, purchaseQty]);

  const openMeetupChat = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !effectiveListingId || meetupChatBusy) return;
    setMeetupChatBusy(true);
    setError(null);
    try {
      const conv = await createConversation(token, effectiveListingId);
      const q = new URLSearchParams({
        meetup: "1",
        checkoutReturn: checkoutReturnPath,
      });
      router.push(`/chats/${conv.id}?${q.toString()}`);
      // Stay in busy state until checkout unmounts — avoids a label/opacity flash.
    } catch (err) {
      setMeetupChatBusy(false);
      setError(err instanceof ApiError ? err.message : "Could not open chat");
    }
  }, [checkoutReturnPath, effectiveListingId, meetupChatBusy, router]);

  const isGift =
    !cartMode && listing?.sellingMode === "GIVE_AWAY";
  const meetLocked = Boolean(meetupCheckout);
  const showMeetupOption = !cartMode || Boolean(cartLine);
  const checkoutMeet =
    !isGift && (meetLocked || buyerFulfilment === "MEET_POINT");
  const showFulfilmentChoice = !isGift && !meetLocked;
  const canPlaceOrder = useMemo(() => {
    if (isGift) return true;
    if (checkoutMeet && !meetLocked) return false;
    if (cartMode && buyerFulfilment === "DELIVERY" && !meetLocked) {
      return (
        cartReady.length > 0 &&
        Boolean(cartDeliveryAddress) &&
        Boolean(cartQuote) &&
        !cartQuoting
      );
    }
    return !checkoutMeet || meetLocked;
  }, [
    isGift,
    checkoutMeet,
    meetLocked,
    cartMode,
    buyerFulfilment,
    cartReady.length,
    cartDeliveryAddress,
    cartQuote,
    cartQuoting,
  ]);
  const unitKobo = listing?.priceKobo ?? 0;
  const negotiatedUnit =
    agreedUnitKobo != null ? agreedUnitKobo : unitKobo;
  const hasOfferPrice = Boolean(offerId || orderIntentId);
  const maxUnits = Math.max(
    1,
    listing?.quantityAvailable ?? 1,
  );
  const unitForTotal = hasOfferPrice ? negotiatedUnit : unitKobo;
  const amountKobo = unitForTotal * purchaseQty;
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
    if (!token) return;

    if (cartMode) {
      if (cartReady.length === 0) return;
      const checkoutMeet =
        Boolean(meetupCheckout) || buyerFulfilment === "MEET_POINT";
      if (checkoutMeet) {
        if (!meetLocked || !cartLine) return;
        const meetText = meetupCheckout?.locationText?.trim();
        if (!meetText) return;
        setBusy(true);
        setError(null);
        try {
          const order = await createOrder(token, {
            listingId: cartLine.listing.id,
            fulfilmentMethod: "MEET_POINT",
            meetupLocationText: meetText,
            quantity: cartLine.quantity,
            ...(orderIntentId && orderIntentListingId === cartLine.listing.id
              ? { orderIntentId }
              : { buyNow: true }),
          });
          await removeFromCart(token, cartLine.listing.id).catch(() => {});
          setToast({ message: "Order placed.", tone: "success" });
          router.replace(`/orders/${order.id}`);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Checkout failed");
        } finally {
          setBusy(false);
        }
        return;
      }
      if (addressMode === "new" && !addressLine.trim()) {
        setError("Enter your delivery address");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const region = await getRegion("lagos").catch(() => null);
        const dropoff = await resolveCheckoutDropoff(token, {
          mode: addressMode,
          saved: savedDelivery,
          addressLine,
          addressArea,
          region,
        });
        const result = await checkoutCart(token, {
          fulfilmentMethod: "DELIVERY",
          toLat: dropoff.toLat,
          toLng: dropoff.toLng,
          deliveryAddress: dropoff.deliveryAddress,
          deliveryLine1:
            addressMode === "saved" && savedDelivery
              ? savedDelivery.line1
              : addressLine.trim(),
          deliveryCommunity:
            addressMode === "saved" && savedDelivery
              ? savedDelivery.community
              : addressArea.trim(),
          deliveryCity: savedDelivery?.city ?? "Lagos",
        });
        setToast({
          message: "Order placed. The seller will confirm before you can pay.",
          tone: "success",
        });
        router.replace(`/orders/${result.orders[0]!.id}`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Checkout failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!listingId) return;
    const checkoutMeet =
      Boolean(meetupCheckout) ||
      (!isGift && buyerFulfilment === "MEET_POINT");
    if (
      !isGift &&
      !checkoutMeet &&
      addressMode === "new" &&
      !addressLine.trim()
    ) {
      setError("Enter your delivery address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const region = await getRegion("lagos").catch(() => null);
      const dropoff =
        !isGift && !checkoutMeet
          ? await resolveCheckoutDropoff(token, {
              mode: addressMode,
              saved: savedDelivery,
              addressLine,
              addressArea,
              city: listing?.city ?? undefined,
              region,
            })
          : null;
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
        fulfilmentMethod: checkoutMeet ? "MEET_POINT" : "DELIVERY",
        meetupLocationText: meetupCheckout?.locationText,
        quantity: purchaseQty,
        deliveryAddress: dropoff?.deliveryAddress,
        deliveryLine1:
          addressMode === "saved" && savedDelivery
            ? savedDelivery.line1
            : addressLine.trim(),
        deliveryCommunity:
          addressMode === "saved" && savedDelivery
            ? savedDelivery.community
            : addressArea.trim(),
        deliveryCity:
          (addressMode === "saved" && savedDelivery?.city) ||
          listing?.city ||
          "Lagos",
        toLat: dropoff?.toLat,
        toLng: dropoff?.toLng,
        ...(orderIntentId
          ? { orderIntentId }
          : offerId
            ? { offerId }
            : { buyNow: true }),
      });
      setOrderId(order.id);

      await removeFromCart(token, listingId).catch(() => undefined);

      const awaitingSeller =
        order.confirmationStatus === "PENDING" && order.status === "CREATED";
      if (awaitingSeller) {
        setToast({
          message: "Order placed. The seller will confirm before you can pay.",
          tone: "success",
        });
        router.replace(`/orders/${order.id}`);
        return;
      }

      if (!checkoutMeet && dropoff) {
        const quote = await getDeliveryQuote(
          token,
          order.id,
          dropoff.toLat,
          dropoff.toLng,
        );
        setDeliveryFeeKobo(quote.deliveryFeeKobo ?? quote.feeKobo);
      }

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

  if (error && !listing && !cartMode) {
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

  if (cartMode && !loading && cartReady.length === 0) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Nothing to checkout"
          description="Add available items to your cart first."
          action={
            <Link href="/cart">
              <Button variant="primary">Back to cart</Button>
            </Link>
          }
        />
      </main>
    );
  }

  if (!cartMode && !listing) return null;

  const thumb =
    listing &&
    listingImageUrl(
      [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder)[0],
    );
  const showSimulate = payment && isMockPsp(payment);
  const showAddress =
    !isGift && buyerFulfilment === "DELIVERY" && !meetLocked;

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
          <BackLink
            href={cartMode ? "/cart" : `/listings/${listing!.id}`}
          />
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
        {isGift ? (
          <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
            Delivery to {giftArea || "your area"}. You pay delivery only.
          </p>
        ) : null}

        {cartMode && cartLine ? (
          <section
            className="mt-8 flex gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
            aria-label="Cart item"
          >
            {(() => {
              const lineThumb = listingImageUrl(
                cartLine.listing.images[0] as
                  | PublicListing["images"][number]
                  | undefined,
              );
              const lineQuote = cartQuote?.lines[0];
              return (
                <>
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--rw-radius)] bg-[var(--rw-border)]">
                    {lineThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={lineThumb}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{cartLine.listing.title}</p>
                    <p className="text-sm text-[var(--rw-ink-muted)]">
                      {cartLine.quantity} ×{" "}
                      {formatNgn({ amountKobo: cartLine.listing.priceKobo })}
                    </p>
                    {lineQuote && lineQuote.deliveryFeeKobo > 0 ? (
                      <p className="text-xs text-[var(--rw-ink-muted)]">
                        Delivery{" "}
                        {formatNgn({
                          amountKobo: lineQuote.deliveryFeeKobo,
                        })}
                      </p>
                    ) : null}
                  </div>
                </>
              );
            })()}
          </section>
        ) : cartMode ? null : (
          <section
            className="mt-8 flex gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
            aria-label="Item summary"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">
                {listing!.title || "Untitled"}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {formatNgn({ amountKobo: unitForTotal })}
                <span className="text-sm font-normal text-[var(--rw-ink-muted)]">
                  {" "}
                  per unit
                </span>
              </p>
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                {purchaseQty} unit{purchaseQty === 1 ? "" : "s"} ·{" "}
                {formatNgn({ amountKobo })} subtotal
              </p>
              {hasOfferPrice ? (
                <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                  Agreed offer price per unit
                </p>
              ) : null}
            </div>
          </section>
        )}

        {!isGift && !cartMode ? (
          <section className="mt-6 space-y-3" aria-labelledby="qty-heading">
            <h2 id="qty-heading" className="text-lg font-semibold">
              Units
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-[var(--rw-border)]"
                disabled={purchaseQty <= 1}
                onClick={() => setPurchaseQty((n) => Math.max(1, n - 1))}
                aria-label="Decrease units"
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm font-semibold">
                {purchaseQty}
              </span>
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-[var(--rw-border)]"
                disabled={purchaseQty >= maxUnits}
                onClick={() =>
                  setPurchaseQty((n) => Math.min(maxUnits, n + 1))
                }
                aria-label="Increase units"
              >
                +
              </button>
              <span className="text-sm text-[var(--rw-ink-muted)]">
                {maxUnits} available
              </span>
            </div>
          </section>
        ) : null}

        {!isGift ? (
          <CheckoutDeliveryStep
            buyerFulfilment={buyerFulfilment}
            onFulfilmentChange={setBuyerFulfilment}
            showChoice={showFulfilmentChoice}
            showMeetupOption={showMeetupOption}
            meetLocked={meetLocked}
            meetupLocationText={meetupCheckout?.locationText}
            meetupDeliveryDate={meetupCheckout?.deliveryDate}
            onArrangeMeetup={() => void openMeetupChat()}
            meetupChatBusy={meetupChatBusy}
            showAddress={showAddress}
            savedDelivery={savedDelivery}
            addressMode={addressMode}
            onAddressModeChange={setAddressMode}
            addressLine={addressLine}
            onAddressLineChange={setAddressLine}
            addressArea={addressArea}
            onAddressAreaChange={setAddressArea}
          />
        ) : null}

        {isGift ? null : (
          <aside
            className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/50 px-4 py-3"
            aria-label="Buyer protection"
          >
            <p className="text-sm font-semibold text-[var(--rw-accent)]">
              Buyer protection
            </p>
          </aside>
        )}

        <section
          className="mt-8 space-y-2 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
          aria-label="Price breakdown"
        >
          {cartMode && checkoutMeet && cartMeetupTotals ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--rw-ink-muted)]">Items</span>
                <span>
                  {formatNgn({ amountKobo: cartMeetupTotals.itemsSubtotalKobo })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--rw-ink-muted)]">
                  Buyer protection
                </span>
                <span>
                  {formatNgn({ amountKobo: cartMeetupTotals.protectionTotalKobo })}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--rw-border)] pt-2 text-base font-semibold">
                <span>Estimated total</span>
                <span>
                  {formatNgn({ amountKobo: cartMeetupTotals.grandTotalKobo })}
                </span>
              </div>
              <p className="text-xs text-[var(--rw-ink-muted)]">
                No delivery fee for meetup.
              </p>
            </>
          ) : cartMode && cartQuote && buyerFulfilment === "DELIVERY" ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--rw-ink-muted)]">Items</span>
                <span>
                  {formatNgn({ amountKobo: cartQuote.itemsSubtotalKobo })}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-[var(--rw-ink-muted)]">
                  {cartDeliveryTotalLabel(cartQuote.deliveryBySeller)}
                </span>
                <span className="shrink-0">
                  {formatNgn({ amountKobo: cartQuote.deliveryTotalKobo })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--rw-ink-muted)]">
                  Buyer protection
                </span>
                <span>
                  {formatNgn({ amountKobo: cartQuote.protectionTotalKobo })}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--rw-border)] pt-2 text-base font-semibold">
                <span>Estimated total</span>
                <span>
                  {formatNgn({ amountKobo: cartQuote.grandTotalKobo })}
                </span>
              </div>
              {cartQuoting ? (
                <p className="text-xs text-[var(--rw-ink-muted)]">
                  Updating quote…
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--rw-ink-muted)]">
                  {cartMode
                    ? "Items"
                    : `Items (${purchaseQty} × ${formatNgn({ amountKobo: unitForTotal })})`}
                </span>
                <span>
                  {formatNgn({
                    amountKobo: cartMode
                      ? cartReady.reduce(
                          (n, i) =>
                            n + i.listing.priceKobo * i.quantity,
                          0,
                        )
                      : amountKobo,
                  })}
                </span>
              </div>
              {isGift ? null : (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--rw-ink-muted)]">
                    Protection fee
                  </span>
                  <span>{formatNgn({ amountKobo: protectionFeeKobo })}</span>
                </div>
              )}
              {isGift || deliveryFeeKobo > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--rw-ink-muted)]">
                    {isGift
                      ? `Delivery to ${giftArea || "your area"}`
                      : deliveryLineLabel(
                          null,
                          "Delivery",
                          deliveryHandling,
                        )}
                  </span>
                  <span>{formatNgn({ amountKobo: deliveryFeeKobo })}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-[var(--rw-border)] pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatNgn({ amountKobo: totalKobo })}</span>
              </div>
            </>
          )}
        </section>

        {error ? (
          <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}

        {!payment ? (
          <div className="mt-8">
            {canPlaceOrder ? (
              <Button
                variant="primary"
                className="w-full"
                size="lg"
                disabled={busy}
                onClick={() => void placeAndPay()}
              >
                {busy
                  ? "Placing order…"
                  : isGift
                    ? "Pay delivery"
                    : "Place order"}
              </Button>
            ) : null}
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
