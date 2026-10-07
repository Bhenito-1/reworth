"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { koboToNaira, nairaToKobo } from "@reworth/shared";
import { Button, Input, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  getListing,
  patchListing,
  publishListing,
} from "../../../lib/listings";
import type { PublicListing } from "../../../lib/types";

export default function FixListingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await getListing(id, token);
      setListing(row);
      setTitle(row.title);
      setDescription(row.description);
      setPriceNaira(String(koboToNaira(row.priceKobo)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load listing");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const rejected = listing?.status === "REJECTED";
  const reason =
    listing?.rejectionReason ||
    listing?.moderationReasons?.filter(Boolean).join(" ") ||
    null;

  async function publishAgain() {
    const token = getAccessToken();
    if (!token || !listing) return;
    const price = Number(priceNaira);
    if (!title.trim() || title.trim().length < 3) {
      setError("Add a title of at least a few characters.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price in naira.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await patchListing(listing.id, token, {
        title: title.trim(),
        description: description.trim(),
        priceKobo: nairaToKobo(price),
      });
      const published = await publishListing(listing.id, token);
      setListing(published);
      if (published.status === "LIVE") {
        setResult("Your listing is live.");
      } else if (published.status === "UNDER_REVIEW") {
        setResult(
          "Submitted again. We are checking the photos and details before it goes live.",
        );
      } else if (published.status === "REJECTED") {
        setResult(null);
        setError(
          published.rejectionReason ||
            published.moderationReasons?.join(" ") ||
            "It was rejected again. Adjust the details and try once more.",
        );
      } else {
        setResult(`Status: ${published.status}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-2xl bg-[var(--rw-bg)] px-4 py-8 text-[var(--rw-ink)] sm:px-8">
      <Link
        href="/selling"
        className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
      >
        ← Your listings
      </Link>
      {loading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error && !listing ? (
        <p className="mt-8 text-sm text-[var(--rw-error)]" role="alert">
          {error}
        </p>
      ) : listing ? (
        <div className="mt-6 space-y-5">
          <h1 className="text-3xl font-semibold tracking-tight">
            {rejected ? "Fix this listing" : listing.title}
          </h1>
          {rejected ? (
            <div className="rounded-[var(--rw-radius-lg)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="font-semibold">Why it was rejected</p>
              <p className="mt-1">{reason ?? "No reason was recorded."}</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--rw-ink-muted)]">
              Status: {listing.status}
            </p>
          )}
          {result ? (
            <p className="text-sm text-[var(--rw-accent)]" role="status">
              {result}
            </p>
          ) : null}
          {rejected ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void publishAgain();
              }}
            >
              <Input
                id="fix-title"
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label className="block text-sm font-medium" htmlFor="fix-description">
                Description
              </label>
              <textarea
                id="fix-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm"
              />
              <Input
                id="fix-price"
                label="Price (₦)"
                inputMode="decimal"
                value={priceNaira}
                onChange={(event) => setPriceNaira(event.target.value)}
              />
              {error ? (
                <p className="text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}
              <p className="text-sm text-[var(--rw-ink-muted)]">
                Publishing runs the photo and details checks again. Stay on this
                page while that finishes.
              </p>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Publishing…" : "Publish again"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
