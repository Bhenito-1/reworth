"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@reworth/ui-web";
import { OnboardingShell } from "../../../components/OnboardingShell";
import { apiFetch, ApiError } from "../../../lib/api";
import { setTokens } from "../../../lib/auth";

/** Register-only email step. */
export default function OnboardingEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      }>("/auth/register", {
        method: "POST",
        body: {
          email: em,
          password,
          displayName: displayName.trim() || em.split("@")[0],
          device: { name: "ReWorth Web", platform: "WEB" },
        },
      });
      setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      router.push("/onboarding/profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell
      step={2}
      totalSteps={3}
      title="Create account"
      subtitle="Use your email to join ReWorth, then customise your profile."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        {error ? (
          <p className="text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? "…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--rw-ink-muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--rw-accent)]">
          Log in
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href="/onboarding" className="text-[var(--rw-accent)]">
          Back
        </Link>
      </p>
    </OnboardingShell>
  );
}
