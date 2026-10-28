"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  accessTokenNeedsRefresh,
  forceLoginRedirect,
  getAccessToken,
  getRefreshToken,
  getRoles,
  hasAnyRole,
  isAuthed,
  refreshSession,
  rolesForPath,
} from "../lib/auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (pathname === "/login") {
        setReady(true);
        setForbidden(false);
        setSignedIn(false);
        return;
      }

      const access = getAccessToken();
      if (getRefreshToken() && (!access || accessTokenNeedsRefresh(access))) {
        const outcome = await refreshSession();
        if (cancelled) return;
        if (outcome === "rejected") {
          setSignedIn(false);
          setReady(true);
          forceLoginRedirect();
          return;
        }
      }
      if (cancelled) return;

      if (!isAuthed()) {
        setSignedIn(false);
        setReady(true);
        forceLoginRedirect();
        return;
      }

      setSignedIn(true);
      const allowed = rolesForPath(pathname);
      if (allowed && !hasAnyRole(getRoles(), allowed)) {
        setForbidden(true);
        setReady(true);
        return;
      }
      setForbidden(false);
      setReady(true);
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Renew the access token while the tab stays open on a protected page.
  useEffect(() => {
    if (pathname === "/login") return;
    const keepAlive = () => {
      void (async () => {
        const access = getAccessToken();
        if (access && !accessTokenNeedsRefresh(access)) return;
        if (getRefreshToken()) {
          const outcome = await refreshSession();
          if (outcome !== "rejected") return;
        }
        forceLoginRedirect();
      })();
    };
    const id = window.setInterval(keepAlive, 15_000);
    const onFocus = () => keepAlive();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]">
        <p role="status">Checking session…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]">
        <p role="status">Redirecting to login…</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[var(--rw-bg)] px-6 text-center">
        <p className="text-lg font-semibold text-[var(--rw-ink)]">403 — Forbidden</p>
        <p className="max-w-md text-sm text-[var(--rw-ink-muted)]">
          Your role cannot open this page. API denials are also audit-logged.
        </p>
        <button
          type="button"
          className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
          onClick={() => {
            window.location.assign("/");
          }}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
