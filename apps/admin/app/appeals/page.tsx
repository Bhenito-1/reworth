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

type Appeal = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  listing?: { id?: string; title?: string; status?: string } | null;
  user?: {
    id?: string;
    profile?: { displayName?: string } | null;
  } | null;
};

type Res = { items: Appeal[] };

export default function AppealsPage() {
  const { data, error, loading, reload } = useAdminQuery<Res>("/admin/appeals");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const rows =
    data?.items.map((a) => ({
      id: a.id,
      listing: a.listing?.title ?? a.listing?.id ?? "—",
      seller: a.user?.profile?.displayName ?? a.user?.id ?? "—",
      reason: a.reason,
      listingStatus: a.listing?.status ?? "—",
      createdAt: a.createdAt,
    })) ?? [];

  async function resolve(id: string, status: "APPROVED" | "DENIED") {
    await adminFetch(`/admin/appeals/${id}/resolve`, {
      method: "POST",
      body: { status, note: note.trim() || undefined },
    });
    setMsg(`Appeal ${status.toLowerCase()}`);
    setNote("");
    setExpanded(null);
    await reload();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Moderation appeals"
        description="Seller appeals on auto-rejected listings — approve (→ under review) or deny."
      />
      <StatusLine
        loading={loading}
        error={error}
        empty={!loading && !error && !rows.length}
      />
      {msg ? (
        <p className="mb-3 text-sm text-[var(--rw-accent)]" role="status">
          {msg}
        </p>
      ) : null}
      {rows.length ? (
        <SimpleTable
          columns={[
            { key: "listing", label: "Listing" },
            { key: "seller", label: "Seller" },
            { key: "reason", label: "Appeal reason" },
            { key: "listingStatus", label: "Listing status" },
            { key: "createdAt", label: "Opened" },
          ]}
          rows={rows}
          expandedId={expanded}
          onRowClick={(row) =>
            setExpanded(expanded === String(row.id) ? null : String(row.id))
          }
          renderExpanded={(row) => (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                Note
                <input
                  className="mt-1 block w-56 rounded border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-1.5 text-sm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <ActionButton
                label="Approve → review"
                variant="primary"
                onClick={() => void resolve(String(row.id), "APPROVED")}
              />
              <ActionButton
                label="Deny"
                onClick={() => void resolve(String(row.id), "DENIED")}
              />
            </div>
          )}
        />
      ) : null}
    </div>
  );
}
