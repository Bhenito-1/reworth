"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn, nairaToKobo } from "@reworth/shared";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  computeConsignmentEarnings,
  consignmentStatusLabel,
  createConsignment,
  listMyConsignments,
  returnConsignment,
} from "../../lib/platform-services";
import type { Consignment, ConsignmentEarnings } from "../../lib/types";

export default function ConsignPage() {
  const router = useRouter();
  const [items, setItems] = useState<Consignment[]>([]);
  const [earnings, setEarnings] = useState<ConsignmentEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [askingNaira, setAskingNaira] = useState("");
  const [floorNaira, setFloorNaira] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listMyConsignments(token);
      const rows = Array.isArray(list) ? list : [];
      setItems(rows);
      setEarnings(computeConsignmentEarnings(rows));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load consignments",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    const t = title.trim();
    const asking = Number(askingNaira);
    const floor = Number(floorNaira);
    if (!t || !Number.isFinite(asking) || asking <= 0) {
      setToast({ message: "Enter title and asking price", tone: "warn" });
      return;
    }
    if (!Number.isFinite(floor) || floor <= 0 || floor > asking) {
      setToast({
        message: "Floor price must be ≤ asking price",
        tone: "warn",
      });
      return;
    }
    setSubmitting(true);
    try {
      await createConsignment(token, {
        title: t,
        askingPriceKobo: nairaToKobo(asking),
        floorPriceKobo: nairaToKobo(floor),
        city: "Lagos",
      });
      setTitle("");
      setAskingNaira("");
      setFloorNaira("");
      setToast({ message: "Consignment intake created", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not create",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(id);
    try {
      await returnConsignment(token, id);
      setToast({ message: "Returned", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Return failed",
        tone: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32vh]"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 100% 0%, rgba(14,159,110,0.12), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/account"
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Account
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        <h1 className="text-2xl font-semibold tracking-tight">Consign</h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Hand inventory to ReWorth ops. We list under consignment rules; you
          keep the net after fee.
        </p>

        {loading ? (
          <div className="mt-8 flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn’t load"
            description={error}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            {earnings ? (
              <section
                className="mt-8 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-5"
                aria-labelledby="earnings-heading"
              >
                <h2 id="earnings-heading" className="text-lg font-semibold">
                  Earnings
                </h2>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Pending payout</dt>
                    <dd className="mt-1 text-xl font-semibold tracking-tight">
                      {formatNgn({ amountKobo: earnings.pendingPayoutKobo })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Paid out</dt>
                    <dd className="mt-1 text-xl font-semibold tracking-tight">
                      {formatNgn({ amountKobo: earnings.paidOutKobo })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Listed</dt>
                    <dd className="mt-1 font-semibold">{earnings.listedCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Sold</dt>
                    <dd className="mt-1 font-semibold">{earnings.soldCount}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-[var(--rw-ink-muted)]">
                  Fees to date{" "}
                  {formatNgn({ amountKobo: earnings.totalFeesKobo })}
                </p>
              </section>
            ) : null}

            <form
              onSubmit={(e) => void onCreate(e)}
              className="mt-10 flex flex-col gap-4"
              aria-labelledby="intake-heading"
            >
              <h2 id="intake-heading" className="text-lg font-semibold">
                New intake
              </h2>
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Samsung 55&quot; QLED"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Asking (₦)"
                  inputMode="numeric"
                  value={askingNaira}
                  onChange={(e) => setAskingNaira(e.target.value)}
                  required
                />
                <Input
                  label="Floor (₦)"
                  inputMode="numeric"
                  value={floorNaira}
                  onChange={(e) => setFloorNaira(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? "Creating…" : "Start consignment"}
                </Button>
                <Link href="/pickup">
                  <Button type="button" variant="secondary">
                    Book pickup
                  </Button>
                </Link>
              </div>
            </form>

            <section className="mt-12" aria-labelledby="list-heading">
              <h2 id="list-heading" className="text-lg font-semibold">
                Your consignments
              </h2>
              {items.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                  None yet — create an intake or book a managed pickup.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {items.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{c.title}</p>
                          <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                            {consignmentStatusLabel(c.status)} · Ask{" "}
                            {formatNgn({ amountKobo: c.askingPriceKobo })} ·
                            Floor{" "}
                            {formatNgn({ amountKobo: c.floorPriceKobo })}
                          </p>
                          {c.netPayoutKobo != null ? (
                            <p className="mt-1 text-sm font-medium text-[var(--rw-accent)]">
                              Net {formatNgn({ amountKobo: c.netPayoutKobo })}
                            </p>
                          ) : null}
                        </div>
                        {c.status === "INTAKE" || c.status === "LISTED" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === c.id}
                            onClick={() => void onCancel(c.id)}
                          >
                            Return
                          </Button>
                        ) : null}
                      </div>
                      {c.listingId ? (
                        <Link
                          href={`/listings/${c.listingId}`}
                          className="mt-2 inline-block text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
                        >
                          View listing
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
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
