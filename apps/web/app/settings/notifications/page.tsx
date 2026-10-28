"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  categoryLabel,
  channelLabel,
  getNotificationPreferences,
  isCriticalCategory,
  patchNotificationPreference,
  type NotificationChannel,
  type NotificationPreference,
} from "../../../lib/notifications";
import type { MeResponse } from "../../../lib/types";

type PrefKey = `${string}:${NotificationChannel}`;

function prefKey(category: string, channel: string): PrefKey {
  return `${category}:${channel}` as PrefKey;
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Map<PrefKey, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<PrefKey | null>(null);
  const [quietStart, setQuietStart] = useState("22");
  const [quietEnd, setQuietEnd] = useState("7");
  const [quietBusy, setQuietBusy] = useState(false);
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
      const [rows, me] = await Promise.all([
        getNotificationPreferences(token),
        apiFetch<MeResponse>("/me", { token }),
      ]);
      const map = new Map<PrefKey, boolean>();
      for (const cat of NOTIFICATION_CATEGORIES) {
        for (const ch of NOTIFICATION_CHANNELS) {
          map.set(prefKey(cat, ch), true);
        }
      }
      for (const row of rows) {
        map.set(
          prefKey(row.category, row.channel as NotificationChannel),
          row.enabled,
        );
      }
      setPrefs(map);
      if (me.profile?.quietHoursStart != null) {
        setQuietStart(String(me.profile.quietHoursStart));
      }
      if (me.profile?.quietHoursEnd != null) {
        setQuietEnd(String(me.profile.quietHoursEnd));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const criticalNote = useMemo(
    () =>
      "Payment, delivery, and dispute alerts stay on for in-app so you never miss escrow or fulfilment updates.",
    [],
  );

  async function toggle(
    category: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    if (channel === "IN_APP" && isCriticalCategory(category) && !enabled) {
      setToast({
        message: "In-app alerts for this category cannot be turned off",
        tone: "warn",
      });
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    const key = prefKey(category, channel);
    const prev = prefs.get(key) ?? true;
    setPrefs((m) => new Map(m).set(key, enabled));
    setSaving(key);
    try {
      const row: NotificationPreference = await patchNotificationPreference(
        token,
        { category, channel, enabled },
      );
      setPrefs((m) => new Map(m).set(key, row.enabled));
    } catch (err) {
      setPrefs((m) => new Map(m).set(key, prev));
      setToast({
        message: err instanceof ApiError ? err.message : "Save failed",
        tone: "error",
      });
    } finally {
      setSaving(null);
    }
  }

  async function saveQuietHours() {
    const token = getAccessToken();
    if (!token) return;
    const start = Number(quietStart);
    const end = Number(quietEnd);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      start > 23 ||
      end < 0 ||
      end > 23
    ) {
      setToast({ message: "Quiet hours must be 0–23", tone: "warn" });
      return;
    }
    setQuietBusy(true);
    try {
      await apiFetch("/me", {
        method: "PATCH",
        token,
        body: { quietHoursStart: start, quietHoursEnd: end },
      });
      setToast({ message: "Quiet hours saved", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Save failed",
        tone: "error",
      });
    } finally {
      setQuietBusy(false);
    }
  }

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

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link
            href="/notifications"
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Notifications
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        <h1 className="text-2xl font-semibold tracking-tight">
          Notification preferences
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">{criticalNote}</p>

        {loading ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <div className="mt-12">
            <EmptyState
              title="Preferences unavailable"
              description={error}
              action={
                <Button variant="primary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <section
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
              aria-labelledby="quiet-hours-heading"
            >
              <h2 id="quiet-hours-heading" className="text-base font-semibold">
                Quiet hours
              </h2>
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                Non-critical push and email stay silent between these hours
                (0–23, WAT). Critical escrow alerts still get through.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Start
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="mt-1 block w-20 rounded-[var(--rw-radius-md)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-1.5 text-sm"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  End
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="mt-1 block w-20 rounded-[var(--rw-radius-md)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-1.5 text-sm"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={quietBusy}
                  onClick={() => void saveQuietHours()}
                >
                  {quietBusy ? "…" : "Save"}
                </Button>
              </div>
            </section>

            {NOTIFICATION_CATEGORIES.map((category) => {
              const critical = isCriticalCategory(category);
              return (
                <section
                  key={category}
                  className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
                  aria-labelledby={`pref-${category}`}
                >
                  <h2
                    id={`pref-${category}`}
                    className="text-base font-semibold"
                  >
                    {categoryLabel(category)}
                  </h2>
                  {critical ? (
                    <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                      In-app cannot be fully disabled for payment, delivery, or
                      dispute updates.
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-3">
                    {NOTIFICATION_CHANNELS.map((channel) => {
                      const key = prefKey(category, channel);
                      const enabled = prefs.get(key) ?? true;
                      const locked =
                        channel === "IN_APP" && critical && enabled;
                      const busy = saving === key;
                      return (
                        <li
                          key={channel}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-sm">
                            {channelLabel(channel)}
                          </span>
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <span className="sr-only">
                              {categoryLabel(category)} via{" "}
                              {channelLabel(channel)}
                            </span>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--rw-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                              checked={enabled}
                              disabled={busy || locked}
                              onChange={(e) =>
                                void toggle(category, channel, e.target.checked)
                              }
                            />
                            {locked ? (
                              <span className="text-xs text-[var(--rw-ink-muted)]">
                                Required
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
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
