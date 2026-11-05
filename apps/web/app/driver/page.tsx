"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "../../lib/api";
import { clearTokens, getAccessToken, getRefreshToken } from "../../lib/auth";
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
import type { MeResponse } from "../../lib/types";

const PROGRESS = [
  { status: "ASSIGNED", label: "Assigned & accepted" },
  { status: "PICKED_UP", label: "Collected from seller" },
  { status: "IN_TRANSIT", label: "On the way" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
] as const;

const RANK: Record<string, number> = {
  OFFERED: 0,
  ASSIGNED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};

type Section = "active" | "pickups";

function naira(kobo?: number | null): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format((kobo ?? 0) / 100);
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

function runCode(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

function isPickup(row: DriverAssignment): boolean {
  return row.status === "OFFERED" && !row.accepted;
}

function mapsHref(row: DriverAssignment): string | null {
  const from = row.pickup;
  const to = row.dropoff;
  if (
    from?.lat == null ||
    from.lng == null ||
    to?.lat == null ||
    to.lng == null
  ) {
    return null;
  }
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

async function signOutRider() {
  const refreshToken = getRefreshToken();
  clearTokens();
  void apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
  window.location.replace("/");
}

export default function DriverRunsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DriverAssignment[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      const token = getAccessToken();
      if (!token) {
        router.replace("/login?next=/driver");
        return;
      }
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const [assignments, profile] = await Promise.all([
          listDriverAssignments(token),
          quiet
            ? Promise.resolve(null)
            : apiFetch<MeResponse>("/me", { token }),
        ]);
        setRows(assignments);
        if (profile) setMe(profile);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not load driver runs",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(true), 8000);
    return () => clearInterval(timer);
  }, [load]);

  const activeRuns = useMemo(
    () => rows.filter((row) => !isPickup(row)),
    [rows],
  );
  const pickups = useMemo(() => rows.filter(isPickup), [rows]);

  useEffect(() => {
    if (selectedId && rows.some((row) => row.orderId === selectedId)) return;
    const next = activeRuns[0] ?? pickups[0] ?? null;
    setSelectedId(next?.orderId ?? null);
    if (next && isPickup(next)) setSection("pickups");
  }, [rows, selectedId, activeRuns, pickups]);

  const selected =
    rows.find((row) => row.orderId === selectedId) ??
    activeRuns[0] ??
    pickups[0] ??
    null;
  const featuredActive =
    activeRuns.find((row) => row.orderId === selectedId) ?? activeRuns[0] ?? null;

  const onRunFees = activeRuns.reduce(
    (sum, row) => sum + (row.quoteKobo ?? 0),
    0,
  );
  const corridor = selected
    ? `${selected.community ?? "Pickup"} → ${selected.dropoffArea ?? "Dropoff"}`
    : "Waiting for a run";
  const riderName = me?.profile?.displayName?.trim() || "Rider";

  async function accept(row: DriverAssignment) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(row.orderId);
    try {
      await acceptDriverRun(token, row.orderId);
      setToast("Accepted. Pickup and dropoff are now visible.");
      setSection("active");
      setSelectedId(row.orderId);
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
      await declineDriverRun(token, row.orderId);
      setToast("Declined. The run goes to the next rider.");
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
    if (failed && !failReason.trim()) {
      setToast("Add what went wrong before reporting the run.");
      setReportOpen(true);
      return;
    }
    setBusyId(row.orderId);
    try {
      const result = await submitDriverMilestone(
        token,
        row.orderId,
        {
          status,
          failureReason: failed ? failReason : undefined,
          occurredAt: new Date().toISOString(),
        },
        newIdempotencyKey(row.orderId, status),
      );
      setToast(
        result.accepted
          ? `Updated → ${shipmentStatusLabel(result.status ?? status)}`
          : `Late update ignored — still ${shipmentStatusLabel(result.currentStatus ?? row.status)}`,
      );
      if (failed && result.accepted) {
        setReportOpen(false);
        setFailReason("");
      }
      await load(true);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rw-ink-muted)]">
            ReWorth
          </p>
          <p className="truncate text-sm font-semibold">Courier portal</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rw-success-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--rw-success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--rw-success)]" />
          Online
        </span>
        <p className="hidden min-w-0 flex-1 truncate text-sm text-[var(--rw-ink-muted)] sm:block">
          {corridor}
        </p>
        <button
          type="button"
          className="ml-auto rounded-full bg-[var(--rw-error-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--rw-error)]"
          onClick={() => setReportOpen(true)}
        >
          SOS
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--rw-bg-warm)] text-xs font-semibold">
            {riderName.slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-[8rem] truncate text-sm font-medium">
            {riderName}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24 lg:pb-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="On your runs" value={naira(onRunFees)} />
          <Stat label="Active runs" value={String(activeRuns.length)} />
          <Stat label="Corridor" value={corridor} />
          <Stat label="Pickups waiting" value={String(pickups.length)} />
        </div>
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_280px]">
        <nav className="hidden lg:block" aria-label="Courier">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rw-ink-muted)]">
            Operations
          </p>
          <div className="space-y-1">
            <SideLink
              label="Active runs"
              count={activeRuns.length}
              pressed={section === "active"}
              onClick={() => {
                setSection("active");
                if (activeRuns[0]) setSelectedId(activeRuns[0].orderId);
              }}
            />
            <SideLink
              label="Available pickups"
              count={pickups.length}
              pressed={section === "pickups"}
              onClick={() => {
                setSection("pickups");
                if (pickups[0]) setSelectedId(pickups[0].orderId);
              }}
            />
          </div>
          <button
            type="button"
            className="mt-8 px-3 text-sm font-medium text-[var(--rw-ink-muted)] underline"
            onClick={() => void signOutRider()}
          >
            Sign out
          </button>
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="flex gap-2 lg:hidden" role="tablist">
            <TabButton
              label="Active run"
              count={activeRuns.length}
              pressed={section === "active"}
              onClick={() => setSection("active")}
            />
            <TabButton
              label="Available pickups"
              count={pickups.length}
              pressed={section === "pickups"}
              onClick={() => setSection("pickups")}
            />
          </div>

          {toast ? (
            <p className="text-sm text-[var(--rw-success)]" role="status">
              {toast}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--rw-error)]" role="alert">
              {error}
            </p>
          ) : null}
          {loading ? (
            <p className="text-sm text-[var(--rw-ink-muted)]">Loading runs…</p>
          ) : section === "pickups" ? (
            <PickupList
              rows={pickups}
              busyId={busyId}
              onAccept={(row) => void accept(row)}
              onDecline={(row) => void decline(row)}
            />
          ) : featuredActive ? (
            <ActiveRun
              row={featuredActive}
              busy={busyId === featuredActive.orderId}
              onAdvance={() => void advance(featuredActive, false)}
              onReport={() => setReportOpen(true)}
            />
          ) : (
            <Empty
              title="No active run"
              body="Accept a pickup and it will show here with the address."
            />
          )}
        </div>

        <aside className="hidden space-y-4 lg:block">
          <RouteCard row={featuredActive} />
          <section className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
            <h2 className="text-sm font-semibold">Available pickups</h2>
            {pickups.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                None waiting. A funded delivery offers itself here.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pickups.map((row) => (
                  <li key={row.orderId}>
                    <PickupCard
                      row={row}
                      busy={busyId === row.orderId}
                      compact
                      onAccept={() => void accept(row)}
                      onDecline={() => void decline(row)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-2 py-2 lg:hidden"
        aria-label="Courier"
      >
        <TabButton
          label="Runs"
          pressed={section === "active"}
          onClick={() => setSection("active")}
        />
        <TabButton
          label="Pickups"
          count={pickups.length}
          pressed={section === "pickups"}
          onClick={() => setSection("pickups")}
        />
        <button
          type="button"
          className="rounded-full px-3 py-2 text-sm font-medium text-[var(--rw-ink-muted)]"
          onClick={() => void signOutRider()}
        >
          Sign out
        </button>
      </nav>

      {reportOpen ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#172A3A]/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-labelledby="report-title"
            className="w-full max-w-md rounded-[var(--rw-radius-lg)] bg-[var(--rw-bg-elevated)] p-5 shadow-lg"
          >
            <h2 id="report-title" className="text-lg font-semibold">
              Report this run
            </h2>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              This marks the active delivery as undeliverable and tells the
              buyer. It does not call emergency services.
            </p>
            {featuredActive ? (
              <>
                <label className="mt-4 block text-sm font-medium" htmlFor="fail-reason">
                  What went wrong
                  <textarea
                    id="fail-reason"
                    className="mt-1 w-full rounded-xl border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2 text-sm"
                    rows={3}
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                  />
                </label>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-[var(--rw-error)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busyId === featuredActive.orderId}
                    onClick={() => void advance(featuredActive, true)}
                  >
                    Could not deliver
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 text-sm font-medium"
                    onClick={() => setReportOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm">Accept a run before reporting it.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SideLink({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium ${
        pressed
          ? "bg-[var(--rw-orange)] text-white"
          : "text-[var(--rw-ink)] hover:bg-[var(--rw-bg-warm)]"
      }`}
    >
      <span>{label}</span>
      <span className={pressed ? "text-white/90" : "text-[var(--rw-ink-muted)]"}>
        {count}
      </span>
    </button>
  );
}

function TabButton({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={pressed}
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-sm font-semibold ${
        pressed
          ? "bg-[var(--rw-navy)] text-white"
          : "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink-muted)]"
      }`}
    >
      {label}
      {count != null ? ` ${count}` : ""}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--rw-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold text-[var(--rw-orange)]">
        {value}
      </p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--rw-radius-lg)] border border-dashed border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">{body}</p>
    </div>
  );
}

function ActiveRun({
  row,
  busy,
  onAdvance,
  onReport,
}: {
  row: DriverAssignment;
  busy: boolean;
  onAdvance: () => void;
  onReport: () => void;
}) {
  const next = nextMilestone(row.status);
  const rank = RANK[row.status] ?? 0;
  const pickup = stopLine(row.pickup, row.community ?? "Seller area");
  const dropoff = stopLine(row.dropoff, row.dropoffArea ?? "Buyer area");
  return (
    <article className="rounded-[1.25rem] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
            ReWorth delivery · #{runCode(row.orderId)}
          </p>
          <h1 className="mt-1 text-xl font-semibold leading-snug">
            {row.listingTitle ?? "Delivery"}
          </h1>
        </div>
        <p className="text-right text-lg font-semibold text-[var(--rw-orange)]">
          {naira(row.quoteKobo)}
          <span className="block text-xs font-medium text-[var(--rw-ink-muted)]">
            {row.distanceKm != null
              ? `${row.distanceKm.toFixed(1)} km`
              : shipmentStatusLabel(row.status)}
          </span>
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Party
          mark="A"
          kicker="Pickup"
          name={row.sellerName ?? "Seller"}
          line={pickup}
          extra={row.sellerPhone ? `Phone ${row.sellerPhone}` : "Address after accept"}
        />
        <Party
          mark="B"
          kicker="Dropoff"
          name={row.dropoffArea ?? "Buyer"}
          line={dropoff}
          extra={row.city ?? "Lagos"}
        />
      </div>

      <h2 className="mt-5 text-sm font-semibold">Delivery progress</h2>
      <ol className="mt-2 space-y-2">
        {PROGRESS.map((step) => {
          const stepRank = RANK[step.status] ?? 0;
          const done = rank >= stepRank && row.status !== "FAILED";
          const current = row.status === step.status;
          return (
            <li key={step.status} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  done
                    ? "bg-[var(--rw-success)] text-white"
                    : "border border-[var(--rw-border)] text-[var(--rw-ink-muted)]"
                }`}
                aria-hidden
              >
                {done ? "✓" : ""}
              </span>
              <span className={current ? "font-semibold" : "text-[var(--rw-ink-muted)]"}>
                {step.label}
              </span>
              {current ? (
                <span className="ml-auto text-xs font-medium text-[var(--rw-orange)]">
                  Now
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        {next ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-full bg-[var(--rw-orange)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={onAdvance}
          >
            {busy ? "Updating…" : `Mark ${milestoneButtonLabel(next)}`}
          </button>
        ) : (
          <p className="text-sm text-[var(--rw-ink-muted)]">
            {shipmentStatusLabel(row.status)}
          </p>
        )}
        <button
          type="button"
          className="rounded-full border border-[var(--rw-border)] px-4 py-2.5 text-sm font-medium"
          onClick={onReport}
        >
          Report an issue
        </button>
      </div>
    </article>
  );
}

function Party({
  mark,
  kicker,
  name,
  line,
  extra,
}: {
  mark: string;
  kicker: string;
  name: string;
  line: string;
  extra: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--rw-bg)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--rw-orange)] text-[10px] text-white">
          {mark}
        </span>
        {kicker}
      </p>
      <p className="mt-2 font-semibold">{name}</p>
      <p className="text-sm text-[var(--rw-ink-muted)]">{line}</p>
      <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">{extra}</p>
    </div>
  );
}

function RouteCard({ row }: { row: DriverAssignment | null }) {
  if (!row || isPickup(row)) {
    return (
      <section className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
        <h2 className="text-sm font-semibold">Route</h2>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Accept a run to open the pickup and dropoff.
        </p>
      </section>
    );
  }
  const href = mapsHref(row);
  return (
    <section className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
      <h2 className="text-sm font-semibold">Route</h2>
      <p className="mt-2 text-sm">
        {stopLine(row.pickup, row.community ?? "Pickup")}
      </p>
      <p className="my-1 text-xs text-[var(--rw-orange)]">↓</p>
      <p className="text-sm">
        {stopLine(row.dropoff, row.dropoffArea ?? "Dropoff")}
      </p>
      <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">
        {row.distanceKm != null
          ? `About ${row.distanceKm.toFixed(1)} km`
          : "Distance pending"}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-semibold text-[var(--rw-orange)]"
        >
          Open route
        </a>
      ) : null}
    </section>
  );
}

function PickupList({
  rows,
  busyId,
  onAccept,
  onDecline,
}: {
  rows: DriverAssignment[];
  busyId: string | null;
  onAccept: (row: DriverAssignment) => void;
  onDecline: (row: DriverAssignment) => void;
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No pickups waiting"
        body="When a buyer pays, the run is offered here."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.orderId}>
          <PickupCard
            row={row}
            busy={busyId === row.orderId}
            onAccept={() => onAccept(row)}
            onDecline={() => onDecline(row)}
          />
        </li>
      ))}
    </ul>
  );
}

function PickupCard({
  row,
  busy,
  compact = false,
  onAccept,
  onDecline,
}: {
  row: DriverAssignment;
  busy: boolean;
  compact?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--rw-ink-muted)]">
            #{runCode(row.orderId)}
          </p>
          <p className="font-semibold">{row.listingTitle ?? "Delivery"}</p>
          <p className="text-sm text-[var(--rw-ink-muted)]">
            {row.community ?? "Pickup"} → {row.dropoffArea ?? "Dropoff"}
          </p>
        </div>
        <p className="font-semibold text-[var(--rw-orange)]">{naira(row.quoteKobo)}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-full bg-[var(--rw-orange)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={onAccept}
        >
          {busy ? "…" : "Accept run"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-full border border-[var(--rw-border)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          onClick={onDecline}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
