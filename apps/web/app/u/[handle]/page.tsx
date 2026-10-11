"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, EmptyState, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getStorefront, type ProStorefront } from "../../../lib/pro";
import type { PublicListing } from "../../../lib/types";
import { DiscoveryListingCard } from "../../../components/discovery/DiscoveryListingCard";

/**
 * Public pro storefront at /u/{handle}.
 * Production vanity /@handle can rewrite to /u/:handle (see next.config.ts).
 */
export default function StorefrontPage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeURIComponent(params?.handle ?? "").replace(/^@/, "");

  const [storefront, setStorefront] = useState<ProStorefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!handle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStorefront(handle);
      setStorefront(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Storefront not found");
      setStorefront(null);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
    );
  }

  if (error || !storefront) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Storefront unavailable"
          description={error ?? "This seller handle was not found."}
          action={
            <Link href="/">
              <Button variant="primary">Back home</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const listings: PublicListing[] =
    storefront.listings ?? storefront.items ?? [];
  const name =
    storefront.businessName ||
    storefront.displayName ||
    `@${storefront.handle || handle}`;

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-8">
        <section className="rw-fade-up">
          <p className="text-sm font-medium text-[var(--rw-ink-muted)]">
            @{storefront.handle || handle}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{name}</h1>
          {storefront.verificationBadge ? (
            <p className="mt-2 text-sm font-medium text-[var(--rw-accent)]">
              Identity Verified ✓
            </p>
          ) : null}
          {storefront.bio ? (
            <p className="mt-4 text-sm leading-relaxed text-[var(--rw-ink-muted)]">
              {storefront.bio}
            </p>
          ) : null}
        </section>

        <section className="mt-10" aria-labelledby="storefront-listings">
          <h2 id="storefront-listings" className="text-lg font-semibold">
            Listings
          </h2>
          {!listings.length ? (
            <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
              No live listings yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-3">
              {listings.map((item) => (
                <li key={item.id} className="w-[7.5rem] shrink-0">
                  <DiscoveryListingCard listing={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
