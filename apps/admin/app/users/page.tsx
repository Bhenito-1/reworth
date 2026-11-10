"use client";

import { useState } from "react";
import { Button } from "@reworth/ui-web";
import { adminFetch, ApiError, downloadCsv } from "../../lib/api";
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
    isDeliveryDriver?: boolean;
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
  const [creating, setCreating] = useState(false);
  const [driverForm, setDriverForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [driverError, setDriverError] = useState<string | null>(null);
  const [driverNotice, setDriverNotice] = useState<string | null>(null);
  const [driverBusy, setDriverBusy] = useState(false);

  async function createDriver() {
    setDriverBusy(true);
    setDriverError(null);
    setDriverNotice(null);
    try {
      const created = await adminFetch<{ email: string; displayName: string }>(
        "/admin/drivers",
        {
          method: "POST",
          body: {
            displayName: driverForm.displayName.trim(),
            email: driverForm.email.trim(),
            password: driverForm.password,
            ...(driverForm.phone.trim()
              ? { phone: driverForm.phone.trim() }
              : {}),
          },
        },
      );
      setDriverNotice(
        `${created.displayName} can sign in on the courier portal with ${created.email}.`,
      );
      setDriverForm({ displayName: "", email: "", phone: "", password: "" });
      setCreating(false);
      await reload();
    } catch (err) {
      setDriverError(
        err instanceof ApiError ? err.message : "Could not create the driver",
      );
    } finally {
      setDriverBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Users"
        description="Lookup, suspend, export, and add riders for the courier portal."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setCreating((open) => !open);
                setDriverError(null);
              }}
            >
              New driver
            </Button>
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
      {creating ? (
        <form
          className="mb-4 grid gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createDriver();
          }}
        >
          <p className="sm:col-span-2 text-sm text-[var(--rw-ink-muted)]">
            Creates a courier account. They sign in on the rider portal, not here.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              required
              minLength={2}
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2"
              value={driverForm.displayName}
              onChange={(e) =>
                setDriverForm((prev) => ({ ...prev, displayName: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              required
              type="email"
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2"
              value={driverForm.email}
              onChange={(e) =>
                setDriverForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Phone
            <input
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2"
              placeholder="080…"
              value={driverForm.phone}
              onChange={(e) =>
                setDriverForm((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              required
              minLength={8}
              type="text"
              autoComplete="new-password"
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2"
              value={driverForm.password}
              onChange={(e) =>
                setDriverForm((prev) => ({ ...prev, password: e.target.value }))
              }
            />
          </label>
          {driverError ? (
            <p className="sm:col-span-2 text-sm text-[var(--rw-error)]" role="alert">
              {driverError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={driverBusy}>
              {driverBusy ? "Creating…" : "Create driver"}
            </Button>
          </div>
        </form>
      ) : null}
      {driverNotice ? (
        <p className="mb-4 text-sm text-[var(--rw-success)]" role="status">
          {driverNotice}
        </p>
      ) : null}
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
            { key: "rider", label: "Rider" },
          ]}
          rows={data.items.map((u) => ({
            ...u,
            status: statusLabel(u.status),
            accountStatus: u.status,
            roles: u.roles.join(", ") || "—",
            rider: u.isDeliveryDriver ? "Rider" : "—",
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
                label={row.isDeliveryDriver ? "Remove rider" : "Make rider"}
                onClick={async () => {
                  await adminFetch(`/admin/users/${row.id}/delivery-driver`, {
                    method: "POST",
                    body: { enabled: !row.isDeliveryDriver },
                  });
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
