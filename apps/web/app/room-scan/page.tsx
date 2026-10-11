"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { CONDITION_LABELS } from "../../lib/listings";
import { getAccessToken } from "../../lib/auth";
import {
  createRoomScan,
  createRoomScanDrafts,
  pollRoomScanUntilReady,
  publishRoomScanDrafts,
  startRoomScanDetect,
  updateRoomScanItems,
  uploadPlatformPhoto,
} from "../../lib/room-scan";
import type { RoomScan, RoomScanDraft, RoomScanItem } from "../../lib/types";

type Step = "upload" | "detecting" | "select" | "drafts" | "done";

type LocalPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export default function RoomScanPage() {
  const router = useRouter();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [scan, setScan] = useState<RoomScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [batchBusy, setBatchBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke on unmount only
  }, []);

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setPhotos((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (next.length >= 4) break;
        if (!file.type.startsWith("image/")) continue;
        next.push({
          id: `${file.name}-${file.size}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      return next.slice(0, 4);
    });
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function startDetect() {
    const token = getAccessToken();
    if (!token) return;
    if (photos.length < 1) {
      setError("Add 1–4 photos of your room.");
      return;
    }
    setBusy(true);
    setError(null);
    setStep("detecting");
    try {
      const keys: string[] = [];
      for (const photo of photos) {
        const up = await uploadPlatformPhoto(token, photo.file);
        keys.push(up.key);
      }
      let created = await createRoomScan(token, {
        photoKeys: keys,
        city: "Lagos",
      });
      created = await startRoomScanDetect(token, created.id);
      created = await pollRoomScanUntilReady(token, created.id);
      if (created.status === "FAILED") {
        throw new Error(created.errorMessage || "Detection failed");
      }
      setScan(created);
      setStep("select");
    } catch (err) {
      setStep("upload");
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not scan room",
      );
    } finally {
      setBusy(false);
    }
  }

  const toggleItem = useCallback((itemId: string) => {
    setScan((prev) => {
      if (!prev?.items) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.id === itemId ? { ...it, selected: !it.selected } : it,
        ),
      };
    });
  }, []);

  async function createDrafts() {
    const token = getAccessToken();
    if (!token || !scan) return;
    const selected = (scan.items ?? []).filter((i) => i.selected);
    if (!selected.length) {
      setError("Select at least one item to sell.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateRoomScanItems(
        token,
        scan.id,
        (scan.items ?? []).map((it) => ({
          id: it.id,
          selected: it.selected,
          condition: it.condition,
        })),
      );
      const created = await createRoomScanDrafts(token, scan.id);
      setScan(created.roomScan);
      setStep("drafts");
      setToast({
        message: `${created.drafts?.length ?? selected.length} draft listings ready`,
        tone: "success",
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create drafts",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runBatch(
    listingId: string,
    action: "publish" | "edit" | "discard",
  ) {
    const token = getAccessToken();
    if (!token || !scan) return;
    if (action === "edit") {
      router.push(`/sell?listingId=${listingId}`);
      return;
    }
    if (action === "discard") {
      setScan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drafts: (prev.drafts ?? []).filter((d) => d.listingId !== listingId),
        };
      });
      setToast({ message: "Removed from batch review", tone: "success" });
      return;
    }
    setBatchBusy(listingId);
    try {
      await publishRoomScanDrafts(token, scan.id, [listingId]);
      setScan((prev) => {
        if (!prev) return prev;
        const drafts = (prev.drafts ?? []).filter(
          (d) => d.listingId !== listingId,
        );
        return { ...prev, drafts };
      });
      setToast({ message: "Published", tone: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Publish failed",
        tone: "error",
      });
    } finally {
      setBatchBusy(null);
    }
  }

  const items: RoomScanItem[] = scan?.items ?? [];
  const drafts: RoomScanDraft[] = scan?.drafts ?? [];

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[36vh]"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 10% 0%, rgba(201,162,39,0.12), transparent 50%), radial-gradient(ellipse 50% 40% at 90% 10%, rgba(14,159,110,0.1), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Room scan
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Photograph your living room. We spot saleable items and draft
          listings — confirm before anything goes live.
        </p>

        {step === "upload" ? (
          <section className="mt-8" aria-labelledby="upload-heading">
            <h2 id="upload-heading" className="text-lg font-semibold">
              Photos (1–4)
            </h2>
            <input
              ref={fileRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={onPickFiles}
            />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p) => (
                <div key={p.id} className="relative aspect-square overflow-hidden rounded-[var(--rw-radius)] bg-[var(--rw-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 4 ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-[var(--rw-radius)] border border-dashed border-[var(--rw-border)] text-sm font-medium text-[var(--rw-ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                >
                  Add photo
                </button>
              ) : null}
            </div>
            {error ? (
              <p className="mt-3 text-sm text-[var(--rw-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="mt-6"
              variant="primary"
              disabled={busy || photos.length < 1}
              onClick={() => void startDetect()}
            >
              Detect items
            </Button>
          </section>
        ) : null}

        {step === "detecting" ? (
          <div className="mt-10 flex flex-col gap-3" aria-busy="true" aria-live="polite">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <p className="text-sm text-[var(--rw-ink-muted)]">
              Detecting saleable items…
            </p>
          </div>
        ) : null}

        {step === "select" && scan ? (
          <section className="mt-8" aria-labelledby="select-heading">
            <h2 id="select-heading" className="text-lg font-semibold">
              Sell these items?
            </h2>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              Uncheck anything you want to keep.
            </p>
            {items.length === 0 ? (
              <EmptyState
                title="No items detected"
                description="Try clearer photos of the whole room."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStep("upload");
                      setScan(null);
                    }}
                  >
                    Try again
                  </Button>
                }
              />
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(item.id)}
                        className="mt-1 accent-[var(--rw-accent)]"
                      />
                      <span>
                        <span className="block font-medium">{item.label}</span>
                        <span className="text-xs text-[var(--rw-ink-muted)]">
                          {[
                            item.brandHint,
                            item.categoryHint,
                            item.condition
                              ? (CONDITION_LABELS[item.condition] ??
                                item.condition)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {error ? (
              <p className="mt-3 text-sm text-[var(--rw-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={busy || !items.some((i) => i.selected)}
                onClick={() => void createDrafts()}
              >
                {busy ? "Creating…" : "Create draft listings"}
              </Button>
              <Link href="/pickup">
                <Button variant="secondary">Book managed pickup</Button>
              </Link>
            </div>
          </section>
        ) : null}

        {step === "drafts" || step === "done" ? (
          <section className="mt-8" aria-labelledby="drafts-heading">
            <h2 id="drafts-heading" className="text-lg font-semibold">
              Batch review
            </h2>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              Publish, edit, or discard each draft.
            </p>
            {drafts.length === 0 ? (
              <EmptyState
                title="No drafts left"
                description="All drafts published or discarded."
                action={
                  <Link href="/my">
                    <Button variant="primary">My listings</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {drafts.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
                  >
                    <p className="font-medium">
                      {d.listing?.title || d.itemLabel}
                    </p>
                    {d.listing?.priceKobo != null ? (
                      <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                        {formatNgn({ amountKobo: d.listing.priceKobo })}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={batchBusy === d.listingId}
                        onClick={() => void runBatch(d.listingId, "publish")}
                      >
                        Publish
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={batchBusy === d.listingId}
                        onClick={() => void runBatch(d.listingId, "edit")}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={batchBusy === d.listingId}
                        onClick={() => void runBatch(d.listingId, "discard")}
                      >
                        Discard
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </main>
  );
}
