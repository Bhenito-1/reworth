"use client";

import { useState } from "react";
import { nairaToKobo } from "@reworth/shared";
import { Button, Input, Modal } from "@reworth/ui-web";
import { OFFER_MULTI_UNIT_HINT } from "../../lib/offer-copy";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  submitting?: boolean;
  onSubmit: (amountKobo: number, note?: string) => Promise<void> | void;
};

export function MakeOfferModal({
  open,
  onClose,
  title = "Make offer",
  submitting,
  onSubmit,
}: Props) {
  const [naira, setNaira] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const value = Number(naira.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1) {
      setError("Enter an amount in Naira (₦)");
      return;
    }
    const amountKobo = nairaToKobo(value);
    await onSubmit(amountKobo, note.trim() || undefined);
    setNaira("");
    setNote("");
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--rw-ink-muted)]">{OFFER_MULTI_UNIT_HINT}</p>
        <Input
          label="Amount (₦)"
          inputMode="decimal"
          value={naira}
          onChange={(e) => setNaira(e.target.value)}
          placeholder="e.g. 45000"
          error={error ?? undefined}
        />
        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Pickup timing, condition questions…"
        />
        <Button
          variant="primary"
          disabled={submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Sending…" : "Send offer"}
        </Button>
      </div>
    </Modal>
  );
}
