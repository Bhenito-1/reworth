"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ListingActionVariant =
  | "primary"
  | "accent"
  | "soft"
  | "softActive";

const variantClass: Record<ListingActionVariant, string> = {
  primary:
    "border-transparent bg-[var(--rw-accent)] text-white shadow-[0_1px_2px_rgba(14,159,110,0.22)] hover:brightness-[1.04] active:brightness-[0.97]",
  accent:
    "border-[var(--rw-accent)]/28 bg-[var(--rw-accent-muted)]/22 text-[var(--rw-accent)] hover:border-[var(--rw-accent)]/45 hover:bg-[var(--rw-accent-muted)]/38",
  soft:
    "border-[var(--rw-border)]/90 bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-[var(--rw-accent)]/28 hover:bg-[var(--rw-bg)]",
  softActive:
    "border-rose-200/90 bg-rose-50/70 text-[var(--rw-ink)] hover:bg-rose-50/90",
};

const baseClass =
  "inline-flex w-auto max-w-full min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold leading-tight tracking-tight transition touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:px-4";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ListingActionVariant;
  children: ReactNode;
};

export const ListingActionButton = forwardRef<HTMLButtonElement, Props>(
  function ListingActionButton(
    { variant = "soft", className = "", children, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={[baseClass, variantClass[variant], className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </button>
    );
  },
);