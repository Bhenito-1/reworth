"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, Skeleton } from "@reworth/ui-web";
import { getAccessToken } from "../../../../lib/auth";
import { sentenceCaseLabel } from "../../../../lib/listings";
import {
  listGiveawayClaims,
  type GiveawayClaim,
} from "../../../../lib/swap";

export default function GiveawayClaimsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [items, setItems] = useState<GiveawayClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listGiveawayClaims(token, id);
      setItems(res.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg px-4 py-8">
      <Link href={id ? `/listings/${id}` : "/"} className="text-sm text-[var(--rw-ink-muted)]">
        ← Back to listing
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Give-away claims</h1>
      <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
        The first verified buyer to pay the delivery fee gets one unit. A
        claim here is not the gift until that fee is paid.
      </p>
      {loading ? (
        <Skeleton className="mt-6 h-24 w-full" />
      ) : items.length === 0 ? (
        <EmptyState className="mt-8" title="No claims yet" description="Share your listing to get claimants." />
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-[var(--rw-border)] p-4"
            >
              <div className="font-medium">
                {c.claimant?.profile?.displayName ?? c.claimantId.slice(0, 8)}
              </div>
              <div className="text-xs text-[var(--rw-ink-muted)]">
                {sentenceCaseLabel(c.status)}
              </div>
              {c.note ? <p className="mt-2 text-sm">{c.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
