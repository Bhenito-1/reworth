"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  listDriverAssignments,
  nextMilestone,
  newIdempotencyKey,
  submitDriverMilestone,
  type DriverAssignment,
} from "../../lib/driver-delivery";

export default function DriverRunsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
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
          ? `Updated → ${result.status}`
          : `Late update ignored — still ${result.currentStatus}`,
      );
      await load();
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
        Submit milestones for assigned deliveries. Buyers and sellers see the
        same timeline.
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
        <p className="mt-6 text-sm text-stone-500">No active assignments.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((row) => {
            const next = nextMilestone(row.status);
            const busy = busyId === row.orderId;
            return (
              <li
                key={row.orderId}
                className="rounded-xl border border-stone-200 p-4"
              >
                <Link
                  href={`/orders/${row.orderId}`}
                  className="font-medium text-stone-900 underline-offset-2 hover:underline"
                >
                  {row.listingTitle ?? "Delivery"}
                </Link>
                <p className="mt-1 text-sm text-stone-500">
                  {row.status.replace(/_/g, " ")}
                  {row.community ? ` · ${row.community}` : ""}
                </p>
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {next ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void advance(row, false)}
                    >
                      {busy ? "…" : `Mark ${next.replace(/_/g, " ")}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                    onClick={() => void advance(row, true)}
                  >
                    Failed
                  </button>
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
