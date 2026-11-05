"use client";

import { useEffect, useId, useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import {
  getInstallGuide,
  type InstallPlatform,
} from "../lib/pwa-install";

type Props = {
  className?: string;
};

const GUIDE_SECTIONS: { id: InstallPlatform; label: string }[] = [
  { id: "desktop", label: "Desktop — Chrome" },
  { id: "android", label: "Android — Chrome" },
  { id: "ios", label: "iPhone — Safari" },
];

/**
 * Landing-page Install control. Uses Chrome’s native prompt when available;
 * otherwise opens a guide with dropdowns for desktop, Android, and iPhone.
 */
export function InstallAppButton({ className }: Props) {
  const { isInstalled, canPrompt, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [openSection, setOpenSection] = useState<InstallPlatform | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!guideOpen) return;
    setOpenSection(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuideOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [guideOpen]);

  if (isInstalled) return null;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={className}
        onClick={() => {
          if (busy) return;
          if (canPrompt) {
            setBusy(true);
            void promptInstall()
              .then((outcome) => {
                if (outcome === "unavailable") setGuideOpen(true);
              })
              .finally(() => setBusy(false));
            return;
          }
          setGuideOpen(true);
        }}
      >
        {busy ? "…" : "Install app"}
      </button>

      {guideOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close install guide"
            className="absolute inset-0 bg-black/45"
            onClick={() => setGuideOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-md rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5 text-[var(--rw-ink)] shadow-[0_24px_60px_rgba(23,42,58,0.2)]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                How to install ReWorth
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setGuideOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)]"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              Choose your device, then follow the steps.
            </p>

            <div className="mt-4 space-y-2">
              {GUIDE_SECTIONS.map((section) => {
                const guide = getInstallGuide(section.id);
                const expanded = openSection === section.id;
                const panelId = `${titleId}-${section.id}`;
                return (
                  <div
                    key={section.id}
                    className="overflow-hidden rounded-2xl border border-[var(--rw-border)]"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() =>
                        setOpenSection((current) =>
                          current === section.id ? null : section.id,
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-[var(--rw-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--rw-accent)]"
                    >
                      <span>{section.label}</span>
                      <span
                        aria-hidden
                        className={[
                          "text-[var(--rw-ink-muted)] transition-transform",
                          expanded ? "rotate-180" : "",
                        ].join(" ")}
                      >
                        ▾
                      </span>
                    </button>
                    {expanded ? (
                      <ol
                        id={panelId}
                        className="list-decimal space-y-2 border-t border-[var(--rw-border)] px-4 py-3 pl-9 text-sm leading-6 text-[var(--rw-ink)]"
                      >
                        {guide.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--rw-navy)] px-4 text-sm font-semibold text-white hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
