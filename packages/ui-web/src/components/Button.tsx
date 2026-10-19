"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "soft"
  | "danger"
  | "sell";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--rw-accent)] text-white hover:bg-[var(--rw-accent-hover)] focus-visible:ring-[var(--rw-accent)]",
  secondary:
    "bg-[var(--rw-secondary)] text-white hover:bg-[var(--rw-secondary-hover)] focus-visible:ring-[var(--rw-secondary)]",
  ghost:
    "bg-transparent text-[var(--rw-ink)] border border-[var(--rw-ink)] hover:bg-[var(--rw-bg-warm)] focus-visible:ring-[var(--rw-ink)]",
  soft:
    "bg-[var(--rw-bg-warm)] text-[var(--rw-ink)] hover:opacity-90 focus-visible:ring-[var(--rw-ink)]",
  danger:
    "bg-[var(--rw-error)] text-white hover:opacity-90 focus-visible:ring-[var(--rw-error)]",
  sell:
    "bg-[var(--rw-accent)] text-white font-semibold shadow-[var(--rw-shadow-sell)] hover:bg-[var(--rw-accent-hover)] scale-[1.02] hover:scale-105 focus-visible:ring-[var(--rw-accent)] tracking-wide uppercase",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-[var(--rw-radius)]",
  md: "px-4 py-2.5 text-base rounded-[var(--rw-radius)]",
  lg: "px-6 py-3.5 text-lg rounded-[var(--rw-radius-lg)]",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  type = "button",
  disabled,
  ...rest
}: ButtonProps) {
  const sellSize = variant === "sell" && size === "md" ? "lg" : size;

  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[sellSize],
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
