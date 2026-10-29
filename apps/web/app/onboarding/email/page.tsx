"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@reworth/ui-web";
import { OnboardingShell } from "../../../components/OnboardingShell";
import { PasswordField } from "../../../components/PasswordField";
import { apiFetch, ApiError } from "../../../lib/api";
import { setTokens } from "../../../lib/auth";

/** Register-only email step. */
export default function OnboardingEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em.includes("@") || password.length < 8) {
      setError("Email and password (min 8 characters) required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: {
          email: em,
          password,
          displayName: displayName.trim() || em.split("@")[0],
          device: { name: "ReWorth Web", platform: "WEB" },
        },
      });
      setPendingEmail(em);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!pendingEmail) return;
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{
        accessToken: string;
        refreshToken: string;
      }>("/auth/email-otp/verify", {
        method: "POST",
        body: {
          email: pendingEmail,
          code: code.trim(),
          device: { name: "ReWorth Web", platform: "WEB" },
        },
      });
      setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      router.push("/onboarding/profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify code");
    } finally {
      setLoading(false);
    }
  }

  if (pendingEmail) {
    return (
      <OnboardingShell
        step={2}
        totalSteps={3}
        title="Check your email"
        subtitle={`Enter the 6-digit code we sent to ${pendingEmail}.`}
      >
        <form onSubmit={(e) => void onVerify(e)} className="flex flex-col gap-4">
          <Input
            label="Sign-up code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error ? (
            <p className="text-sm text-[var(--rw-error)]" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" disabled={loading}>
            {loading ? "…" : "Verify email"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm">
          <button
            type="button"
            className="font-medium text-[var(--rw-accent)]"
            disabled={loading}
            onClick={() =>
              void onSubmit({ preventDefault() {} } as FormEvent)
            }
          >
            Resend code
          </button>
        </p>
        <p className="mt-3 text-center text-sm">
          <button
            type="button"
            className="font-medium text-[var(--rw-accent)]"
            onClick={() => {
              setPendingEmail(null);
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={2}
      totalSteps={3}
      title="Create account"
      subtitle="Use your email to join ReWorth. We will email you a code to confirm it."
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
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
        {passwordsMismatch ? (
          <p className="-mt-2 text-sm text-[var(--rw-error)]" role="status">
            Passwords do not match.
          </p>
        ) : null}
        <Input
          label="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        {error && !(passwordsMismatch && error === "Passwords do not match") ? (
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
