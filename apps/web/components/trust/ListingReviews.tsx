"use client";

import { useEffect, useState } from "react";
import { listListingReviews, type ListingReviewsResponse } from "../../lib/trust";

function stars(overall: number): string {
  const full = Math.max(0, Math.min(5, Math.round(overall)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export function ListingReviews({ listingId }: { listingId: string }) {
  const [data, setData] = useState<ListingReviewsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    listListingReviews(listingId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (!data) return null;

  const seller = data.seller ?? {
    average: data.average,
    count: data.count,
    items: data.items,
  };

  return (
    <section className="mt-8" aria-labelledby="listing-ratings">
      <h2 id="listing-ratings" className="text-lg font-semibold">
        Seller rating
      </h2>
      {seller.count === 0 || seller.average == null ? (
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">No buyer ratings yet.</p>
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          <span className="text-[var(--rw-accent)]" aria-hidden>
            {stars(seller.average)}
          </span>{" "}
          <span className="sr-only">
            Average {seller.average.toFixed(1)} out of 5.{" "}
          </span>
          {seller.average.toFixed(1)}
          <span className="ml-2 text-base font-medium text-[var(--rw-ink-muted)]">
            {seller.count} {seller.count === 1 ? "buyer" : "buyers"}
          </span>
        </p>
      )}
    </section>
  );
}
