"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  getMyReferralCode,
  listMyReferrals,
  referralShareUrl,
  referralStatusLabel,
  whatsappShareHref,
  type MyReferralRow,
} from "../../lib/referrals";

export default function ReferralsPage() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [items, setItems] = useState<MyReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [codeRes, listRes] = await Promise.all([
        getMyReferralCode(token),
        listMyReferrals(token).catch(() => ({ items: [] as MyReferralRow[] })),
      ]);
      setCode(codeRes.code);
      const url =
        codeRes.shareUrl ||
        referralShareUrl(codeRes.code, window.location.origin);
      setShareUrl(url);
      setItems(listRes.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load referrals",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setToast({ message: "Code copied", tone: "success" });
    } catch {
      setToast({ message: "Could not copy", tone: "error" });
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast({ message: "Link copied", tone: "success" });
    } catch {
      setToast({ message: "Could not copy link", tone: "error" });
    }
  }

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

        <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Invite friends. Rewards are listing boost credits when they complete
          qualifying steps.
        </p>

        {loading ? (
          <div className="mt-8 space-y-4" aria-busy="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="mt-8">
            <EmptyState
              title="Couldn’t load referrals"
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
              aria-labelledby="ref-code"
            >
              <h2 id="ref-code" className="text-lg font-semibold">
                Your code
              </h2>
              <p className="mt-3 font-mono text-2xl font-semibold tracking-wide">
                {code ?? "—"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => void copyCode()}>
                  Copy code
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
                  Copy link
                </Button>
                {code ? (
                  <a
                    href={whatsappShareHref(code, shareUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-[var(--rw-radius)] border border-[var(--rw-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--rw-accent-muted)]"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="my-refs">
              <h2 id="my-refs" className="text-lg font-semibold">
                My Referrals
              </h2>
              {!items.length ? (
                <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                  No referrals yet — share your code to get started.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]">
                  {items.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {row.displayName ||
                            (row.referredUserId
                              ? `User ${row.referredUserId.slice(0, 8)}…`
                              : "Invitee")}
                        </p>
                        {row.registeredAt ? (
                          <time
                            className="text-xs text-[var(--rw-ink-muted)]"
                            dateTime={row.registeredAt}
                          >
                            {new Date(row.registeredAt).toLocaleDateString(
                              "en-NG",
                            )}
                          </time>
                        ) : null}
                      </div>
                      <span className="text-sm font-medium text-[var(--rw-accent)]">
                        {referralStatusLabel(
                          row.rewardStatus || row.status,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
