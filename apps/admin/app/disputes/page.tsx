"use client";

import { useState } from "react";
import { adminFetch } from "../../lib/api";
import {
  ActionButton,
  PageHeader,
  SimpleTable,
  StatusLine,
  useAdminQuery,
} from "../../components/AdminUi";

type DisputeRow = {
  id: string;
  status: string;
  reason: string;
  orderId?: string;
  createdAt?: string;
  resolution?: string | null;
  evidence?: { id: string; text?: string | null }[];
  order?: { id?: string; totalKobo?: number };
};

type Res = { items: DisputeRow[] };

const RESOLUTIONS = [
  { value: "FULL_REFUND", label: "Full refund" },
  { value: "PARTIAL_REFUND", label: "Partial refund" },
  { value: "RELEASE_TO_SELLER", label: "Release to seller" },
  { value: "CANCEL", label: "Cancel" },
] as const;

export default function DisputesPage() {
  const { data, error, loading, reload } = useAdminQuery<Res>("/admin/disputes");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>("FULL_REFUND");
  const [amountKobo, setAmountKobo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows =
    data?.items.map((d) => ({
      id: d.id,
      status: d.status,
      reason: d.reason,
      orderId: d.order?.id ?? d.orderId ?? "—",
      createdAt: d.createdAt,
      resolution: d.resolution ?? "—",
      _raw: d,
    })) ?? [];

  async function resolve(id: string) {
    setBusy(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {
        resolution,
        note: note.trim() || undefined,
      };
      if (resolution === "PARTIAL_REFUND") {
        const n = Number(amountKobo);
        if (!Number.isFinite(n) || n <= 0) {
          setActionError("Partial refund requires amountKobo > 0");
          return;
        }
        body.amountKobo = Math.round(n);
      }
      await adminFetch(`/admin/disputes/${id}/resolution`, {
        method: "POST",
        body,
      });
      setNote("");
      setAmountKobo("");
      setExpanded(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Disputes"
        description="Queue with evidence + resolution through Payments (refund / release / cancel)."
      />
      <StatusLine
        loading={loading}
        error={error}
        empty={!loading && !error && !rows.length}
      />
      {actionError ? (
        <p className="mb-3 text-sm text-[var(--rw-error)]" role="alert">
          {actionError}
        </p>
      ) : null}
      {rows.length ? (
        <SimpleTable
          columns={[
            { key: "id", label: "ID" },
            { key: "status", label: "Status" },
            { key: "reason", label: "Reason" },
            { key: "orderId", label: "Order" },
            { key: "resolution", label: "Resolution" },
            { key: "createdAt", label: "Opened" },
          ]}
          rows={rows}
          expandedId={expanded}
          onRowClick={(row) =>
            setExpanded(expanded === String(row.id) ? null : String(row.id))
          }
          renderExpanded={(row) => {
            const raw = (row as { _raw?: DisputeRow })._raw;
            const open =
              raw?.status !== "RESOLVED" && String(row.status) !== "RESOLVED";
            return (
              <div className="space-y-3">
                {raw?.evidence?.length ? (
                  <ul className="space-y-1 text-xs text-[var(--rw-ink-muted)]">
                    {raw.evidence.map((e) => (
                      <li key={e.id}>{e.text ?? "(media evidence)"}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--rw-ink-muted)]">
                    No evidence text on list payload — open order for full trace.
                  </p>
                )}
                {open ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      Resolution
                      <select
                        className="mt-1 block rounded border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-1.5 text-sm"
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                      >
                        {RESOLUTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {resolution === "PARTIAL_REFUND" ? (
                      <label className="text-xs">
                        Amount (kobo)
                        <input
                          type="number"
                          min={1}
                          className="mt-1 block w-36 rounded border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-1.5 text-sm"
                          value={amountKobo}
                          onChange={(e) => setAmountKobo(e.target.value)}
                        />
                      </label>
                    ) : null}
                    <label className="text-xs">
                      Note
                      <input
                        className="mt-1 block w-48 rounded border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-1.5 text-sm"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <ActionButton
                      label={busy ? "…" : "Resolve"}
                      variant="primary"
                      onClick={() => void resolve(String(row.id))}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-[var(--rw-ink-muted)]">
                    Already resolved.
                  </p>
                )}
              </div>
            );
          }}
        />
      ) : null}
    </div>
  );
}
