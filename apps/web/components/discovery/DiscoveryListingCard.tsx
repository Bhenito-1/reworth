"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListingCard } from "@reworth/ui-web";
import { CartIcon } from "../AppNav";
import { listingPriceLabel } from "../../lib/discovery";
import { listingImageUrl } from "../../lib/listings";
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

  return (
    <div className={`relative h-full ${className}`}>
      <Link
        href={href ?? `/listings/${listing.id}`}
        className="block h-full rounded-[var(--rw-radius-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
      >
        <ListingCard
          title={listing.title || "Untitled"}
          priceLabel={listingPriceLabel(listing)}
          community={listing.community || undefined}
          imageSrc={src}
          imageAlt=""
          onImageError={photo ? () => setPhotoFailed(true) : undefined}
          verified={listing.seller.verificationBadge}
        />
      </Link>
      {note ? (
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-[var(--rw-bg-elevated)]/95 px-2.5 py-1 text-xs font-semibold text-[var(--rw-ink)] shadow-sm">
          {note}
        </span>
      ) : null}
      {onToggleFavourite ? (
        <button
          type="button"
          aria-label={favourited ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={Boolean(favourited)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavourite(listing);
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddToCart(listing);
          }}
          className="absolute right-1.5 top-11 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 text-[var(--rw-ink)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <CartIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
