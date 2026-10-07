"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  categoryLabel,
  deepLinkToPath,
  clearNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../../lib/notifications";

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      const rows = await listNotifications(token);
      setItems(rows);
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

  const unreadCount = useMemo(
    () => items.filter((n) => !n.readAt).length,
    [items],
  );

  async function onOpen(n: AppNotification) {
    const token = getAccessToken();
    if (token && !n.readAt) {
      try {
        await markNotificationRead(token, n.id);
        setItems((rows) =>
          rows.map((r) =>
            r.id === n.id ? { ...r, readAt: new Date().toISOString() } : r,
          ),
        );
      } catch {
        /* continue */
      }
    }
    const path = deepLinkToPath(n.deepLink);
    if (path) router.push(path);
  }

  async function onMarkAll() {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    const stamp = new Date().toISOString();
    const previous = items;
    setItems((rows) =>
      rows.map((row) => ({ ...row, readAt: row.readAt ?? stamp })),
    );
    try {
      const result = await markAllNotificationsRead(token);
      if (result.updated === 0 && previous.some((row) => !row.readAt)) {
        setItems(previous);
        setToast({
          message: "Could not mark notifications as read",
          tone: "error",
        });
        return;
      }
      setToast({ message: "All marked read", tone: "success" });
    } catch (err) {
      setItems(previous);
      setToast({
        message: err instanceof ApiError ? err.message : "Failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    const token = getAccessToken();
    if (!token || items.length === 0) return;
    setBusy(true);
    const previous = items;
    setItems([]);
    try {
      await clearNotifications(token);
      setToast({ message: "Notifications cleared", tone: "success" });
    } catch (err) {
      setItems(previous);
      setToast({
        message: err instanceof ApiError ? err.message : "Could not clear notifications",
        tone: "error",
      });
    } finally {
      setBusy(false);
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "You are up to date"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/notifications">
              <Button variant="secondary" size="sm">
                Preferences
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || unreadCount === 0}
              onClick={() => void onMarkAll()}
            >
              Mark all read
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || items.length === 0}
              onClick={() => void onClear()}
            >
              Clear notifications
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <div className="mt-12">
            <EmptyState
              title="Couldn’t load notifications"
              description={error}
              action={
                <Button variant="primary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              title="No notifications"
              description="Activity from orders, chat, and delivery will appear here."
            />
          </div>
        ) : (
          <ul className="mt-8 space-y-2">
            {items.map((n) => {
              const path = deepLinkToPath(n.deepLink);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void onOpen(n)}
                    className={[
                      "w-full rounded-[var(--rw-radius-lg)] border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                      n.readAt
                        ? "border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/60"
                        : "border-[var(--rw-accent)]/25 bg-[var(--rw-accent-muted)]/30",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={[
                            "text-sm",
                            n.readAt ? "font-medium" : "font-semibold",
                          ].join(" ")}
                        >
                          {n.title}
                        </p>
                        <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                          {n.body}
                        </p>
                        <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">
                          {categoryLabel(n.category)} ·{" "}
                          {new Date(n.createdAt).toLocaleString("en-NG")}
                          {path ? ` · Open ${path}` : ""}
                        </p>
                      </div>
                      {!n.readAt ? (
                        <span
                          aria-label="Unread"
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--rw-accent)]"
                        />
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
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
