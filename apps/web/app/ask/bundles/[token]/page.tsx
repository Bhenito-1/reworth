"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BackLink } from "../../../../components/BackLink";
import { useParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../../../lib/api";
import { getBundleByToken } from "../../../../lib/assistant";
import { getAccessToken } from "../../../../lib/auth";
import type { SavedBundle } from "../../../../lib/types";

export default function ShareableBundlePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [bundle, setBundle] = useState<SavedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getBundleByToken(token, getAccessToken());
      setBundle(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Bundle not found",
      );
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[36vh]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 30% 0%, rgba(14,159,110,0.12), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <BackLink href="/ask" />
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error || !bundle ? (
          <EmptyState
            title="Bundle unavailable"
            description={error ?? "This share link may have expired."}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {bundle.brief}
            </h1>
            <p className="mt-2 text-[var(--rw-ink-muted)]">
              Combined{" "}
              <span className="font-semibold text-[var(--rw-ink)]">
                {formatNgn({ amountKobo: bundle.totalKobo })}
              </span>
              {" · "}budget{" "}
              {formatNgn({ amountKobo: bundle.budgetKobo })}
              {bundle.city ? ` · ${bundle.city}` : ""}
            </p>

            {(bundle.listings?.length ?? 0) > 0 ? (
              <ul className="mt-8 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90">
                {bundle.listings!.map((listing) => (
                  <li key={listing.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/listings/${listing.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {listing.title || "Listing"}
                      </Link>
                      {"city" in listing && listing.city ? (
                        <p className="text-xs text-[var(--rw-ink-muted)]">
                          {String(listing.city)}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-semibold">
                      {formatNgn({ amountKobo: listing.priceKobo })}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-8 text-sm text-[var(--rw-ink-muted)]">
                {bundle.listingIds.length} listing
                {bundle.listingIds.length === 1 ? "" : "s"} in this bundle.
                Open each from Ask ReWorth if previews are unavailable.
              </p>
            )}

            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/ask">
                <Button variant="primary">Ask for another bundle</Button>
              </Link>
              <Link href="/">
                <Button variant="secondary">Browse home</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
