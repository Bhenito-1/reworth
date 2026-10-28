"use client";

import { useState } from "react";
import { Input } from "@reworth/ui-web";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "password" | "new-password";
};

export function PasswordField({ label, value, onChange, autoComplete }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      label={label}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          className="rounded p-1 text-[var(--rw-ink-muted)] hover:text-[var(--rw-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rw-accent)]"
          aria-pressed={visible}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M2.5 12s3.45-6.25 9.5-6.25 9.5 6.25 9.5 6.25-3.45 6.25-9.5 6.25S2.5 12 2.5 12Z" />
              <circle cx="12" cy="12" r="2.7" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M3 14.2c2.25 2.55 5.25 3.8 9 3.8s6.75-1.25 9-3.8" />
              <path d="m6.2 16.6-1.35 1.65m5.05-.3-.55 2m4.95-2 .55 2m3.25-3.35 1.35 1.65" />
            </svg>
          )}
        </button>
      }
    />
  );
}
