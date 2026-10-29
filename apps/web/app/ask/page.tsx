"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../components/discovery/DiscoveryListingCard";
import { ApiError } from "../../lib/api";
import {
  ASSISTANT_GROUNDING_BRIEF,
  confirmAssistantAction,
  createAssistantBundle,
  createAssistantSession,
  sendAssistantMessage,
  toolResultsFromMessage,
  toolResultsFromTurn,
} from "../../lib/assistant";
import { getAccessToken } from "../../lib/auth";
import type {
  AssistantMessage,
  AssistantToolBundleResult,
  AssistantToolMutationPending,
  AssistantToolResult,
  AssistantToolSearchResult,
  AssistantToolValuationResult,
} from "../../lib/types";

type ChatRow = {
  id: string;
  role: string;
  content: string;
  toolResults: AssistantToolResult[];
};

const SUGGESTIONS = [
  "Furnish a one-bed in Lekki with ₦1.5m",
  "Find a Samsung TV under ₦400k near VI",
  "What's a fair price for a used iPhone 13?",
];

function ToolResultsView({
  results,
  confirmingId,
  savingBundle,
  onConfirm,
  onSaveBundle,
}: {
  results: AssistantToolResult[];
  confirmingId: string | null;
  savingBundle: boolean;
  onConfirm: (pending: AssistantToolMutationPending) => void;
  onSaveBundle: (bundle: AssistantToolBundleResult) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      {results.map((r, idx) => {
        if (r.type === "search") {
          const search = r as AssistantToolSearchResult;
          const listings = search.listings ?? [];
          if (!listings.length) {
            return (
              <p key={idx} className="text-sm text-[var(--rw-ink-muted)]">
                No matching listings.
              </p>
            );
          }
          return (
            <ul
              key={idx}
              className="flex flex-wrap gap-3"
              aria-label="Search results"
            >
              {listings.slice(0, 6).map((listing) => (
                <li key={listing.id} className="w-44 shrink-0">
                  <DiscoveryListingCard listing={listing} />
                </li>
              ))}
            </ul>
          );
        }

        if (r.type === "bundle") {
          const bundle = r as AssistantToolBundleResult;
          return (
            <article
              key={idx}
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
              aria-label="Budget bundle"
            >
              <h3 className="font-semibold tracking-tight">{bundle.brief}</h3>
              <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                Combined{" "}
                <span className="font-semibold text-[var(--rw-ink)]">
                  {formatNgn({ amountKobo: bundle.totalKobo })}
                </span>
                {" · "}budget {formatNgn({ amountKobo: bundle.budgetKobo })}
              </p>
              <ul className="mt-3 flex flex-wrap gap-3">
                {(bundle.listings ?? []).map((listing) => (
                  <li key={listing.id} className="w-44 shrink-0">
                    <DiscoveryListingCard listing={listing} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {bundle.shareToken ? (
                  <Link href={`/ask/bundles/${bundle.shareToken}`}>
                    <Button variant="secondary" size="sm">
                      Open share link
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={savingBundle}
                    onClick={() => onSaveBundle(bundle)}
                  >
                    {savingBundle ? "Saving…" : "Save & share bundle"}
                  </Button>
                )}
              </div>
            </article>
          );
        }

        if (r.type === "valuation") {
          const val = r as AssistantToolValuationResult;
          const card = val.result;
          return (
            <article
              key={idx}
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/25 bg-[var(--rw-accent-muted)]/40 p-4"
              aria-label="Valuation estimate"
            >
              <h3 className="text-sm font-semibold text-[var(--rw-accent)]">
                What&apos;s it worth
              </h3>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatNgn({ amountKobo: card.recommendedKobo })}
              </p>
              <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                Range {formatNgn({ amountKobo: card.estimatedLowKobo })} –{" "}
                {formatNgn({ amountKobo: card.estimatedHighKobo })}
                {card.confidenceLabel ? ` · ${card.confidenceLabel}` : ""}
              </p>
              <Link href="/worth" className="mt-3 inline-block">
                <Button variant="secondary" size="sm">
                  Open Worth tool
                </Button>
              </Link>
            </article>
          );
        }

        if (r.type === "mutation_pending") {
          const pending = r as AssistantToolMutationPending;
          return (
            <div
              key={idx}
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
            >
              <p className="text-sm font-medium">{pending.summary}</p>
              <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                Confirm to run {pending.toolName} (ADR-006).
              </p>
              <Button
                className="mt-3"
                variant="primary"
                size="sm"
                disabled={confirmingId === pending.confirmToken}
                onClick={() => onConfirm(pending)}
              >
                {confirmingId === pending.confirmToken
                  ? "Confirming…"
                  : "Confirm"}
              </Button>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

export default function AskReWorthPage() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [savingBundle, setSavingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const bootstrap = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await createAssistantSession(token, {
        city: "Lagos",
        title: "Ask ReWorth",
      });
      setSessionId(session.id);
      setRows([
        {
          id: "welcome",
          role: "ASSISTANT",
          content:
            "Ask me to shop a budget, find Lagos listings, or estimate what something is worth. I won’t move money or publish without your confirm.",
          toolResults: [],
        },
      ]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start Ask ReWorth",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rows, sending]);

  function messageToRow(msg: AssistantMessage): ChatRow {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolResults: toolResultsFromMessage(msg),
    };
  }

  async function onSend(e?: FormEvent, preset?: string) {
    e?.preventDefault();
    const token = getAccessToken();
    if (!token || !sessionId) return;
    const content = (preset ?? input).trim();
    if (!content) return;

    setSending(true);
    setError(null);
    setInput("");
    const optimisticId = `local-${Date.now()}`;
    setRows((prev) => [
      ...prev,
      { id: optimisticId, role: "USER", content, toolResults: [] },
    ]);

    try {
      const res = await sendAssistantMessage(token, sessionId, content);
      const toolResults = toolResultsFromTurn({
        toolName: res.toolName,
        payload: res.payload,
        proposal: res.proposal,
      });
      setRows((prev) => {
        const withoutOptimistic = prev.filter((r) => r.id !== optimisticId);
        return [
          ...withoutOptimistic,
          {
            id: `user-${res.message.id}`,
            role: "USER",
            content,
            toolResults: [],
          },
          {
            ...messageToRow(res.message),
            toolResults:
              toolResults.length > 0
                ? toolResults
                : messageToRow(res.message).toolResults,
          },
        ];
      });
    } catch (err) {
      setRows((prev) => prev.filter((r) => r.id !== optimisticId));
      setError(
        err instanceof ApiError ? err.message : "Could not send message",
      );
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  async function onConfirm(pending: AssistantToolMutationPending) {
    const token = getAccessToken();
    if (!token || !sessionId) return;
    setConfirmingId(pending.confirmToken);
    try {
      const res = await confirmAssistantAction(
        token,
        sessionId,
        pending.confirmToken,
      );
      setRows((prev) => [
        ...prev,
        {
          ...messageToRow(res.message),
          toolResults: toolResultsFromTurn({
            toolName: res.toolName,
            payload: res.payload,
            proposal: res.proposal,
          }),
        },
      ]);
      setToast({
        message: res.confirmed ? "Confirmed" : res.message.content,
        tone: "success",
      });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Confirm failed",
        tone: "error",
      });
    } finally {
      setConfirmingId(null);
    }
  }

  async function onSaveBundle(bundle: AssistantToolBundleResult) {
    const token = getAccessToken();
    if (!token) return;
    setSavingBundle(true);
    try {
      const saved = await createAssistantBundle(token, {
        brief: bundle.brief.slice(0, 500),
        budgetKobo: bundle.budgetKobo,
        city: "Lagos",
      });
      setToast({ message: "Bundle saved", tone: "success" });
      if (saved.shareToken) {
        router.push(`/ask/bundles/${saved.shareToken}`);
      }
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not save bundle",
        tone: "error",
      });
    } finally {
      setSavingBundle(false);
    }
  }

  return (
    <main className="relative flex h-[calc(100dvh-var(--rw-nav-offset,3.5rem))] w-full max-w-full flex-col overflow-hidden bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32vh]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 80% 0%, rgba(14,159,110,0.14), transparent 60%), linear-gradient(180deg, #F3F0EA 0%, var(--rw-bg) 100%)",
        }}
      />

      <header className="relative z-10 border-b border-[var(--rw-border)]/70 bg-[var(--rw-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">Ask ReWorth</h1>
          <Link
            href="/worth"
            className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
          >
            Worth
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-6 sm:px-6">
        <p className="sr-only">{ASSISTANT_GROUNDING_BRIEF}</p>
        <p className="mb-4 text-sm text-[var(--rw-ink-muted)]">
          Lagos shopping assistant — bundles, search, and estimates. Mutations
          need your confirm.
        </p>

        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-3/4" />
          </div>
        ) : error && rows.length === 0 ? (
          <EmptyState
            title="Couldn’t start chat"
            description={error}
            action={
              <Button variant="secondary" onClick={() => void bootstrap()}>
                Retry
              </Button>
            }
          />
        ) : (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {rows.map((row) => {
              const isUser = row.role === "USER";
              return (
                <div
                  key={row.id}
                  className={[
                    "min-w-0 max-w-[92%] break-words rounded-[var(--rw-radius-lg)] px-4 py-3 text-sm sm:max-w-[85%]",
                    isUser
                      ? "ml-auto bg-[var(--rw-accent)] text-white"
                      : "mr-auto border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95",
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {row.content}
                  </p>
                  {!isUser && row.toolResults.length > 0 ? (
                    <ToolResultsView
                      results={row.toolResults}
                      confirmingId={confirmingId}
                      savingBundle={savingBundle}
                      onConfirm={(p) => void onConfirm(p)}
                      onSaveBundle={(b) => void onSaveBundle(b)}
                    />
                  ) : null}
                </div>
              );
            })}
            {sending ? (
              <p className="text-sm text-[var(--rw-ink-muted)]" aria-live="polite">
                Thinking…
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-[var(--rw-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}

        {!loading && rows.length <= 1 ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={sending || !sessionId}
                  onClick={() => void onSend(undefined, s)}
                  className="rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-1.5 text-left text-xs font-medium text-[var(--rw-ink-muted)] hover:border-[var(--rw-accent)] hover:text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] disabled:opacity-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <form
          onSubmit={(e) => void onSend(e)}
          className="mt-4 flex min-w-0 items-end gap-2 border-t border-[var(--rw-border)]/60 pt-4"
        >
          <label htmlFor="ask-input" className="sr-only">
            Message Ask ReWorth
          </label>
          <textarea
            id="ask-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            placeholder="e.g. Furnish a one-bed with ₦1.5m…"
            disabled={sending || !sessionId}
            className="min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="primary"
            className="shrink-0"
            disabled={sending || !sessionId || !input.trim()}
          >
            Send
          </Button>
        </form>
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
