"use client";

import type { HTMLAttributes, ReactNode } from "react";

export interface ListingCardProps extends HTMLAttributes<HTMLElement> {
  title: string;
  priceLabel: string;
  community?: string;
  imageSrc?: string;
  imageAlt?: string;
  verified?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function ListingCard({
  title,
  priceLabel,
  community,
  imageSrc,
  imageAlt,
  verified = false,
  footer,
  className = "",
  ...rest
}: ListingCardProps) {
  return (
    <article
      className={[
        "flex h-full flex-col overflow-hidden rounded-[var(--rw-radius-lg)]",
        "bg-[var(--rw-bg-elevated)] border border-[var(--rw-border)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <div className="relative aspect-[3/4] shrink-0 bg-[var(--rw-bg-warm)]">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={imageAlt ?? title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[var(--rw-ink-muted)] text-sm"
            aria-hidden
          >
            No photo
          </div>
        )}
        {verified ? (
          <span
            className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              background: "var(--rw-gold-muted)",
              color: "var(--rw-gold)",
            }}
            aria-label="Verified seller"
          >
            Verified ✓
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-lg font-semibold leading-tight text-[var(--rw-ink)]">
          {priceLabel}
        </p>
        <h3 className="line-clamp-2 min-h-11 text-base font-medium leading-snug text-[var(--rw-ink)]">
          {title}
        </h3>
        <p className="min-h-5 truncate text-sm leading-5 text-[var(--rw-ink-muted)]">
          {community || "\u00a0"}
        </p>
        {footer ? <div className="mt-auto pt-2">{footer}</div> : null}
      </div>
    </article>
  );
}
