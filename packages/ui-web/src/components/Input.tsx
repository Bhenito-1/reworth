"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  wrapperClassName?: string;
  trailing?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  id,
  className = "",
  wrapperClassName = "",
  trailing,
  ...rest
}: InputProps) {
  const inputId = id ?? `rw-input-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <div className={["flex flex-col gap-1.5", wrapperClassName].filter(Boolean).join(" ")}>
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-[var(--rw-ink)]"
      >
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          suppressHydrationWarning
          className={[
            "w-full rounded-[var(--rw-radius)] border px-3 py-2.5 text-base",
            "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)]",
            "placeholder:text-[var(--rw-ink-muted)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
            error
              ? "border-[var(--rw-error)]"
              : "border-[var(--rw-border)]",
            trailing ? "pr-10" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
        {trailing ? (
          <span className="absolute right-3 text-[var(--rw-ink-muted)]">
            {trailing}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-[var(--rw-error)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-[var(--rw-ink-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
