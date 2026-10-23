"use client";

import type { DeliveryExceptionCopy } from "../lib/deliveryExceptions";

type Props = {
  exception: DeliveryExceptionCopy;
  role: "buyer" | "seller";
  onDispute?: () => void;
};

export function DeliveryExceptionBanner({
  exception,
  role,
  onDispute,
}: Props) {
  const actions =
    role === "buyer" ? exception.buyerActions : exception.sellerActions;

  return (
    <aside
      className="mt-4 rounded-[var(--rw-radius-lg)] border border-[color-mix(in_srgb,var(--rw-accent)_45%,#C9A227)] bg-[color-mix(in_srgb,var(--rw-accent-muted)_55%,#F5EDD0)] p-4"
      aria-label={exception.title}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--rw-accent)]">
        Needs a decision
      </p>
      <h2 className="mt-1 text-base font-semibold text-[var(--rw-ink)]">
        {exception.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--rw-ink)]">
        {exception.body}
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--rw-ink-muted)]">
        {actions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {onDispute && role === "buyer" ? (
        <button
          type="button"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-[var(--rw-radius)] bg-[var(--rw-ink)] px-4 text-sm font-semibold text-white"
          onClick={onDispute}
        >
          Open a dispute
        </button>
      ) : null}
      <p className="mt-3 text-xs text-[var(--rw-ink-muted)]">
        Payment stays protected until you confirm or a dispute is resolved.
      </p>
    </aside>
  );
}
