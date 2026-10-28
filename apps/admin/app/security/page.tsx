"use client";

import { FormEvent, useState } from "react";
import { Button, Input } from "@reworth/ui-web";
import { adminFetch, ApiError } from "../../lib/api";
import { PageHeader } from "../../components/AdminUi";

type SetupRes = { secret: string; otpauthUrl: string };

export default function SecurityPage() {
  const [setup, setSetup] = useState<SetupRes | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function beginSetup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<SetupRes>("/admin/auth/totp/setup", {
        method: "POST",
      });
      setSetup(res);
      setMessage("Scan the otpauth URL in your authenticator, then verify.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminFetch("/admin/auth/totp/verify", {
        method: "POST",
        body: { code: code.trim() },
      });
      setMessage("TOTP enabled. Future logins will require your authenticator.");
      setSetup(null);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verify failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Security"
        description="Enroll authenticator (TOTP) for this admin account."
      />
      {message ? (
        <p className="mb-4 text-sm text-[var(--rw-accent)]" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 text-sm text-[var(--rw-error)]" role="alert">
          {error}
        </p>
      ) : null}

      {!setup ? (
        <Button variant="primary" disabled={busy} onClick={() => void beginSetup()}>
          {busy ? "…" : "Set up TOTP"}
        </Button>
      ) : (
        <div className="space-y-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
          <p className="break-all text-xs text-[var(--rw-ink-muted)]">
            {setup.otpauthUrl}
          </p>
          <p className="font-mono text-sm">Secret: {setup.secret}</p>
          <form onSubmit={(e) => void verify(e)} className="space-y-3">
            <Input
              label="Authenticator code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : "Verify & enable"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
