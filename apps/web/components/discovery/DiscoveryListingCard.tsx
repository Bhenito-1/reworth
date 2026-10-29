"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CartIcon } from "../AppNav";
import { listingPriceLabel } from "../../lib/discovery";
import {
  CONDITION_LABELS,
  listingImageUrl,
  sentenceCaseLabel,
} from "../../lib/listings";
import type { PublicListing } from "../../lib/types";

type Props = {
  listing: PublicListing;
  href?: string;
  favourited?: boolean;
  note?: string | null;
  onToggleFavourite?: (listing: PublicListing) => void;
  onAddToCart?: (listing: PublicListing) => void;
  className?: string;
};

function conditionText(value: string): string {
  return CONDITION_LABELS[value] ?? sentenceCaseLabel(value);
}

function imageBadge(listing: PublicListing): string | null {
  if (listing.sellingMode === "SWAP") return "Swap only";
  return listing.condition ? conditionText(listing.condition) : null;
}

export function DiscoveryListingCard({
  listing,
  href,
  favourited,
  note,
  onToggleFavourite,
  onAddToCart,
  className = "",
}: Props) {
  const images = [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const photo = listingImageUrl(images[0]);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [photo]);
  const src =
    photo && !photoFailed
      ? photo
      : "/brand/illustrations/listing-placeholder.png";
  const badge = note || imageBadge(listing);
  const place = listing.community || listing.city || "";
  const side =
    listing.sellingMode === "SWAP" && listing.condition
      ? conditionText(listing.condition)
      : listing.sellingMode === "SELL" && listing.negotiable
        ? "Offer"
        : null;

  return (
    <div className={`relative h-full ${className}`}>
      <Link
        href={href ?? `/listings/${listing.id}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] shadow-[0_8px_24px_rgba(23,42,58,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
      >
        <div className="relative aspect-[5/4] w-full bg-[var(--rw-bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={photo ? () => setPhotoFailed(true) : undefined}
          />
          {badge ? (
            <span className="absolute left-2 top-2 max-w-[70%] truncate rounded-full bg-[var(--rw-bg-elevated)]/95 px-2 py-0.5 text-[11px] font-semibold text-[var(--rw-ink)]">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-base font-semibold tracking-tight text-[var(--rw-ink)]">
              {listingPriceLabel(listing)}
            </p>
            {side ? (
              <p className="shrink-0 text-[11px] text-[var(--rw-ink-muted)]">
                {side}
              </p>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-sm leading-5 text-[var(--rw-ink)]">
            {listing.title || "Untitled"}
            {listing.seller.verificationBadge ? (
              <span className="text-[var(--rw-success)]" aria-label="Verified seller">
                {" "}
                ✓
              </span>
            ) : null}
          </h3>
          <p className="mt-auto flex items-center gap-1 truncate pt-1 text-xs text-[var(--rw-ink-muted)]">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden
            >
              <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.25" />
            </svg>
            <span className="truncate">{place || "Lagos"}</span>
          </p>
        </div>
      </Link>
      {onToggleFavourite ? (
        <button
          type="button"
          aria-label={favourited ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={Boolean(favourited)}
          onClick={() => onToggleFavourite(listing)}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <span aria-hidden style={{ color: favourited ? "#DC2626" : "#5C636A" }}>
            {favourited ? "♥" : "♡"}
          </span>
        </button>
      ) : null}
      {onAddToCart ? (
        <button
          type="button"
          aria-label="Add to cart"
          onClick={() => onAddToCart(listing)}
          className="absolute right-2 top-12 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 text-[var(--rw-ink)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <CartIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
