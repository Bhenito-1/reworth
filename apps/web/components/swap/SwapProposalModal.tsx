"use client";

import { useRef, useState } from "react";
import { Button, Input, Modal } from "@reworth/ui-web";
import { uploadListingPhoto } from "../../lib/listings";
import { createSwapProposal, startSwapOffer } from "../../lib/swap";
import { ApiError } from "../../lib/api";

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type Photo = { id: string; file: File; previewUrl: string };

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  targetListingId: string;
  onSubmitted: (conversationId?: string | null) => void;
};

export function SwapProposalModal({
  open,
  onClose,
  token,
  targetListingId,
  onSubmitted,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryOn, setDeliveryOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (next.length >= 6) break;
      if (!file.type.startsWith("image/")) continue;
      next.push({
        id: `${file.name}-${file.size}-${next.length}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setPhotos(next);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((photo) => photo.id !== id);
    });
  }

  async function submit() {
    const offerTitle = title.trim();
    const offerDescription = description.trim();
    if (photos.length === 0) {
      setError("Add at least one photo of the item you want to swap");
      return;
    }
    if (offerTitle.length < 2) {
      setError("Add a title for the item you want to swap");
      return;
    }
    if (offerDescription.length < 10) {
      setError("Describe the item you want to swap");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryOn) || deliveryOn < todayIso()) {
      setError("Choose a delivery day that is today or later");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const offer = await startSwapOffer(token, targetListingId);
      for (let i = 0; i < photos.length; i += 1) {
        await uploadListingPhoto(token, offer.listingId, photos[i].file, i);
      }
      const proposal = await createSwapProposal(token, targetListingId, {
        offeredListingId: offer.listingId,
        title: offerTitle,
        description: offerDescription,
        deliveryOn,
      });
      onSubmitted(proposal.conversationId);
      onClose();
      setPhotos([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Proposal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Propose a swap">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--rw-ink-muted)]">
          Add photos, a title, a description, and the day you want the items
          delivered. We check that the photos match before the other person can
          accept or reject.
        </p>
        <Input
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          placeholder="What are you offering?"
        />
        <label className="flex flex-col gap-1 text-sm font-medium">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="Condition, brand, and anything they should know"
            className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Delivery day
          <input
            type="date"
            value={deliveryOn}
            min={todayIso()}
            onChange={(event) => setDeliveryOn(event.target.value)}
            className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 font-normal"
          />
        </label>
        {photos.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="relative aspect-square overflow-hidden rounded-[var(--rw-radius)]"
                  aria-label="Remove photo"
                >
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--rw-ink-muted)]">
              Tap a photo to remove it.
            </p>
          </>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={photos.length >= 6}
        >
          Add photos
        </Button>
        {error ? (
          <p className="text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Checking photos…" : "Send swap proposal"}
        </Button>
      </div>
    </Modal>
  );
}
