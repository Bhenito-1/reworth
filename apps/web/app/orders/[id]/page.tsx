"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import {
  Button,
  Chip,
  EmptyState,
  Modal,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { ReviewForm } from "../../../components/trust/ReviewForm";
import { DiscoveryListingCard } from "../../../components/discovery/DiscoveryListingCard";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  discloseOrderAddress,
  getOrderShipment,
  shipmentStatusLabel,
  type DeliveryShipment,
} from "../../../lib/delivery";
import { fetchRecommendations } from "../../../lib/intelligence";
import {
  cancelOrder,
  confirmOrder,
  confirmReceipt,
  DISPUTE_REASONS,
  disputeIdFromEvents,
  fulfilmentLabel,
  getOrder,
  initiatePayment,
  isMockPsp,
  markHandedOver,
  newIdempotencyKey,
  openDispute,
  orderStatusLabel,
  paymentStatusFromOrder,
  refundStatusFromOrder,
  rejectOrder,
  simulateMockPspCharge,
  type DisputeReason,
  type OrderDetail,
  type PaymentDto,
} from "../../../lib/orders";
import type { MeResponse, PublicListing } from "../../../lib/types";
import {
  createOrderReview,
  markOrderReviewPending,
  resolveOrderReviewState,
  type CreateReviewBody,
  type OrderReviewUiState,
} from "../../../lib/trust";

