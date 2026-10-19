"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AuthGuard } from "./AuthGuard";
import { AdminShell } from "./AdminShell";

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // The first server and client render must match. Inputs and session data
  // are painted after mount so browser extensions cannot change attributes
  // before hydration.
  if (!mounted) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] text-[var(--rw-ink-muted)]">
        <p role="status">Checking session…</p>
      </div>
    );
  }

  return (
    <AuthGuard>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
