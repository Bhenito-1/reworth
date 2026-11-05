"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@reworth/ui-web";
import { OnboardingShell } from "../../components/OnboardingShell";
import { PasswordField } from "../../components/PasswordField";
import { apiFetch, ApiError } from "../../lib/api";

type Step = "email" | "code" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordSubmitAttempted, setPasswordSubmitAttempted] = useState(false);
  const passwordsMatch = password === confirmPassword;
  const showPasswordMismatch =
    !passwordsMatch &&
    (confirmPassword.length > 0 || passwordSubmitAttempted);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/password-reset/request", {
        method: "POST",
        body: { email: em },
      });
      setEmail(em);
      setStep("code");
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordSubmitAttempted(true);
      return;
    }
    setPasswordSubmitAttempted(false);
    setLoading(true);
    try {
      await apiFetch("/auth/password-reset/confirm", {
        method: "POST",
        body: {
          email: email.trim().toLowerCase(),
          code: code.trim(),
          password,
        },
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <OnboardingShell
        title="Password updated"
        subtitle="You can sign in with your new password."
      >
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => router.replace("/login")}
        >
          Go to log in
        </Button>
      </OnboardingShell>
    );
  }

  if (step === "code") {
    return (
      <OnboardingShell
        title="Reset password"
        subtitle={`Enter the code we sent to ${email}, then choose a new password.`}
      >
        <form onSubmit={(e) => void resetPassword(e)} className="flex flex-col gap-4">
          <Input
            label="Reset code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          {showPasswordMismatch ? (
            <p className="-mt-2 text-sm text-[var(--rw-error)]" role="status">
              Passwords do not match.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--rw-error)]" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" disabled={loading}>
            {loading ? "…" : "Save new password"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm">
          <button
            type="button"
            className="font-medium text-[var(--rw-accent)]"
            disabled={loading}
            onClick={() => void requestCode({ preventDefault() {} } as FormEvent)}
          >
            Resend code
          </button>
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/login" className="text-[var(--rw-accent)]">
            Back to log in
          </Link>
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      title="Forgot password"
      subtitle="Enter your account email. We will send a 6-digit code to reset your password."
    >
      <form onSubmit={(e) => void requestCode(e)} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? (
          <p className="text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? "…" : "Send reset code"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-[var(--rw-accent)]">
          Back to log in
        </Link>
      </p>
    </OnboardingShell>
  );
}
