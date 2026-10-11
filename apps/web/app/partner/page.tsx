"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { sentenceCaseLabel } from "../../lib/listings";
import { getAccessToken } from "../../lib/auth";
import {
  decidePartnerMembership,
  getPartnerKpis,
  getStoredPartnerKey,
  listPartnerMembershipQueue,
  setStoredPartnerKey,
  type PartnerKpis,
  type PartnerMembership,
} from "../../lib/partner";

export default function PartnerConsolePage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<PartnerKpis | null>(null);
  const [queue, setQueue] = useState<PartnerMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [usingKey, setUsingKey] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    const partnerKey = getStoredPartnerKey();
    if (!token && !partnerKey) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    setUsingKey(Boolean(partnerKey));
    try {
      const [kpiRes, memRes] = await Promise.all([
        getPartnerKpis(token, partnerKey),
        listPartnerMembershipQueue(token, partnerKey, "INVITED"),
      ]);
      setKpis(kpiRes);
      setQueue(memRes);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load partner console",
      );
      setKpis(null);
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSaveKey(e: FormEvent) {
    e.preventDefault();
    const key = apiKeyDraft.trim();
    if (!key) {
      setToast({ message: "Paste a partner API key", tone: "warn" });
      return;
    }
    setStoredPartnerKey(key);
    setApiKeyDraft("");
    setToast({
      message: "API key stored in this browser session only",
      tone: "success",
    });
    void load();
  }

  function clearKey() {
    setStoredPartnerKey(null);
    setUsingKey(false);
    setToast({ message: "Partner API key cleared", tone: "info" });
    void load();
  }

  async function decide(id: string, action: "approve" | "reject") {
    const token = getAccessToken();
    const partnerKey = getStoredPartnerKey();
    setBusyId(id);
    try {
      await decidePartnerMembership(id, action, token, partnerKey);
      setToast({
        message: action === "approve" ? "Member approved" : "Request rejected",
        tone: "success",
      });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : `${action} failed`,
        tone: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  const kpiCards: { label: string; value: string | number }[] = [
    { label: "Members", value: kpis?.members ?? "—" },
    { label: "Pending", value: kpis?.pending ?? "—" },
    { label: "Live listings", value: kpis?.liveListings ?? "—" },
    { label: "Joins (7d)", value: kpis?.joins7d ?? "—" },
  ];

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

        <h1 className="text-2xl font-semibold tracking-tight">
          Partner console
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Estate marketplace KPIs and membership queue. Sign in as a community
          manager, or attach a partner API key for this browser session.
        </p>

        <aside
          className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 text-sm"
          aria-labelledby="partner-auth-note"
        >
          <h2 id="partner-auth-note" className="font-semibold">
            Session note
          </h2>
          <p className="mt-2 text-[var(--rw-ink-muted)]">
            Prefer your ReWorth JWT (CommunityManager). Machine integrations use
            header <code className="text-xs">x-reworth-partner-key</code>. Keys
            pasted here stay in sessionStorage only — never localStorage — and
            clear when the tab closes.
          </p>
          <form
            onSubmit={onSaveKey}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Input
                label="Partner API key (optional)"
                type="password"
                autoComplete="off"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                hint={usingKey ? "A key is active for this session" : undefined}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" size="sm">
                Use key
              </Button>
              {usingKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearKey}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </form>
        </aside>

        {loading ? (
          <div className="mt-8 space-y-4" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="mt-8">
            <EmptyState
              title="Couldn’t load partner console"
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
            <section aria-labelledby="partner-kpis">
              <h2 id="partner-kpis" className="text-lg font-semibold">
                KPIs
                {kpis?.communityName || kpis?.companyName ? (
                  <span className="ml-2 text-sm font-normal text-[var(--rw-ink-muted)]">
                    · {String(kpis.communityName || kpis.companyName)}
                  </span>
                ) : null}
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {kpiCards.map((c) => (
                  <li
                    key={c.label}
                    className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-3"
                  >
                    <p className="text-xs text-[var(--rw-ink-muted)]">
                      {c.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {c.value}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="partner-queue">
              <div className="flex items-center justify-between gap-3">
                <h2 id="partner-queue" className="text-lg font-semibold">
                  Membership queue
                </h2>
                <Button variant="ghost" size="sm" onClick={() => void load()}>
                  Refresh
                </Button>
              </div>
              {!queue.length ? (
                <EmptyState
                  title="No pending requests"
                  description="New join requests appear here for approval."
                />
              ) : (
                <ul className="mt-4 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)]">
                  {queue.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {m.displayName || m.phoneMasked || m.userId?.slice(0, 8) || "Member"}
                        </p>
                        <p className="text-sm text-[var(--rw-ink-muted)]">
                          {sentenceCaseLabel(m.status)}
                          {m.createdAt
                            ? ` · ${new Date(m.createdAt).toLocaleDateString("en-NG")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busyId === m.id}
                          onClick={() => void decide(m.id, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === m.id}
                          onClick={() => void decide(m.id, "reject")}
                        >
                          Reject
                        </Button>
                      </div>
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
