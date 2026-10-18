"use client";

import { useEffect, useRef, useState, type HTMLAttributes, ReactNode } from "react";

export type ToastTone = "info" | "success" | "warn" | "error";

const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  success: 2800,
  info: 3200,
  warn: 4000,
  error: 4500,
};

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  tone?: ToastTone;
  open?: boolean;
  onDismiss?: () => void;
  /** How long the toast stays before it fades. `0` keeps it until dismissed. */
  durationMs?: number;
  action?: ReactNode;
  className?: string;
}

const toneStyles: Record<ToastTone, string> = {
  info: "bg-[var(--rw-bg-elevated)] border-[var(--rw-border)] text-[var(--rw-ink)]",
  success:
    "bg-[var(--rw-success-muted)] border-[var(--rw-success)] text-[var(--rw-ink)]",
  warn: "bg-[var(--rw-warn-muted)] border-[var(--rw-warn)] text-[var(--rw-ink)]",
  error:
    "bg-[var(--rw-error-muted)] border-[var(--rw-error)] text-[var(--rw-ink)]",
};

export function Toast({
  message,
  tone = "info",
  open = true,
  onDismiss,
  durationMs,
  action,
  className = "",
  role = "status",
  ...rest
}: ToastProps) {
  const [leaving, setLeaving] = useState(false);
  const visibleFor = durationMs ?? DEFAULT_DURATION_MS[tone];
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    setLeaving(false);
    if (!open || visibleFor <= 0) return;
    const fadeTimer = window.setTimeout(() => setLeaving(true), visibleFor);
    const dismissTimer = window.setTimeout(
      () => onDismissRef.current?.(),
      visibleFor + 280,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [open, message, tone, visibleFor]);

  if (!open) return null;

  return (
    <div
      role={role}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={[
        "flex items-start gap-3 rounded-[var(--rw-radius)] border px-4 py-3 shadow-md transition-opacity duration-300",
        leaving ? "opacity-0" : "opacity-100",
        toneStyles[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <p className="flex-1 text-sm font-medium">{message}</p>
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 rounded p-0.5 text-[var(--rw-ink-muted)] hover:text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </div>
  );
}
