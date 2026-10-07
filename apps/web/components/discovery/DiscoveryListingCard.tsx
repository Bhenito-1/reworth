"use client";

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
  onToggleFavourite?: (listing: PublicListing) => void;
  onAddToCart?: (listing: PublicListing) => void;
  className?: string;
};

export function DiscoveryListingCard({
  listing,
  href,
  favourited,
  onToggleFavourite,
  onAddToCart,
  className = "",
}: Props) {
  const images = [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const src = listingImageUrl(images[0]) ?? undefined;

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
          verified={listing.seller.verificationBadge}
        />
      </Link>
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
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--rw-bg-elevated)]/95 text-lg shadow-sm border border-[var(--rw-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
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
          className="absolute right-14 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--rw-bg-elevated)]/95 text-[var(--rw-ink)] shadow-sm border border-[var(--rw-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <CartIcon />
        </button>
      ) : null}
    </div>
  );
}
