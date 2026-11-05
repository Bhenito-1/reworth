"use client";

import { useEffect, useRef, useState } from "react";

const SW_RELOAD_FLAG = "reworth:sw-reload";

function reloadForUpdate() {
  sessionStorage.removeItem(SW_RELOAD_FLAG);
  window.location.reload();
}

/** Shows a small banner when a waiting service-worker update is ready. */
export function PwaManager() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [updating, setUpdating] = useState(false);
  const reloadTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let updateInterval: number | null = null;

    void navigator.serviceWorker.ready
      .then((reg) => {
        if (cancelled) return;

        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing || !navigator.serviceWorker.controller) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installing);
            }
          });
        });

        const check = () => {
          void reg.update().catch(() => undefined);
        };
        check();
        updateInterval = window.setInterval(check, 5 * 60 * 1000);
      })
      .catch(() => undefined);

    const onControllerChange = () => {
      if (sessionStorage.getItem(SW_RELOAD_FLAG) !== "1") return;
      reloadForUpdate();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      if (updateInterval != null) window.clearInterval(updateInterval);
      if (reloadTimer.current != null) {
        window.clearTimeout(reloadTimer.current);
      }
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-3 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:left-auto sm:w-80"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <p className="min-w-0 flex-1 text-sm text-[var(--rw-ink)]">
        {updating
          ? "Updating ReWorth — reloading…"
          : "A newer version of ReWorth is ready."}
      </p>
      <button
        type="button"
        disabled={updating}
        className="shrink-0 rounded-xl bg-[var(--rw-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => {
          if (updating) return;
          setUpdating(true);
          sessionStorage.setItem(SW_RELOAD_FLAG, "1");

          const worker = waitingWorker;
          const finish = () => {
            if (reloadTimer.current != null) {
              window.clearTimeout(reloadTimer.current);
              reloadTimer.current = null;
            }
            reloadForUpdate();
          };

          // Already active/redundant from an earlier activate — just reload.
          if (worker.state === "activated" || worker.state === "redundant") {
            finish();
            return;
          }

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "activated" ||
              worker.state === "redundant"
            ) {
              finish();
            }
          });
          worker.postMessage({ type: "SKIP_WAITING" });

          // Never leave the button spinning if controllerchange is missed.
          reloadTimer.current = window.setTimeout(finish, 1200);
        }}
      >
        {updating ? "…" : "Update"}
      </button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        disabled={updating}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] disabled:opacity-50"
        onClick={() => setWaitingWorker(null)}
      >
        ×
      </button>
    </div>
  );
}
