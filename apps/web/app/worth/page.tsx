"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import type { ValuationCard } from "../../lib/types";
import {
  createValuation,
  type ValuationCardDto,
} from "../../lib/platform-services";
import { uploadPlatformPhoto } from "../../lib/room-scan";

function cardFromDto(dto: ValuationCardDto): ValuationCard {
  return {
    currency: dto.currency,
    estimatedLowKobo: dto.estimatedLowKobo,
    estimatedHighKobo: dto.estimatedHighKobo,
    recommendedKobo: dto.recommendedKobo,
    quickSaleKobo: dto.quickSaleKobo,
    maxValueKobo: dto.maxValueKobo,
    confidenceLabel: dto.confidenceLabel,
    city: dto.city,
    basis: dto.basis,
  };
}

export default function WorthPage() {
  const router = useRouter();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [card, setCard] = useState<ValuationCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    e.target.value = "";
    if (!next || !next.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setCard(null);
    setError(null);
  }

  async function estimate() {
    if (!file) {
      setError("Add a photo first.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      router.push("/");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const up = await uploadPlatformPhoto(token, file);
      const res = await createValuation(token, {
        photoKey: up.key,
        city: "Lagos",
      });
      setCard(cardFromDto(res));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not estimate value",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40vh]"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(14,159,110,0.16), transparent 65%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-20 pt-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What&apos;s it worth
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Photo an item for a Lagos market estimate. Guidance only — not a
          binding offer.
        </p>

        <input
          ref={fileRef}
          id={fileInputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onPick}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-8 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[var(--rw-radius-lg)] border border-dashed border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          aria-label="Upload item photo"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium text-[var(--rw-ink-muted)]">
              Tap to add a photo
            </span>
          )}
        </button>

        {error ? (
          <p className="mt-3 text-sm text-[var(--rw-danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          className="mt-6 w-full"
          variant="primary"
          disabled={busy || !file}
          onClick={() => void estimate()}
        >
          {busy ? "Estimating…" : "Get estimate"}
        </Button>

        {busy ? (
          <div className="mt-8" aria-busy="true">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : null}

        {card && !busy ? (
          <article
            className="mt-8 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/50 p-5"
            aria-label="Valuation card"
          >
            <p className="text-sm font-semibold text-[var(--rw-accent)]">
              Recommended
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {formatNgn({ amountKobo: card.recommendedKobo })}
            </p>
            <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
              Range {formatNgn({ amountKobo: card.estimatedLowKobo })} –{" "}
              {formatNgn({ amountKobo: card.estimatedHighKobo })}
            </p>
            {card.quickSaleKobo != null || card.maxValueKobo != null ? (
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                {card.quickSaleKobo != null
                  ? `Quick sale ${formatNgn({ amountKobo: card.quickSaleKobo })}`
                  : ""}
                {card.quickSaleKobo != null && card.maxValueKobo != null
                  ? " · "
                  : ""}
                {card.maxValueKobo != null
                  ? `Max ${formatNgn({ amountKobo: card.maxValueKobo })}`
                  : ""}
              </p>
            ) : null}
            {card.confidenceLabel ? (
              <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">
                {card.confidenceLabel}
                {card.sampleCount != null
                  ? ` · ${card.sampleCount} comps`
                  : ""}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/sell">
                <Button variant="sell">List on ReWorth</Button>
              </Link>
              <Link href="/ask">
                <Button variant="secondary">Ask ReWorth</Button>
              </Link>
            </div>
          </article>
        ) : null}

        {!file && !card && !busy ? (
          <EmptyState
            className="mt-10"
            title="Start with a photo"
            description="Clear, well-lit shots work best for Lagos comps."
          />
        ) : null}
      </div>
    </main>
  );
}
