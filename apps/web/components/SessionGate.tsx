"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

function resolveGate(pathname: string): {
  authed: boolean;
  allowed: boolean;
  redirectDriver: boolean;
  redirectLanding: boolean;
} {
  const publicPath = isPublicAuthPath(pathname);
  const authed = isAuthed();

  if (!authed && pathname.startsWith("/driver")) {
    return {
      authed: false,
      allowed: false,
      redirectDriver: true,
      redirectLanding: false,
    };
  }

  if (!authed && !publicPath) {
    return {
      authed: false,
      allowed: false,
      redirectDriver: false,
      redirectLanding: true,
    };
  }

  if (!authed && typeof window !== "undefined") {
    const raw = localStorage.getItem("rw_access_token");
    if (raw) clearTokens();
  }

  return {
    authed,
    allowed: true,
    redirectDriver: false,
    redirectLanding: false,
  };
}

/**
 * No session → landing (Login | Register), except /login and /onboarding.
 * Token refresh runs in the background so navigation is not blocked on /auth/refresh.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [authed, setAuthed] = useState(false);

  const applyGate = (path: string) => {
    const next = resolveGate(path);
    if (next.redirectDriver) {
      setAuthed(false);
      setAllowed(false);
      setReady(true);
      window.location.replace("/login?next=/driver");
      return;
    }
    if (next.redirectLanding) {
      setAuthed(false);
      setAllowed(false);
      setReady(true);
      forceLandingRedirect();
      return;
    }
    setAuthed(next.authed);
    setAllowed(next.allowed);
    setReady(true);
  };

  useLayoutEffect(() => {
    applyGate(pathname);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const maybeRefresh = () => {
      const access = getAccessToken();
      if (!getRefreshToken() || !access || !accessTokenNeedsRefresh(access)) {
        return;
      }
      void refreshSession().then((outcome) => {
        if (cancelled) return;
        if (
          outcome === "rejected" &&
          !isPublicAuthPath(pathnameRef.current)
        ) {
          applyGate(pathnameRef.current);
        }
      });
    };

    maybeRefresh();

    const onAuth = () => applyGate(pathnameRef.current);
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
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/driver");

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