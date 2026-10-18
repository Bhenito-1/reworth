"use client";

import { useState } from "react";
import { Button } from "@reworth/ui-web";
import { adminFetch, downloadCsv } from "../../lib/api";
import {
  ActionButton,
  PageHeader,
  SimpleTable,
  StatusLine,
  useAdminQuery,
} from "../../components/AdminUi";

type UsersRes = {
  items: {
    id: string;
    email: string | null;
    phone: string | null;
    status: string;
    displayName: string | null;
    community: string | null;
    roles: string[];
    createdAt: string;
  }[];
};

function statusLabel(status: string) {
  if (status === "SUSPENDED") return "Suspended";
  if (status === "ACTIVE") return "Active";
  if (status === "DELETED") return "Deleted";
  return status;
}

export default function UsersPage() {
  const [q, setQ] = useState("");
  const path = `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, loading, reload } = useAdminQuery<UsersRes>(path);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Users"
        description="Lookup, suspend, and export."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void downloadCsv("/admin/users/export.csv", "users.csv")}
            >
              Export CSV
            </Button>
          </div>
        }
      />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void reload();
        }}
      >
        <input
          className="flex-1 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm"
          placeholder="Search email, phone, name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <StatusLine
        loading={loading}
        error={error}
        empty={!loading && !error && !data?.items.length}
      />
      {data?.items.length ? (
        <SimpleTable
          columns={[
            { key: "displayName", label: "Name" },
            { key: "email", label: "Email" },
            { key: "status", label: "Status" },
            { key: "community", label: "Community" },
            { key: "roles", label: "Roles" },
          ]}
          rows={data.items.map((u) => ({
            ...u,
            status: statusLabel(u.status),
            accountStatus: u.status,
            roles: u.roles.join(", "),
          }))}
          expandedId={expanded}
          onRowClick={(row) => {
            const next = expanded === String(row.id) ? null : String(row.id);
            setExpanded(next);
            setReason("");
          }}
          renderExpanded={(row) => {
            const suspended =
              String(row.accountStatus ?? row.status ?? "").toUpperCase() ===
              "SUSPENDED";
            const reasonOk = reason.trim().length >= 3;
            return (
            <div className="flex flex-col gap-3">
              <label className="flex max-w-md flex-col gap-1 text-sm">
                {suspended ? "Reason for lifting the suspension" : "Reason for the user"}
                <textarea
                  className="min-h-24 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm text-[var(--rw-ink)]"
                  value={reason}
                  maxLength={500}
                  placeholder={
                    suspended
                      ? "Tell them why the suspension is being lifted"
                      : "Tell them why the account is being suspended"
                  }
                  onChange={(e) => setReason(e.target.value)}
                />
                <span className="text-xs text-[var(--rw-ink-muted)]">
                  {suspended
                    ? "Unsuspend turns on after this reason. Their listings go back on the marketplace."
                    : "This is emailed to them. They will not be able to sign in."}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={suspended || !reasonOk}
                onClick={async () => {
                  await adminFetch(`/admin/users/${row.id}/suspend`, {
                    method: "POST",
                    body: { reason: reason.trim() },
                  });
                  setReason("");
                  await reload();
                }}
              >
                Suspend
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={!suspended || !reasonOk}
                onClick={async () => {
                  await adminFetch(`/admin/users/${row.id}/unsuspend`, {
                    method: "POST",
                    body: { reason: reason.trim() },
                  });
                  setReason("");
                  await reload();
                }}
              >
                Unsuspend
              </Button>
              <ActionButton
                label="Reset verification"
                onClick={async () => {
                  await adminFetch(
                    `/admin/users/${row.id}/reset-verification`,
                    { method: "POST" },
                  );
                  await reload();
                }}
              />
              <ActionButton
                label="Whitelist"
                onClick={async () => {
                  await adminFetch(`/admin/users/${row.id}/whitelist`, {
                    method: "POST",
                    body: { reason: "Trusted seller" },
                  });
                  await reload();
                }}
              />
              </div>
            </div>
            );
          }}
        />
      ) : null}
    </div>
  );
}
