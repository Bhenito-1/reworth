"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Chip,
  EmptyState,
  Input,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  addDisputeEvidence,
  disputeReasonLabel,
  disputeStatusLabel,
  getDispute,
  sellerRespondDispute,
  type DisputeDto,
} from "../../../lib/orders";
import type { MeResponse } from "../../../lib/types";

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const disputeId = params?.id;
  const router = useRouter();

  const [meId, setMeId] = useState<string | null>(null);
  const [dispute, setDispute] = useState<DisputeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [sellerText, setSellerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    if (!disputeId) return;
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [me, d] = await Promise.all([
        apiFetch<MeResponse>("/me", { token }),
        getDispute(token, disputeId),
      ]);
      setMeId(me.id);
      setDispute(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Dispute not found");
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [disputeId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitEvidence(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !disputeId) return;
    if (!evidenceText.trim() && !imageKey.trim()) {
      setToast({ message: "Add text or an image key", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      await addDisputeEvidence(token, disputeId, {
        text: evidenceText.trim() || undefined,
        imageKey: imageKey.trim() || undefined,
      });
      setEvidenceText("");
      setImageKey("");
      setToast({ message: "Evidence added", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not add evidence",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitSellerResponse(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !disputeId || !sellerText.trim()) return;
    setBusy(true);
    try {
      await sellerRespondDispute(token, disputeId, {
        text: sellerText.trim(),
      });
      setSellerText("");
      setToast({ message: "Response sent", tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Response failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    );
  }

  if (error || !dispute) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Dispute unavailable"
          description={error ?? "Not found"}
          action={
            <Link href="/orders">
              <Button variant="primary">Orders</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const isSeller = meId === dispute.order?.sellerId;
  const resolved = dispute.status === "RESOLVED";
  const canSellerRespond =
    isSeller &&
    !resolved &&
    !dispute.sellerResponse &&
    (dispute.status === "AWAITING_SELLER" || dispute.status === "OPENED");

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link
            href={`/orders/${dispute.orderId}`}
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Order
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dispute</h1>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              {disputeReasonLabel(String(dispute.reason))}
            </p>
          </div>
          <Chip selected className="pointer-events-none">
            {disputeStatusLabel(String(dispute.status))}
          </Chip>
        </div>

        {dispute.detail ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--rw-ink-muted)]">
            {dispute.detail}
          </p>
        ) : null}

        {(() => {
          const insp = dispute.inspection ?? dispute.linkedInspection;
          if (!insp) return null;
          return (
            <section
              className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
              aria-labelledby="dispute-inspection"
            >
              <h2 id="dispute-inspection" className="text-sm font-semibold">
                Linked inspection
              </h2>
              <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                Status: {insp.status ?? "—"}
                {insp.conditionScore != null
                  ? ` · Score ${insp.conditionScore}`
                  : ""}
              </p>
              {insp.completedAt ? (
                <time
                  className="mt-1 block text-xs text-[var(--rw-ink-muted)]"
                  dateTime={insp.completedAt}
                >
                  Completed{" "}
                  {new Date(insp.completedAt).toLocaleDateString("en-NG")}
                </time>
              ) : null}
            </section>
          );
        })()}

        {dispute.sellerResponse ? (
          <section className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
            <h2 className="text-sm font-semibold">Seller response</h2>
            <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
              {dispute.sellerResponse}
            </p>
          </section>
        ) : null}

        {resolved ? (
          <section className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/40 p-4">
            <h2 className="text-sm font-semibold text-[var(--rw-accent)]">
              Resolution
            </h2>
            <p className="mt-2 text-sm font-medium">
              {String(dispute.resolution ?? "Resolved").replace(/_/g, " ")}
            </p>
            {dispute.resolutionNote ? (
              <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                {dispute.resolutionNote}
              </p>
            ) : null}
            {dispute.resolvedAt ? (
              <time
                className="mt-2 block text-xs text-[var(--rw-ink-muted)]"
                dateTime={dispute.resolvedAt}
              >
                {new Date(dispute.resolvedAt).toLocaleString("en-NG")}
              </time>
            ) : null}
          </section>
        ) : null}

        <section className="mt-8" aria-labelledby="evidence-heading">
          <h2 id="evidence-heading" className="text-lg font-semibold">
            Evidence
          </h2>
          {!dispute.evidence?.length ? (
            <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
              No evidence yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {dispute.evidence.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-3 text-sm"
                >
                  {ev.text ? <p>{ev.text}</p> : null}
                  {ev.imageKey ? (
                    <p className="mt-1 font-mono text-xs text-[var(--rw-ink-muted)]">
                      imageKey: {ev.imageKey}
                    </p>
                  ) : null}
                  <time
                    className="mt-1 block text-xs text-[var(--rw-ink-muted)]"
                    dateTime={ev.createdAt}
                  >
                    {new Date(ev.createdAt).toLocaleString("en-NG")}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!resolved ? (
          <form
            className="mt-8 flex flex-col gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
            onSubmit={(e) => void submitEvidence(e)}
          >
            <h3 className="font-semibold">Add evidence</h3>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ev-text" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="ev-text"
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                rows={3}
                maxLength={4000}
                className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              />
            </div>
            <Input
              label="Image key (optional)"
              value={imageKey}
              onChange={(e) => setImageKey(e.target.value)}
              placeholder="media/…"
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "Saving…" : "Submit evidence"}
            </Button>
          </form>
        ) : null}

        {canSellerRespond ? (
          <form
            className="mt-6 flex flex-col gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
            onSubmit={(e) => void submitSellerResponse(e)}
          >
            <h3 className="font-semibold">Seller response</h3>
            <textarea
              value={sellerText}
              onChange={(e) => setSellerText(e.target.value)}
              rows={3}
              maxLength={4000}
              required
              className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              placeholder="Your response to the buyer…"
            />
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Sending…" : "Send response"}
            </Button>
          </form>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-8 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
          <Toast
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </main>
  );
}
