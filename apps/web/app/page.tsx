"use client";

import { useEffect, useState } from "react";
import { LandingPage } from "../components/LandingPage";
import { DiscoveryHomePage } from "../components/discovery/DiscoveryHomePage";
import { AUTH_CHANGED_EVENT, isAuthed } from "../lib/auth";

/**
 * Cold start: guests see landing (Login | Register).
 * Signed-in users see discovery home. Logout returns here → landing.
 */
export default function RootPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAuthed(isAuthed());
      setReady(true);
    };
    sync();
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

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

  return authed ? <DiscoveryHomePage /> : <LandingPage />;
}
