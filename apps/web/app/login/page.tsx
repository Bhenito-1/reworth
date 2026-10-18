"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@reworth/ui-web";
import { OnboardingShell } from "../../components/OnboardingShell";
import { PasswordField } from "../../components/PasswordField";
import { apiFetch, ApiError } from "../../lib/api";
import { isAuthed, setTokens } from "../../lib/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthed()) {
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
    }
  }, [router, nextPath]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em.includes("@") || password.length < 8) {
      setError("Email and password (min 8 characters) required");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{
        accessToken: string;
        refreshToken: string;
      }>("/auth/login", {
        method: "POST",
        body: {
          email: em,
          password,
          device: { name: "ReWorth Web", platform: "WEB" },
        },
      });
      setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell
      title="Welcome back"
      subtitle="Log in with the email you used to join ReWorth."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="password"
          value={password}
          onChange={setPassword}
        />
        {error ? (
          <p className="text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? "…" : "Log in"}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-center text-sm">
        <p className="text-[var(--rw-ink-muted)]">
          New here?{" "}
          <Link href="/onboarding" className="font-medium text-[var(--rw-accent)]">
            Create account
          </Link>
        </p>
        <Link href="/" className="text-[var(--rw-ink-muted)]">
          Back
        </Link>
      </div>
    </OnboardingShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <OnboardingShell title="Welcome back" subtitle="Loading…">
          <p className="text-[var(--rw-ink-muted)]">One moment.</p>
        </OnboardingShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
