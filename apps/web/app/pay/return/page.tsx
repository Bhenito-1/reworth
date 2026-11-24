"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  confirmPayment,
  type ChargeConfirmDto,
  type PaymentDto,
} from "../../../lib/orders";

const PURPOSE_LABEL: Record<ChargeConfirmDto["purpose"], string> = {
  BOOST: "Boost",
  FEATURED: "Featured slot",
  SELLER_PLUS: "Seller Plus",
};

function PayReturn() {
  const router = useRouter();
  const search = useSearchParams();
  const reference =
    search.get("reference")?.trim() || search.get("trxref")?.trim() || "";
  const [payment, setPayment] = useState<PaymentDto | ChargeConfirmDto | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!reference) {
      setPending(false);
      setError("Paystack did not return a payment reference.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      const next = `/pay/return?reference=${encodeURIComponent(reference)}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    let cancelled = false;
    async function run() {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const result = await confirmPayment(token!, reference);
          if (cancelled) return;
          setPayment(result);
          if (result.status !== "PENDING") {
            setPending(false);
            return;
          }
        } catch (err) {
          if (cancelled) return;
          setError(
            err instanceof ApiError ? err.message : "Could not confirm payment",
          );
          setPending(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!cancelled) setPending(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  const paid = payment?.status === "SUCCESS" || payment?.status === "RELEASED";
  const failed = payment?.status === "FAILED";
  const charge =
    payment && "purpose" in payment ? (payment as ChargeConfirmDto) : null;

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-lg rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-surface)] p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--rw-ink-muted)]">
          Paystack
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--rw-ink)]">
          {pending && !payment
            ? "Confirming payment"
            : paid
              ? "Payment received"
              : failed
                ? "Payment failed"
                : "Payment still pending"}
        </h1>

        {pending && !error ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-6 w-40" label="Checking Paystack" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}

        {payment ? (
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--rw-ink-muted)]">Amount</dt>
              <dd className="font-semibold">
                {formatNgn({ amountKobo: payment.amountKobo })}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--rw-ink-muted)]">Status</dt>
              <dd className="font-medium">{payment.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--rw-ink-muted)]">Reference</dt>
              <dd className="max-w-[14rem] truncate font-mono text-xs">
                {payment.reference}
              </dd>
            </div>
          </dl>
        ) : null}

        {charge ? (
          <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
            {PURPOSE_LABEL[charge.purpose]}
            {paid
              ? charge.purpose === "SELLER_PLUS"
                ? " is now on for 30 days."
                : " is now live on your listing."
              : " switches on once Paystack confirms the charge."}
          </p>
        ) : paid ? (
          <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
            Paystack has the money. The seller is paid only after you confirm
            the item arrived and buyer protection ends.
          </p>
        ) : null}
        {failed ? (
          <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
            Paystack did not capture this charge. You can try again from{" "}
            {charge ? "the listing" : "the order"}.
          </p>
        ) : null}
        {!pending && payment?.status === "PENDING" ? (
          <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
            Paystack has not confirmed this charge yet. If you completed the
            card form, wait a moment and refresh.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-8 space-y-3">
          {charge?.listingId ? (
            <Link href={`/listings/${charge.listingId}`} className="block">
              <Button variant="primary" className="w-full" size="lg">
                View listing
              </Button>
            </Link>
          ) : charge ? (
            <Link href="/selling" className="block">
              <Button variant="primary" className="w-full" size="lg">
                Back to selling
              </Button>
            </Link>
          ) : payment?.orderId ? (
            <Link href={`/orders/${payment.orderId}`} className="block">
              <Button variant="primary" className="w-full" size="lg">
                View order
              </Button>
            </Link>
          ) : (
            <Link href="/orders" className="block">
              <Button variant="primary" className="w-full" size="lg">
                View orders
              </Button>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PayReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8">
          <div className="mx-auto max-w-lg">
            <Skeleton className="h-40 w-full" label="Loading payment" />
          </div>
        </main>
      }
    >
      <PayReturn />
    </Suspense>
  );
}
