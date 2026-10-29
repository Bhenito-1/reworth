"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNav } from "./AppNav";
import {
  accessTokenNeedsRefresh,
  AUTH_CHANGED_EVENT,
  clearTokens,
  forceLandingRedirect,
  getAccessToken,
  getRefreshToken,
  isAuthed,
  isPublicAuthPath,
  refreshSession,
} from "../lib/auth";

/**
 * No session → landing (Login | Register), except /login and /onboarding.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const access = getAccessToken();
      if (getRefreshToken() && (!access || accessTokenNeedsRefresh(access))) {
        const outcome = await refreshSession();
        if (cancelled) return;
        if (outcome === "rejected" && !isPublicAuthPath(pathname)) {
          setAuthed(false);
          setAllowed(false);
          setReady(true);
          forceLandingRedirect();
          return;
        }
      }
      if (cancelled) return;

      const publicPath = isPublicAuthPath(pathname);
      const authed = isAuthed();

      if (!authed && !publicPath) {
        setAuthed(false);
        setAllowed(false);
        setReady(true);
        forceLandingRedirect();
        return;
      }

      // Drop a dead access token only when nothing can renew the session.
      if (!authed && typeof window !== "undefined") {
        const raw = localStorage.getItem("rw_access_token");
        if (raw) clearTokens();
      }

      setAuthed(authed);
      setAllowed(true);
      setReady(true);
    };

    const onAuth = () => {
      const signedIn = isAuthed();
      setAuthed(signedIn);
      void sync();
    };
    void sync();
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    window.addEventListener("storage", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
      window.removeEventListener("storage", onAuth);
    };
  }, [pathname]);

  useEffect(() => {
    if (isPublicAuthPath(pathname)) return;
    const keepAlive = () => {
      void (async () => {
        const access = getAccessToken();
        if (access && !accessTokenNeedsRefresh(access)) return;
        if (getRefreshToken()) {
          const outcome = await refreshSession();
          if (outcome !== "rejected") return;
        }
        forceLandingRedirect();
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

  if (!ready) {
    return (
      <main
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]"
        aria-busy
      >
        <p className="text-sm">Loading…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]"
        aria-busy
      >
        <p className="text-sm">Redirecting…</p>
      </main>
    );
  }

  const hideNav =
    !authed ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/onboarding");

  return (
    <>
      <div
        className={
          hideNav
            ? undefined
            : "pt-14 [--rw-nav-offset:3.5rem] [--rw-sidebar-offset:0px] lg:pt-24 lg:[--rw-nav-offset:6rem]"
        }
      >
        {children}
      </div>
      {hideNav ? null : <AppNav />}
    </>
  );
}
