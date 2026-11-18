"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton } from "@reworth/ui-web";
import { PullToRefresh } from "../../../components/PullToRefresh";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  getSellerWallet,
  walletStateLabel,
  type SellerWallet,
} from "../../../lib/wallet";

function AmountCard({
  label,
  hint,
  amountKobo,
}: {
  label: string;
  hint: string;
  amountKobo: number;
}) {
  return (
    <section className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
      <h2 className="text-sm font-medium text-[var(--rw-ink-muted)]">{label}</h2>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {formatNgn({ amountKobo })}
      </p>
      <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">{hint}</p>
    </section>
  );
}

export default function SellerWalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login?next=%2Fselling%2Fwallet");
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      setWallet(await getSellerWallet(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login?next=%2Fselling%2Fwallet");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load your wallet");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <PullToRefresh
        className="mx-auto max-w-lg px-4 py-8 sm:px-8"
        onRefresh={() => load({ silent: true })}
      >
        <p className="text-sm">
          <Link href="/selling" className="font-medium text-[var(--rw-accent)]">
            ← My listings
          </Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Item payments stay held until the buyer confirms delivery. Then Paystack
          sends that amount to your bank. Protection and delivery fees are not yours.
        </p>

        {loading ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-24 w-full" label="Loading wallet" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="mt-8 text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : wallet ? (
          <>
            <div className="mt-8 grid gap-3">
              <AmountCard
                label="Held in escrow"
                hint="Paid by buyers, still waiting for delivery confirmation."
                amountKobo={wallet.escrowKobo}
              />
              <AmountCard
                label="Withdrawn to your bank"
                hint="Transfers Paystack has paid into your account."
                amountKobo={wallet.withdrawnKobo}
              />
              {wallet.sendingKobo > 0 ? (
                <AmountCard
                  label="Sending to your bank"
                  hint="Paystack has accepted these transfers. They are not in your account yet."
                  amountKobo={wallet.sendingKobo}
                />
              ) : null}
              {wallet.failedKobo > 0 ? (
                <AmountCard
                  label="Not sent"
                  hint="These transfers failed. Retry them from the order."
                  amountKobo={wallet.failedKobo}
                />
              ) : null}
            </div>

            <h2 className="mt-10 text-lg font-semibold">Recent</h2>
            {wallet.entries.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No payments yet"
                  description="When a buyer pays for one of your listings, the amount shows here until it reaches your bank."
                  action={
                    <Link href="/sell">
                      <Button variant="primary">List an item</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]">
                {wallet.entries.map((entry) => (
                  <li key={`${entry.state}-${entry.orderId}`}>
                    <Link
                      href={`/orders/${entry.orderId}`}
                      className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                      <span>
                        <span className="block font-medium">{entry.title}</span>
                        <span className="mt-0.5 block text-xs text-[var(--rw-ink-muted)]">
                          {walletStateLabel(entry.state)} · {entry.reference}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">
                        {formatNgn({ amountKobo: entry.amountKobo })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </PullToRefresh>
    </main>
  );
}
