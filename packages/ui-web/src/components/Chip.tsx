"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  children: ReactNode;
  className?: string;
}

export function Chip({
  selected = false,
  children,
  className = "",
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[
        "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
        selected
          ? "bg-[var(--rw-bg-warm)] text-[var(--rw-ink)] border border-[var(--rw-border)]"
          : "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)] border border-[var(--rw-border)] hover:bg-[var(--rw-bg-warm)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
