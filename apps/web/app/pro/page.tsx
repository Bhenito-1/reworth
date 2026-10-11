"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { sentenceCaseLabel } from "../../lib/listings";
import { getAccessToken } from "../../lib/auth";
import {
  applyPro,
  bulkUploadErrors,
  getMyProAccount,
  storefrontPath,
  subscribePro,
  uploadProBulkCsv,
  type BulkUploadJob,
  type ProAccount,
} from "../../lib/pro";

export default function ProSellerPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [account, setAccount] = useState<ProAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [handle, setHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadJob, setUploadJob] = useState<BulkUploadJob | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const me = await getMyProAccount(token);
      setAccount(me);
      if (me?.businessName) setBusinessName(me.businessName);
      if (me?.handle) setHandle(me.handle);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load pro status");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onApply(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    if (!businessName.trim()) {
      setToast({ message: "Business name is required", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const res = await applyPro(token, {
        businessName: businessName.trim(),
        handle: handle.trim() || undefined,
        applicationNotes: notes.trim() || undefined,
      });
      setAccount(res);
      setToast({ message: "Application submitted", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Apply failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onSubscribe() {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await subscribePro(token);
      setAccount(res);
      setToast({ message: "Subscription started", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Subscribe failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onCsvSelected(file: File | undefined) {
    if (!file) return;
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    setUploadJob(null);
    try {
      const job = await uploadProBulkCsv(token, file);
      setUploadJob(job);
      const errs = bulkUploadErrors(job);
      setToast({
        message:
          errs.length > 0
            ? `Upload finished with ${errs.length} row error(s)`
            : `Uploaded — ${job.successCount ?? 0} row(s) ok`,
        tone: errs.length ? "warn" : "success",
      });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "CSV upload failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const canBulk =
    account &&
    ["APPROVED", "ACTIVE", "GRACE"].includes(String(account.status));
  const uploadErrors = uploadJob ? bulkUploadErrors(uploadJob) : [];

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/account"
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Account
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        <h1 className="text-2xl font-semibold tracking-tight">Pro seller</h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Business profile, bulk listing tools, and subscription.
        </p>

        {loading ? (
          <div className="mt-8 space-y-4" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="mt-8">
            <EmptyState
              title="Couldn’t load Pro status"
              description={error}
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            <section
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5"
              aria-labelledby="pro-status"
            >
              <h2 id="pro-status" className="text-lg font-semibold">
                Status
              </h2>
              {account ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="text-[var(--rw-ink-muted)]">Account · </span>
                    <span className="font-medium">
                      {sentenceCaseLabel(account.status)}
                    </span>
                  </p>
                  {account.subscriptionStatus ? (
                    <p>
                      <span className="text-[var(--rw-ink-muted)]">
                        Subscription ·{" "}
                      </span>
                      <span className="font-medium">
                        {account.subscriptionStatus}
                      </span>
                    </p>
                  ) : null}
                  {account.handle ? (
                    <p>
                      <Link
                        href={storefrontPath(account.handle)}
                        className="font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
                      >
                        View storefront /u/{account.handle}
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                  You have not applied yet.
                </p>
              )}
            </section>

            {!account || account.status === "REJECTED" ? (
              <section aria-labelledby="pro-apply">
                <h2 id="pro-apply" className="text-lg font-semibold">
                  Apply
                </h2>
                <form
                  onSubmit={onApply}
                  className="mt-4 flex flex-col gap-4"
                  noValidate
                >
                  <Input
                    label="Business name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <Input
                    label="Storefront handle"
                    value={handle}
                    onChange={(e) =>
                      setHandle(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))
                    }
                    hint="Public URL: /u/your-handle"
                    disabled={busy}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pro-notes" className="text-sm font-medium">
                      Notes (optional)
                    </label>
                    <textarea
                      id="pro-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      disabled={busy}
                      className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {busy ? "Submitting…" : "Submit application"}
                  </Button>
                </form>
              </section>
            ) : null}

            {canBulk ? (
              <>
                <section aria-labelledby="pro-bulk">
                  <h2 id="pro-bulk" className="text-lg font-semibold">
                    Bulk CSV upload
                  </h2>
                  <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                    Upload a CSV of listings. Row errors appear below.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-4 block w-full text-sm"
                    disabled={busy}
                    onChange={(e) =>
                      void onCsvSelected(e.target.files?.[0] ?? undefined)
                    }
                  />
                  {uploadJob ? (
                    <div className="mt-4 rounded-[var(--rw-radius)] border border-[var(--rw-border)] p-4 text-sm">
                      <p>
                        Job {uploadJob.id.slice(0, 8)}… ·{" "}
                        {sentenceCaseLabel(uploadJob.status)} ·{" "}
                        {uploadJob.successCount ?? 0} ok /{" "}
                        {uploadJob.errorCount ?? uploadErrors.length} errors
                      </p>
                      {uploadErrors.length ? (
                        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                          {uploadErrors.map((err, i) => (
                            <li
                              key={`${err.row ?? err.line ?? i}-${err.message}`}
                              className="text-[var(--rw-error)]"
                            >
                              Row {err.row ?? err.line ?? "?"}
                              {err.field ? ` · ${err.field}` : ""}: {err.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section aria-labelledby="pro-sub">
                  <h2 id="pro-sub" className="text-lg font-semibold">
                    Subscription
                  </h2>
                  <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                    Optional Pro subscription for boosts and bulk tools.
                  </p>
                  <Button
                    className="mt-4"
                    variant="primary"
                    disabled={busy}
                    onClick={() => void onSubscribe()}
                  >
                    Subscribe
                  </Button>
                </section>
              </>
            ) : null}
          </div>
        )}
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </main>
  );
}
