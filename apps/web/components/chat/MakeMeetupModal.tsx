"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal } from "@reworth/ui-web";
import { dateInputToIso, todayIso } from "../../lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  submitting?: boolean;
  onSubmit: (locationText: string, deliveryDateIso: string) => void;
};

export function MakeMeetupModal({
  open,
  onClose,
  title = "Suggest meetup location",
  submitting,
  onSubmit,
}: Props) {
  const [location, setLocation] = useState("");
  const [deliveryOn, setDeliveryOn] = useState(todayIso);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDeliveryOn(todayIso());
    setError(null);
  }, [open]);

  function send() {
    const trimmed = location.trim();
    if (trimmed.length < 4) {
      setError("Enter where you want to meet (at least 4 characters)");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryOn) || deliveryOn < todayIso()) {
      setError("Choose a meetup date (today or later)");
      return;
    }
    setError(null);
    onSubmit(trimmed, dateInputToIso(deliveryOn));
    setLocation("");
    setDeliveryOn(todayIso());
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <Input
          label="Where should you meet?"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Shoprite Allen Avenue entrance"
          error={error ?? undefined}
        />
        <label className="flex flex-col gap-1 text-sm font-medium">
          Meetup date
          <input
            type="date"
            value={deliveryOn}
            min={todayIso()}
            onChange={(e) => setDeliveryOn(e.target.value)}
            className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 font-normal"
            required
          />
        </label>
        <Button
          variant="primary"
          disabled={submitting}
          onClick={send}
        >
          {submitting ? "Sending…" : "Send"}
        </Button>
      </div>
    </Modal>
  );
}