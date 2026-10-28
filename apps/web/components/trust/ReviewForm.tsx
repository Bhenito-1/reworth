"use client";

import { FormEvent, useState } from "react";
import { Button } from "@reworth/ui-web";
import type { CreateReviewBody } from "../../lib/trust";

const SUBS: {
  key: keyof Omit<CreateReviewBody, "body" | "photoKeys" | "overall">;
  label: string;
}[] = [
  { key: "accuracy", label: "Item accuracy" },
  { key: "communication", label: "Communication" },
  { key: "punctuality", label: "Punctuality" },
  { key: "transactionExperience", label: "Overall experience" },
];

type Props = {
  submitting: boolean;
  onSubmit: (body: CreateReviewBody) => Promise<void>;
};

function StarPicker({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  id: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-1" role="radiogroup" aria-labelledby={id}>
        <span id={id} className="sr-only">
          {label}
        </span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => onChange(n)}
            className={[
              "flex h-10 w-10 items-center justify-center rounded-[var(--rw-radius)] text-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
              n <= value
                ? "bg-[var(--rw-gold-muted)] text-[var(--rw-gold)]"
                : "bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]",
            ].join(" ")}
          >
            {n <= value ? "★" : "☆"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ submitting, onSubmit }: Props) {
  const [overall, setOverall] = useState(5);
  const [accuracy, setAccuracy] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [transactionExperience, setTransactionExperience] = useState(5);
  const [body, setBody] = useState("");

  const ratings: Record<string, number> = {
    accuracy,
    communication,
    punctuality,
    transactionExperience,
  };
  const setters: Record<string, (n: number) => void> = {
    accuracy: setAccuracy,
    communication: setCommunication,
    punctuality: setPunctuality,
    transactionExperience: setTransactionExperience,
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      overall,
      accuracy,
      communication,
      punctuality,
      transactionExperience,
      body: body.trim() || undefined,
    });
  }

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
      onSubmit={(e) => void handleSubmit(e)}
      aria-labelledby="leave-review"
    >
      <h2 id="leave-review" className="text-lg font-semibold">
        Leave a review
      </h2>
      <p className="text-sm text-[var(--rw-ink-muted)]">
        Rate the purchase. Only buyers can rate, and it shows on this seller&apos;s listings.
      </p>

      <StarPicker
        id="overall-stars"
        label="Overall"
        value={overall}
        onChange={setOverall}
      />

      {SUBS.map((s) => (
        <StarPicker
          key={s.key}
          id={`${s.key}-stars`}
          label={s.label}
          value={ratings[s.key] ?? 5}
          onChange={setters[s.key]!}
        />
      ))}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-body" className="text-sm font-medium">
          Comments (optional)
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="How did the handover go?"
          className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        />
      </div>

      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}
