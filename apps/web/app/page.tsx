"use client";

import { Suspense, useEffect, useState } from "react";
import { Skeleton } from "@reworth/ui-web";
import { AUTH_CHANGED_EVENT, isAuthed } from "../lib/auth";
import { LandingPage } from "../components/LandingPage";
import { DiscoveryHomePage } from "../components/discovery/DiscoveryHomePage";

/**
 * Signed-in users see marketplace discovery; guests see the marketing landing.
 */
export default function RootPage() {
  const [authed, setAuthed] = useState(() =>
    typeof window !== "undefined" ? isAuthed() : false,
  );

  useEffect(() => {
    const sync = () => setAuthed(isAuthed());
    sync();
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, sync);
  }, []);

  const fallback = (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8">
      <Skeleton
        className="mx-auto h-12 w-full max-w-6xl"
        label="Loading"
      />
    </main>
  );

  return (
    <Suspense fallback={fallback}>
      {authed ? <DiscoveryHomePage /> : <LandingPage />}
    </Suspense>
  );
}