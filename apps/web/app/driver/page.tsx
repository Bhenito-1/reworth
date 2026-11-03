"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { shipmentStatusLabel } from "../../lib/delivery";
import {
  acceptDriverRun,
  declineDriverRun,
  listDriverAssignments,
  milestoneButtonLabel,
  nextMilestone,
  newIdempotencyKey,
  submitDriverMilestone,
  type DriverAssignment,
} from "../../lib/driver-delivery";

function naira(kobo?: number | null): string | null {
  if (kobo == null) return null;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

function stopLine(
  stop: DriverAssignment["pickup"],
  fallback: string,
): string {
  if (!stop) return fallback;
  if (stop.line) return stop.line;
  if (stop.area) return stop.area;
  return fallback;
}

export default function DriverRunsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setRows(await listDriverAssignments(token));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load driver runs",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(true), 8000);
    return () => clearInterval(timer);
  }, [load]);

  async function accept(row: DriverAssignment) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(row.orderId);
    try {
      await acceptDriverRun(token, row.orderId);
      setToast("You accepted this delivery. Pickup and dropoff are now visible.");
      await load(true);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not accept");
    } finally {
      setBusyId(null);
    }
  }

  async function decline(row: DriverAssignment) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(row.orderId);
    try {
      const result = await declineDriverRun(token, row.orderId);
      setToast(
        result.accepted
          ? "Declined. The run goes to the next rider."
          : "Could not decline",
      );
      await load(true);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not decline");
    } finally {
      setBusyId(null);
    }
  }

  async function advance(row: DriverAssignment, failed = false) {
    const token = getAccessToken();
    if (!token) return;
    const status = failed ? "FAILED" : nextMilestone(row.status);
    if (!status) return;
    if (failed && !(failReason[row.orderId]?.trim())) {
      setToast("Add a failure reason before marking failed.");
      return;
    }
    setBusyId(row.orderId);
    try {
      const result = await submitDriverMilestone(
        token,
        row.orderId,
        {
          status,
          failureReason: failed ? failReason[row.orderId] : undefined,
          occurredAt: new Date().toISOString(),
        },
        newIdempotencyKey(row.orderId, status),
      );
      setToast(
        result.accepted
          ? `Updated → ${shipmentStatusLabel(result.status ?? status)}`
          : `Late update ignored — still ${shipmentStatusLabel(result.currentStatus ?? row.status)}`,
      );
      await load(true);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-sm text-stone-500">
        <Link href="/account" className="underline">
          ← Account
        </Link>
      </p>
      <h1 className="mt-4 font-serif text-3xl text-stone-900">Driver runs</h1>
      <p className="mt-2 text-sm text-stone-600">
        Accept a run to see the pickup and dropoff. Buyers and sellers watch
        the same timeline, and this list refreshes on its own.
      </p>
      {toast ? (
        <p className="mt-3 text-sm text-teal-800" role="status">
          {toast}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-6 text-sm text-stone-500">Loading…</p>
      ) : rows.length === 0 && !error ? (
        <p className="mt-6 text-sm text-stone-500">
          No runs waiting. A funded delivery will show up here.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((row) => {
            const offered = row.status === "OFFERED" && !row.accepted;
            const next = nextMilestone(row.status);
            const busy = busyId === row.orderId;
            const fee = naira(row.quoteKobo);
            return (
              <li
                key={row.orderId}
                className="rounded-xl border border-stone-200 p-4"
              >
                <p className="font-medium text-stone-900">
                  {row.listingTitle ?? "Delivery"}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {shipmentStatusLabel(row.status)}
                  {row.community ? ` · pickup ${row.community}` : ""}
                  {row.dropoffArea ? ` → ${row.dropoffArea}` : ""}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {row.distanceKm != null
                    ? `About ${row.distanceKm.toFixed(1)} km`
                    : "Distance pending"}
                  {fee ? ` · ${fee}` : ""}
                  {row.sellerName ? ` · ${row.sellerName}` : ""}
                </p>
                <div className="mt-3 space-y-1 text-sm text-stone-700">
                  <p>
                    <span className="text-stone-500">Pickup · </span>
                    {stopLine(row.pickup, row.community ?? "Seller area")}
                  </p>
                  <p>
                    <span className="text-stone-500">Dropoff · </span>
                    {stopLine(row.dropoff, row.dropoffArea ?? "Buyer area")}
                  </p>
                  {row.sellerPhone ? (
                    <p>
                      <span className="text-stone-500">Seller phone · </span>
                      {row.sellerPhone}
                    </p>
                  ) : null}
                </div>
                {offered ? null : (
                  <input
                    className="mt-3 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    placeholder="Failure reason (if needed)"
                    value={failReason[row.orderId] ?? ""}
                    onChange={(e) =>
                      setFailReason((prev) => ({
                        ...prev,
                        [row.orderId]: e.target.value,
                      }))
                    }
                  />
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {offered ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        onClick={() => void accept(row)}
                      >
                        {busy ? "…" : "Accept delivery"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 disabled:opacity-50"
                        onClick={() => void decline(row)}
                      >
                        Decline
                      </button>
                    </>
                  ) : null}
                  {!offered && next ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void advance(row, false)}
                    >
                      {busy ? "…" : `Mark ${milestoneButtonLabel(next)}`}
                    </button>
                  ) : null}
                  {offered ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                      onClick={() => void advance(row, true)}
                    >
                      Could not deliver
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="mt-6 text-sm font-medium text-teal-800 underline"
        onClick={() => void load()}
      >
        Refresh
      </button>
    </main>
  );
}
