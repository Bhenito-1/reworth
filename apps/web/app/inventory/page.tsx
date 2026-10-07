"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Chip, EmptyState, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { listInventory, removeListing, type InventoryRow } from "../../lib/inventory";

export default function InventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      setRows(await listInventory(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load inventory");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRemove(row: InventoryRow) {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const confirmed = window.confirm(
      `Remove “${row.title || "this listing"}” from the marketplace? It stays in your inventory.`,
    );
    if (!confirmed) return;
    setRemovingId(row.id);
    setActionError(null);
    try {
      await removeListing(token, row.id);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove this listing");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 text-[var(--rw-ink)] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/account" className="text-sm text-[var(--rw-ink-muted)] hover:underline">
            ← Account
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        </header>
        <p className="mb-6 text-sm text-[var(--rw-ink-muted)]">
          Every listing you have created, including items that are sold or no longer
          on the marketplace. You can take a listing down when nothing is in progress.
          A sold-out listing stays here for reference. Price is per unit.
        </p>
        {rows === null && !error ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}
        {error && rows === null ? (
          <EmptyState title="Inventory unavailable" description={error} />
        ) : null}
        {actionError ? (
          <p className="mb-4 text-sm text-[var(--rw-error)]" role="alert">
            {actionError}
          </p>
        ) : null}
        {rows && rows.length === 0 ? (
          <EmptyState
            title="No listings yet"
            description="When you sell something, it stays here even after it sells out."
            action={
              <Link href="/sell" className="text-sm font-medium text-[var(--rw-accent)] hover:underline">
                Start selling
              </Link>
            }
          />
        ) : null}
        <ul className="space-y-3">
          {rows?.map((row) => (
            <li
              key={row.id}
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/listings/${row.id}`} className="font-semibold hover:underline">
                    {row.title || "Untitled"}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                    {formatNgn({ amountKobo: row.priceKobo })} per unit · {row.sellingMode}
                  </p>
                </div>
                <Chip selected className="pointer-events-none">
                  {row.onMarketplace ? "On marketplace" : row.status}
                </Chip>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[var(--rw-ink-muted)]">Listed</dt>
                  <dd className="font-medium">{row.quantityTotal}</dd>
                </div>
                <div>
                  <dt className="text-[var(--rw-ink-muted)]">Available</dt>
                  <dd className="font-medium">{row.quantityAvailable}</dd>
                </div>
                <div>
                  <dt className="text-[var(--rw-ink-muted)]">Reserved</dt>
                  <dd className="font-medium">{row.quantityReserved}</dd>
                </div>
                <div>
                  <dt className="text-[var(--rw-ink-muted)]">Sold</dt>
                  <dd className="font-medium">{row.quantitySold}</dd>
                </div>
              </dl>
              {row.canRemove ? (
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-[var(--rw-error)] hover:underline disabled:opacity-50"
                  disabled={removingId === row.id}
                  onClick={() => void onRemove(row)}
                >
                  {removingId === row.id ? "Removing…" : "Remove from marketplace"}
                </button>
              ) : row.status !== "REMOVED" && row.removeBlockedReason ? (
                <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">{row.removeBlockedReason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
