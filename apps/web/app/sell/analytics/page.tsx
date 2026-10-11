"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  downloadSellerAnalyticsCsv,
  fetchSellerAnalytics,
} from "../../../lib/intelligence";
import type { SellerAnalytics, SellerListingMetrics } from "../../../lib/types";

function pct(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

function hoursLabel(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--rw-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ListingTable({
  title,
  rows,
}: {
  title: string;
  rows: SellerListingMetrics[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby={`tbl-${title}`}>
      <h2 id={`tbl-${title}`} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-4 overflow-x-auto rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)]">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] text-[var(--rw-ink-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Listing</th>
              <th className="px-3 py-2 font-medium">Views</th>
              <th className="px-3 py-2 font-medium">Saves</th>
              <th className="px-3 py-2 font-medium">Offers</th>
              <th className="px-3 py-2 font-medium">Conv.</th>
              <th className="px-3 py-2 font-medium">TTS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.listingId}
                className="border-b border-[var(--rw-border)]/70 last:border-0"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/listings/${row.listingId}`}
                    className="font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
                  >
                    {row.title || "Untitled"}
                  </Link>
                  <p className="text-xs text-[var(--rw-ink-muted)]">
                    {formatNgn({ amountKobo: row.askingKobo })}
                    {row.priceCompetitiveness != null
                      ? ` · vs market ${Math.round(row.priceCompetitiveness * 100)}%`
                      : ""}
                  </p>
                </td>
                <td className="px-3 py-2.5">{row.views}</td>
                <td className="px-3 py-2.5">{row.saves}</td>
                <td className="px-3 py-2.5">{row.offers}</td>
                <td className="px-3 py-2.5">
                  {pct(row.offerToSaleConversion)}
                </td>
                <td className="px-3 py-2.5">
                  {hoursLabel(row.timeToSaleHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSellerAnalytics(token);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "Could not load analytics",
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onExport() {
    const token = getAccessToken();
    if (!token) return;
    setExportBusy(true);
    try {
      await downloadSellerAnalyticsCsv(token, { city: data?.city });
      setToast({ message: "CSV downloaded", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Export failed",
        tone: "error",
      });
    } finally {
      setExportBusy(false);
    }
  }

  const agg = data?.aggregate;

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28vh]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(14,159,110,0.1), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/sell"
              className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
            >
              ← Sell
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Seller analytics
            </h1>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              Your listings in {data?.city ?? "Lagos"} — views, offers, revenue.
              Buyer identities are never shown.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={exportBusy || !data}
            onClick={() => void onExport()}
          >
            {exportBusy ? "Exporting…" : "Export CSV"}
          </Button>
        </header>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" label="Loading metric" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn’t load analytics"
            description={error}
            action={
              <Button variant="primary" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : !agg ? (
          <EmptyState
            title="No seller data yet"
            description="Publish a listing and get views to see metrics here."
            action={
              <Link href="/sell">
                <Button variant="sell">Sell</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile label="Views" value={String(agg.views)} />
              <MetricTile label="Saves" value={String(agg.saves)} />
              <MetricTile label="Offers" value={String(agg.offers)} />
              <MetricTile
                label="Offer → sale"
                value={pct(agg.offerToSaleConversion)}
              />
              <MetricTile
                label="Median time to sale"
                value={hoursLabel(agg.medianTimeToSaleHours)}
              />
              <MetricTile
                label="Revenue 30d"
                value={formatNgn({ amountKobo: agg.revenue30dKobo })}
              />
              <MetricTile
                label="Revenue 90d"
                value={formatNgn({ amountKobo: agg.revenue90dKobo })}
              />
              {agg.responseMinutes != null ? (
                <MetricTile
                  label="Response time"
                  value={`${Math.round(agg.responseMinutes)} min`}
                />
              ) : null}
            </div>

            <ListingTable
              title="Best performers"
              rows={data?.bestPerformers ?? []}
            />
            <ListingTable
              title="Needs attention"
              rows={data?.worstPerformers ?? []}
            />
            <ListingTable title="All listings" rows={data?.listings ?? []} />
          </>
        )}
      </div>

      {toast ? (
        <div className="fixed bottom-8 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
          <Toast
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </main>
  );
}
