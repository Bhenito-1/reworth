"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../lib/api";

type AlertItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export function AdminAlertsBell({
  placement = "down",
}: {
  placement?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AlertItem[]>([]);
  const wipeTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch<{ unread: number; items: AlertItem[] }>(
        "/admin/alerts",
      );
      setUnread(res.unread);
      setItems(res.items.filter((item) => !item.readAt));
    } catch {
      // Auth redirects own a 401. A blip should not block the rest of the shell.
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function openAlert(item: AlertItem) {
    setOpen(false);
    if (item.readAt) return;
    try {
      await adminFetch(`/admin/alerts/${item.id}/read`, { method: "POST" });
      setUnread((count) => Math.max(0, count - 1));
      setItems((rows) => rows.filter((row) => row.id !== item.id));
    } catch {
      // The queue page is still the source of truth if marking read fails.
    }
  }

  async function markAll() {
    try {
      await adminFetch("/admin/alerts/read-all", { method: "POST" });
      setUnread(0);
      setItems([]);
    } catch {
      // Leave the badge in place so the admin can retry.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--rw-ink)] hover:bg-[var(--rw-accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) return;
          if (wipeTimer.current) window.clearTimeout(wipeTimer.current);
          wipeTimer.current = window.setTimeout(() => {
            void (async () => {
              try {
                await adminFetch("/admin/alerts/read-all", { method: "POST" });
                setUnread(0);
                setItems([]);
              } catch {
                /* keep the alerts visible if marking them read fails */
              }
            })();
          }, 30_000);
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--rw-error)] px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Admin alerts"
          className={`absolute right-0 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-3 shadow-lg ${
            placement === "up" ? "bottom-full mb-2" : "mt-2"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Needs attention</p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-[var(--rw-accent)]"
                onClick={() => void markAll()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="py-4 text-sm text-[var(--rw-ink-muted)]">
              No alerts yet.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => void openAlert(item)}
                    className={`block rounded-[var(--rw-radius)] px-2 py-2 text-left hover:bg-[var(--rw-accent-muted)] ${
                      item.readAt ? "opacity-70" : ""
                    }`}
                  >
                    <span className="block text-sm font-medium text-[var(--rw-ink)]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--rw-ink-muted)]">
                      {item.body}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
