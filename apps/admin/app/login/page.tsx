"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@reworth/ui-web";
import { apiFetch, ApiError } from "../../lib/api";
import {
  isAuthed,
  rolesFromAccessToken,
  setSession,
} from "../../lib/auth";

type LoginOk = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  roles?: string[];
  totpRequired?: false;
};

type LoginTotp = {
  totpRequired: true;
  challengeToken: string;
  userId: string;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthed()) router.replace("/");
  }, [router]);

  function persistSession(
    accessToken: string,
    refreshToken: string,
    emailValue: string,
    rolesHint?: string[],
  ) {
    const roles =
      rolesHint?.length ? rolesHint : rolesFromAccessToken(accessToken);
    setSession({
      accessToken,
      refreshToken,
      roles,
      email: emailValue.trim().toLowerCase(),
    });
    router.replace("/");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (challengeToken) {
      if (totp.trim().length < 6) {
        setError("Enter your 6-digit authenticator code");
        return;
      }
      setLoading(true);
      try {
        const res = await apiFetch<LoginOk>("/admin/auth/totp/verify", {
          method: "POST",
          body: { code: totp.trim(), challengeToken },
        });
        persistSession(res.accessToken, res.refreshToken, email, res.roles);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Verification failed.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || password.length < 8) {
      setError("Enter email and password (min 8 characters)");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<LoginOk | LoginTotp>("/admin/auth/login", {
        method: "POST",
        body: {
          email: email.trim(),
          password,
        },
      });

      if ("totpRequired" in res && res.totpRequired) {
        setChallengeToken(res.challengeToken);
        setError(null);
        return;
      }

      const ok = res as LoginOk;
      persistSession(ok.accessToken, ok.refreshToken, email, ok.roles);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Sign-in failed. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(14,159,110,0.12), transparent 55%), linear-gradient(180deg, #FAF9F7, #EEF2F0)",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">ReWorth</h1>
          <p className="mt-2 text-[var(--rw-ink-muted)]">Operations sign-in</p>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-5 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-6 shadow-sm"
          noValidate
          suppressHydrationWarning
        >
          {!challengeToken ? (
            <>
              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
              <Input
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </>
          ) : (
            <Input
              label="Authenticator code"
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              disabled={loading}
              hint="Enter the code from your authenticator app."
              required
            />
          )}

          {error ? (
            <p className="text-sm text-[var(--rw-error)]" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={loading}
            aria-busy={loading ? true : undefined}
          >
            {loading
              ? "Please wait…"
              : challengeToken
                ? "Verify"
                : "Sign in"}
          </Button>

          {challengeToken ? (
            <button
              type="button"
              className="text-sm text-[var(--rw-ink-muted)] underline"
              onClick={() => {
                setChallengeToken(null);
                setTotp("");
              }}
            >
              Back to email / password
            </button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
