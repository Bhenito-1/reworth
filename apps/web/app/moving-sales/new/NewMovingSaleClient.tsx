"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import { COMMUNITIES } from "../../../lib/communities";
import { createMovingSale } from "../../../lib/moving-sales";
import { myLiveListings } from "../../../lib/swap";
import type { PublicListing } from "../../../lib/types";

export default function NewMovingSaleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectListingId = searchParams.get("listingId");

  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [deadline, setDeadline] = useState("");
  const [community, setCommunity] = useState("");
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    try {
      const res = await myLiveListings(token);
      setListings(res.items ?? []);
      if (preselectListingId) {
        setSelected(new Set([preselectListingId]));
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load your listings",
      );
    } finally {
      setLoading(false);
    }
  }, [preselectListingId, router]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  function toggleListing(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const token = getAccessToken();
    if (!token) {
      router.push("/");
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!deadline) {
      setError("Pick a deadline");
      return;
    }
    setBusy(true);
    try {
      const sale = await createMovingSale(token, {
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        deadline: new Date(deadline).toISOString(),
        community: community || undefined,
        listingIds: selected.size ? Array.from(selected) : undefined,
      });
      setToast("Moving sale created");
      router.push(`/moving-sales/${sale.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create sale");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">
          New moving sale
        </h1>

        <p className="mb-6 text-[var(--rw-ink-muted)]">
          Group your listings for a relocation — buyers see the combined asking
          price and deadline.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
          <Input
            label="Title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Relocating from Lekki — everything must go"
            required
            disabled={busy}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Blurb</span>
            <textarea
              name="blurb"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              disabled={busy}
              className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              placeholder="Must go by end of month. Serious buyers only."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Deadline</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
              disabled={busy}
              className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Community</span>
            <select
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              disabled={busy}
              className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
            >
              <option value="">Select…</option>
              {COMMUNITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="mb-3 text-sm font-medium">
              Attach live listings
            </legend>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" label="Loading listings" />
                <Skeleton className="h-12 w-full" label="Loading listings" />
              </div>
            ) : listings.length === 0 ? (
              <EmptyState
                title="No live listings"
                description="Publish items first, then attach them here."
                action={
                  <Link href="/sell">
                    <Button variant="sell" size="sm">
                      SELL
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto rounded-[var(--rw-radius)] border border-[var(--rw-border)] p-2">
                {listings.map((l) => (
                  <li key={l.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--rw-radius)] px-2 py-2 hover:bg-[var(--rw-accent-muted)]/40">
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleListing(l.id)}
                        className="mt-1 accent-[var(--rw-accent)]"
                        disabled={busy}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {l.title || "Untitled"}
                        </span>
                        <span className="text-sm text-[var(--rw-ink-muted)]">
                          {formatNgn({ amountKobo: l.priceKobo })}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {error ? (
            <p className="text-sm text-[var(--rw-error)]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => router.back()}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Creating…" : "Create sale"}
            </Button>
          </div>
        </form>
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </main>
  );
}
