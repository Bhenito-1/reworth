"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Modal, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  categoryLabel,
  channelLabel,
  getNotificationPreferences,
  isCriticalCategory,
  getWebPushVapidKey,
  saveWebPushSubscription,
  deleteWebPushSubscription,
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
  const [browserPushEnabled, setBrowserPushEnabled] = useState(false);
  const [browserPushBusy, setBrowserPushBusy] = useState(false);
  const [pushPrimeOpen, setPushPrimeOpen] = useState(false);
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

  useEffect(() => {
    let active = true;
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (active) setBrowserPushEnabled(Boolean(subscription));
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, []);

  async function disableBrowserPush() {
    const token = getAccessToken();
    if (!token) return;
    setBrowserPushBusy(true);
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("This browser does not support service workers");
      }
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      await deleteWebPushSubscription(token, current?.endpoint).catch(() =>
        deleteWebPushSubscription(token),
      );
      if (current) {
        await current.unsubscribe().catch(() => undefined);
      }
      await deleteWebPushSubscription(token).catch(() => undefined);
      setBrowserPushEnabled(false);
      setToast({ message: "Browser notifications disabled", tone: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not disable browser notifications",
        tone: "error",
      });
    } finally {
      setBrowserPushBusy(false);
    }
  }

  /** Completes subscribe after permission is already granted (or just requested). */
  async function enableBrowserPush() {
    const token = getAccessToken();
    if (!token) return;
    setBrowserPushBusy(true);
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("This browser does not support service workers");
      }
      if (!("Notification" in window) || !("PushManager" in window)) {
        throw new Error("This browser does not support push notifications");
      }

      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission === "denied") {
        throw new Error(
          "Notifications are blocked for this site. Allow them in your browser site settings, then try Enable again.",
        );
      }
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted");
      }

      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await getWebPushVapidKey(token);
      const padded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const padLen = (4 - (padded.length % 4)) % 4;
      const applicationServerKey = Uint8Array.from(
        atob(`${padded}${"=".repeat(padLen)}`),
        (char) => char.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) {
        await subscription.unsubscribe();
        throw new Error("Browser returned an incomplete push subscription");
      }
      await saveWebPushSubscription(token, {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: json.keys as { p256dh: string; auth: string },
      });
      setBrowserPushEnabled(true);
      setToast({ message: "Browser notifications enabled", tone: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not enable browser notifications",
        tone: "error",
      });
    } finally {
      setBrowserPushBusy(false);
    }
  }

  function onBrowserPushButtonClick() {
    if (browserPushBusy) return;
    if (browserPushEnabled) {
      void disableBrowserPush();
      return;
    }
    if (!("Notification" in window)) {
      setToast({
        message: "This browser does not support push notifications",
        tone: "error",
      });
      return;
    }
    // Always show the ReWorth step first. The native browser dialog only
    // appears after Continue, and only if permission was never decided.
    setPushPrimeOpen(true);
  }

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
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
              <div>
                <h2 className="text-base font-semibold">Browser push notifications</h2>
                <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                  Get offers, messages, and order updates as system alerts — even when ReWorth is closed.
                  You can turn this off anytime.
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={browserPushBusy}
                onClick={onBrowserPushButtonClick}
              >
                {browserPushBusy ? "…" : browserPushEnabled ? "Disable" : "Enable"}
              </Button>
            </section>
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

      <Modal
        open={pushPrimeOpen}
        onClose={() => setPushPrimeOpen(false)}
        title="Stay in the loop"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/icons/pwa-192.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-xl"
            />
            <p className="text-sm leading-relaxed text-[var(--rw-ink-muted)]">
              {typeof Notification !== "undefined" &&
              Notification.permission === "granted"
                ? "ReWorth will send alerts for messages, offers, and orders on this device. You’ve already allowed notifications in your browser, so enabling won’t show another browser dialog."
                : typeof Notification !== "undefined" &&
                    Notification.permission === "denied"
                  ? "Notifications are blocked for this site in your browser. Open site settings, allow notifications, then come back and enable."
                  : "ReWorth can alert you about messages, offers, and orders on this device. Next, your browser will ask you to Allow — that system dialog can’t be restyled, but you only see it once."}
            </p>
          </div>
          <ul className="space-y-2 text-sm text-[var(--rw-ink)]">
            <li className="flex gap-2">
              <span className="text-[var(--rw-accent)]" aria-hidden>
                •
              </span>
              Messages and offers from buyers or sellers
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--rw-accent)]" aria-hidden>
                •
              </span>
              Payment and delivery updates
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--rw-accent)]" aria-hidden>
                •
              </span>
              Turn off anytime with Disable
            </li>
          </ul>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={browserPushBusy}
              onClick={() => setPushPrimeOpen(false)}
            >
              Not now
            </Button>
            {typeof Notification !== "undefined" &&
            Notification.permission === "denied" ? (
              <Button
                variant="primary"
                onClick={() => setPushPrimeOpen(false)}
              >
                Got it
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={browserPushBusy}
                onClick={() => {
                  setPushPrimeOpen(false);
                  void enableBrowserPush();
                }}
              >
                {typeof Notification !== "undefined" &&
                Notification.permission === "granted"
                  ? "Enable alerts"
                  : "Continue"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

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
