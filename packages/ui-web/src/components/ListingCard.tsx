"use client";

import type { HTMLAttributes, ReactNode } from "react";

export interface ListingCardProps extends HTMLAttributes<HTMLElement> {
  title: string;
  priceLabel: string;
  community?: string;
  imageSrc?: string;
  imageAlt?: string;
  onImageError?: () => void;
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
  onImageError,
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
      <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-[var(--rw-bg-warm)]">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={imageAlt ?? title}
            className="absolute inset-0 h-full w-full object-cover"
            onError={onImageError}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-sm text-[var(--rw-ink-muted)]"
            aria-hidden
          >
            No photo
          </div>
        )}
        {verified ? (
          <span
            className="absolute top-2 left-2 z-[1] max-w-[calc(100%-2.75rem)] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4"
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
      <div className="flex flex-1 flex-col gap-0.5 p-2">
        <p className="truncate text-sm font-semibold leading-tight text-[var(--rw-ink)]">
          {priceLabel}
        </p>
        <h3 className="truncate text-sm font-medium leading-5 text-[var(--rw-ink)]">
          {title}
        </h3>
        <p className="h-4 truncate text-xs leading-4 text-[var(--rw-ink-muted)]">
          {community || "\u00a0"}
        </p>
        {footer ? <div className="mt-auto pt-2">{footer}</div> : null}
      </div>
    </article>
  );
}