function ordersListHref(from: string | null): string {
  if (from === "buying" || from === "cancelled" || from === "selling") {
    return `/orders?tab=${from}`;
  }
  return "/orders";
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const orderId = params?.id;
  const router = useRouter();
  const ordersHref = ordersListHref(searchParams.get("from"));

  const [meId, setMeId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [sellerNote, setSellerNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] =
    useState<DisputeReason>("NEVER_RECEIVED");
  const [disputeDetail, setDisputeDetail] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [reviewState, setReviewState] = useState<OrderReviewUiState | null>(
    null,
  );
  const [reviewBusy, setReviewBusy] = useState(false);
  const [alsoLike, setAlsoLike] = useState<PublicListing[]>([]);
  const [shipment, setShipment] = useState<DeliveryShipment | null>(null);
  const [discloseBusy, setDiscloseBusy] = useState(false);
  const [disclosedAddress, setDisclosedAddress] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [me, detail] = await Promise.all([
        apiFetch<MeResponse>("/me", { token }),
        getOrder(token, orderId),
      ]);
      setMeId(me.id);
      setOrder(detail);
      if (detail.fulfilmentMethod === "DELIVERY") {
        try {
          const ship = await getOrderShipment(token, detail.id);
          setShipment(ship);
        } catch {
          setShipment(null);
        }
      } else {
        setShipment(null);
      }
      if (detail.status === "COMPLETED") {
        const counterpartId =
          me.id === detail.buyerId ? detail.sellerId : detail.buyerId;
        const resolved = await resolveOrderReviewState({
          orderId: detail.id,
          meId: me.id,
          counterpartId,
        });
        setReviewState(resolved.state);
        if (me.id === detail.buyerId) {
          void fetchRecommendations(
            {
              surface: "post_checkout",
              listingId: detail.listingId,
              limit: 6,
            },
            token,
          )
            .then((res) => setAlsoLike(res.items ?? []))
            .catch(() => setAlsoLike([]));
        } else {
          setAlsoLike([]);
        }
      } else {
        setReviewState(null);
        setAlsoLike([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Order not found");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmSale() {
    const token = getAccessToken();
    if (!token || !orderId || !deliveryDate) return;
    setBusy(true);
    try {
      await confirmOrder(token, orderId, {
        deliveryDate: new Date(deliveryDate).toISOString(),
        sellerNote: sellerNote.trim() || undefined,
      });
      setToast({ message: "Buyer notified", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not confirm",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function rejectSale() {
    const token = getAccessToken();
    if (!token || !orderId || rejectReason.trim().length < 3) return;
    setBusy(true);
    try {
      await rejectOrder(token, orderId, rejectReason.trim());
      setToast({ message: "Order rejected", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not reject",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function payNow() {
    const token = getAccessToken();
    if (!token || !orderId) return;
    setBusy(true);
    try {
      const pay = await initiatePayment(token, {
        orderId,
        idempotencyKey: newIdempotencyKey(),
      });
      setPayment(pay);
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not start payment",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function simulatePay() {
    if (!payment || !orderId) return;
    setBusy(true);
    try {
      await simulateMockPspCharge({
        reference: payment.reference,
        event: "charge.success",
      });
      setPayment(null);
      setToast({ message: "Payment confirmed", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Payment failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function runAction(
    action: "handed-over" | "confirm" | "cancel",
  ) {
    const token = getAccessToken();
    if (!token || !orderId) return;
    setBusy(true);
    try {
      if (action === "handed-over") await markHandedOver(token, orderId);
      else if (action === "confirm") await confirmReceipt(token, orderId);
      else await cancelOrder(token, orderId);
      setToast({ message: "Updated", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Action failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitDispute(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !orderId) return;
    setBusy(true);
    try {
      const d = await openDispute(token, orderId, {
        reason: disputeReason,
        detail: disputeDetail.trim() || undefined,
      });
      setDisputeOpen(false);
      setToast({ message: "Dispute opened", tone: "success" });
      router.push(`/disputes/${d.id}`);
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not open dispute",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(body: CreateReviewBody) {
    const token = getAccessToken();
    if (!token || !orderId) return;
    setReviewBusy(true);
    try {
      const created = await createOrderReview(token, orderId, body);
      if (created.status === "PUBLISHED") {
        setReviewState("done");
        setToast({ message: "Reviews published", tone: "success" });
      } else {
        markOrderReviewPending(orderId);
        setReviewState("waiting");
        setToast({
          message: "Review saved — waiting for the other party",
          tone: "success",
        });
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Could not submit review";
      if (/already reviewed/i.test(msg)) {
        markOrderReviewPending(orderId);
        setReviewState("waiting");
        setToast({
          message: "Waiting for the other party",
          tone: "info",
        });
      } else {
        setToast({ message: msg, tone: "error" });
      }
    } finally {
      setReviewBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Order unavailable"
          description={error ?? "Not found"}
          action={
            <Link href={ordersHref}>
              <Button variant="primary">All orders</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const isBuyer = meId === order.buyerId;
  const isSeller = meId === order.sellerId;
  const disputeId = disputeIdFromEvents(order.events);
  const canCancel =
    isBuyer &&
    (order.status === "CREATED" || order.status === "PAYMENT_PENDING");
  const awaitingSeller =
    isSeller &&
    order.confirmationStatus === "PENDING" &&
    order.status === "CREATED";
  const canPay =
    isBuyer &&
    order.status === "PAYMENT_PENDING" &&
    order.confirmationStatus !== "PENDING";
  const canHandOver =
    isSeller &&
    (order.status === "FUNDED" || order.status === "IN_AUTHENTICATION");
  const canConfirm = isBuyer && ["HANDED_OVER", "DELIVERED", "SHIPPED"].includes(order.status);
  const canDispute =
    isBuyer &&
    (order.status === "RECEIVED" ||
      order.status === "COMPLETED" ||
      order.status === "DELIVERED" ||
      order.status === "SHIPPED" ||
      order.status === "HANDED_OVER") &&
    !disputeId;

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28vh]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(14,159,110,0.1), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link
            href={ordersHref}
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Orders
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {order.listingTitle?.trim() || "Order"}
            </h1>
            <p className="mt-1 text-lg font-semibold">
              {formatNgn({ amountKobo: order.totalKobo })}
            </p>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              {isBuyer ? "Buying" : isSeller ? "Selling" : "Order"} ·{" "}
              {fulfilmentLabel(String(order.fulfilmentMethod))}
            </p>
          </div>
          <Chip selected className="pointer-events-none">
            {orderStatusLabel(String(order.status))}
          </Chip>
        </div>

        <dl className="mt-6 grid gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--rw-ink-muted)]">Item</dt>
            <dd className="font-medium">
              {order.listingTitle?.trim() || "Listing"}
              {order.quantity && order.quantity > 1 ? ` · ${order.quantity} units` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--rw-ink-muted)]">Protection fee</dt>
            <dd className="font-medium">
              {formatNgn({ amountKobo: order.protectionFeeKobo })}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--rw-ink-muted)]">Payment</dt>
            <dd className="font-medium">{paymentStatusFromOrder(order)}</dd>
          </div>
          <div>
            <dt className="text-[var(--rw-ink-muted)]">Refund</dt>
            <dd className="font-medium">{refundStatusFromOrder(order)}</dd>
          </div>
        </dl>

        {order.confirmationStatus === "PENDING" && order.status === "CREATED" ? (
          <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
            {isBuyer
              ? "Waiting for the seller to confirm this order. Your units are reserved. You can cancel before paying."
              : "Confirm the delivery date so the buyer can pay. The units stay reserved until you confirm, reject, or they cancel."}
          </p>
        ) : null}
        {order.deliveryDate ? (
          <p className="mt-2 text-sm">
            Delivery date{" "}
            {new Date(order.deliveryDate).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {order.sellerNote ? ` · ${order.sellerNote}` : ""}
          </p>
        ) : null}
        {order.rejectionReason ? (
          <p className="mt-2 text-sm text-red-700">
            Rejected: {order.rejectionReason}
          </p>
        ) : null}

        {awaitingSeller ? (
          <form
            className="mt-4 space-y-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmSale();
            }}
          >
            <label className="block text-sm font-medium">
              Delivery date
              <input
                type="date"
                required
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="mt-1 w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-transparent px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Note for the buyer
              <textarea
                value={sellerNote}
                onChange={(e) => setSellerNote(e.target.value)}
                maxLength={500}
                className="mt-1 w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-transparent px-3 py-2"
                rows={3}
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy || !deliveryDate}>
              Accept order
            </Button>
            <label className="block text-sm font-medium">
              Rejection reason
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={500}
                className="mt-1 w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-transparent px-3 py-2"
                rows={2}
              />
            </label>
            <Button
              type="button"
              variant="danger"
              disabled={busy || rejectReason.trim().length < 3}
              onClick={() => void rejectSale()}
            >
              Reject order
            </Button>
          </form>
        ) : null}

        {canPay ? (
          <div className="mt-4 space-y-2">
            {!payment ? (
              <Button variant="primary" disabled={busy} onClick={() => void payNow()}>
                Complete payment
              </Button>
            ) : isMockPsp(payment) ? (
              <Button variant="primary" disabled={busy} onClick={() => void simulatePay()}>
                Simulate payment
              </Button>
            ) : payment.checkoutUrl ? (
              <a href={payment.checkoutUrl} className="text-sm font-medium text-[var(--rw-accent)]">
                Continue to payment
              </a>
            ) : null}
          </div>
        ) : null}

        {order.buyerProtection ? (
          <aside className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/40 px-4 py-3 text-sm">
            <p className="font-semibold text-[var(--rw-accent)]">
              Buyer protection active
            </p>
            {order.coverageEndsAt ? (
              <p className="mt-1 text-[var(--rw-ink-muted)]">
                Coverage until{" "}
                {new Date(order.coverageEndsAt).toLocaleString("en-NG")}
              </p>
            ) : null}
          </aside>
        ) : null}

        {shipment ? (
          <section
            className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
            aria-labelledby="shipment-heading"
          >
            <h2 id="shipment-heading" className="text-base font-semibold">
              Delivery tracking
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--rw-accent)]">
              {shipmentStatusLabel(shipment.status)}
            </p>
            {shipment.events?.length ? (
              <ol className="mt-3 space-y-2 text-sm text-[var(--rw-ink-muted)]">
                {shipment.events.map((e) => (
                  <li key={e.id}>
                    {shipmentStatusLabel(e.status)} ·{" "}
                    {new Date(e.createdAt).toLocaleString("en-NG")}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}

        {isSeller &&
        order.fulfilmentMethod === "PICKUP" &&
        (order.status === "FUNDED" ||
          order.status === "IN_AUTHENTICATION" ||
          order.status === "SHIPPED" ||
          order.status === "HANDED_OVER" ||
          order.status === "DELIVERED") ? (
          <section
            className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
            aria-labelledby="disclose-heading"
          >
            <h2 id="disclose-heading" className="text-base font-semibold">
              Pickup address
            </h2>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              Share your exact address only after payment. This cannot be
              revoked.
            </p>
            {disclosedAddress ? (
              <p className="mt-3 text-sm font-medium">{disclosedAddress}</p>
            ) : (
              <Button
                className="mt-3"
                variant="secondary"
                disabled={discloseBusy}
                onClick={() => {
                  void (async () => {
                    const token = getAccessToken();
                    if (!token) return;
                    setDiscloseBusy(true);
                    try {
                      const res = await discloseOrderAddress(token, order.id);
                      setDisclosedAddress(res.addressSnapshot);
                      setToast({
                        message: "Address shared with buyer",
                        tone: "success",
                      });
                    } catch (err) {
                      setToast({
                        message:
                          err instanceof ApiError
                            ? err.message
                            : "Disclose failed",
                        tone: "error",
                      });
                    } finally {
                      setDiscloseBusy(false);
                    }
                  })();
                }}
              >
                {discloseBusy ? "…" : "Disclose address to buyer"}
              </Button>
            )}
          </section>
        ) : null}

        {disputeId ? (
          <p className="mt-4">
            <Link
              href={`/disputes/${disputeId}`}
              className="text-sm font-semibold text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              View dispute →
            </Link>
          </p>
        ) : null}

        <section className="mt-8" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="text-lg font-semibold">
            Timeline
          </h2>
          <ol className="mt-4 space-y-0 border-l-2 border-[var(--rw-border)] pl-4">
            {order.events.map((ev) => (
              <li key={ev.id} className="relative pb-5 last:pb-0">
                <span
                  aria-hidden
                  className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--rw-accent)]"
                />
                <p className="text-sm font-medium">
                  {orderStatusLabel(ev.type) === ev.type
                    ? ev.type.replace(/_/g, " ")
                    : orderStatusLabel(ev.type)}
                </p>
                <time
                  className="text-xs text-[var(--rw-ink-muted)]"
                  dateTime={ev.createdAt}
                >
                  {new Date(ev.createdAt).toLocaleString("en-NG")}
                </time>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          {canHandOver ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void runAction("handed-over")}
            >
              Mark handed over
            </Button>
          ) : null}
          {canConfirm ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void runAction("confirm")}
            >
              Confirm receipt
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void runAction("cancel")}
            >
              Cancel order
            </Button>
          ) : null}
          {canDispute ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDisputeOpen(true)}
            >
              Open dispute
            </Button>
          ) : null}
        </div>

        {order.status === "COMPLETED" ? (
          <section className="mt-10" aria-labelledby="review-section">
            <h2 id="review-section" className="sr-only">
              Review
            </h2>
            {reviewState === "form" ? (
              <ReviewForm
                submitting={reviewBusy}
                onSubmit={submitReview}
              />
            ) : null}
            {reviewState === "waiting" ? (
              <aside className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-gold)]/40 bg-[var(--rw-gold-muted)]/50 px-4 py-4">
                <p className="font-semibold">Waiting for other party</p>
                <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                  Your review is saved. It will publish when they leave theirs.
                </p>
              </aside>
            ) : null}
            {reviewState === "done" ? (
              <aside className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/40 px-4 py-4">
                <p className="font-semibold text-[var(--rw-accent)]">
                  Review published
                </p>
                <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                  Thanks — both sides have rated this order.
                </p>
              </aside>
            ) : null}
          </section>
        ) : null}

        {alsoLike.length > 0 ? (
          <section className="mt-12" aria-labelledby="also-like-heading">
            <h2 id="also-like-heading" className="text-lg font-semibold">
              You might also like
            </h2>
            <ul className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {alsoLike.map((item) => (
                <li key={item.id} className="w-40 shrink-0">
                  <DiscoveryListingCard listing={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <Modal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        title="Open dispute"
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => void submitDispute(e)}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Reason</legend>
            <div className="flex flex-wrap gap-2">
              {DISPUTE_REASONS.map((r) => (
                <Chip
                  key={r.value}
                  selected={disputeReason === r.value}
                  onClick={() => setDisputeReason(r.value)}
                >
                  {r.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dispute-detail" className="text-sm font-medium">
              Details (optional)
            </label>
            <textarea
              id="dispute-detail"
              value={disputeDetail}
              onChange={(e) => setDisputeDetail(e.target.value)}
              rows={3}
              maxLength={4000}
              className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
            />
          </div>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Submitting…" : "Submit dispute"}
          </Button>
        </form>
      </Modal>

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
