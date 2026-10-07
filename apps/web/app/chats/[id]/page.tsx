"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { nairaToKobo } from "@reworth/shared";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { OfferCard } from "../../../components/chat/OfferCard";
import { MakeOfferModal } from "../../../components/chat/MakeOfferModal";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  acceptOffer,
  blockUser,
  clientMsgId,
  counterOffer,
  createOffer,
  listConversations,
  listMessages,
  listOffers,
  markConversationRead,
  muteConversation,
  postMessage,
  rejectOffer,
  reportUser,
  unmuteConversation,
  withdrawOffer,
  type ChatMessage,
  type ConversationListItem,
  type OfferDto,
} from "../../../lib/chat";
import {
  joinConversation,
  mergeMessages,
  subscribeChat,
} from "../../../lib/chat-socket";
import type { MeResponse } from "../../../lib/types";

type ThreadItem =
  | { kind: "message"; key: string; at: string; message: ChatMessage }
  | { kind: "offer"; key: string; at: string; offer: OfferDto };

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params?.id;
  const router = useRouter();

  const [meId, setMeId] = useState<string | null>(null);
  const [meta, setMeta] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offers, setOffers] = useState<OfferDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [counterFor, setCounterFor] = useState<OfferDto | null>(null);
  const [counterNaira, setCounterNaira] = useState("");
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const liveRef = useRef(false);
  const [reloadAt, setReloadAt] = useState(0);
  const markedRead = useRef<string | null>(null);
  const meIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !conversationId) return;

    const [convos, msgs] = await Promise.all([
      listConversations(token),
      listMessages(token, conversationId, { limit: 100 }),
    ]);
    const found = convos.find((c) => c.id === conversationId) ?? null;
    setMeta(found);
    setMessages((prev) => mergeMessages(prev, msgs));

    if (found?.listingId) {
      try {
        const ofs = await listOffers(token, found.listingId);
        setOffers(
          ofs.filter(
            (o) =>
              o.conversationId === conversationId ||
              o.buyerId === found.buyerId,
          ),
        );
      } catch {
        /* offers optional for viewers */
      }
    }

    const uid = meIdRef.current;
    if (markedRead.current !== conversationId) {
      markedRead.current = conversationId;
      const unread = msgs
        .filter((m) => !m.readAt && (!uid || m.senderId !== uid))
        .map((m) => m.id);
      void markConversationRead(
        token,
        conversationId,
        unread.length ? unread : undefined,
      ).catch(() => undefined);
    }
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        router.replace("/");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const me = await apiFetch<MeResponse>("/me", { token });
        if (cancelled) return;
        meIdRef.current = me.id;
        setMeId(me.id);
        await refresh();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/");
          return;
        }
        setError(
          err instanceof ApiError && err.status === 429
            ? "This chat is busy for a moment. Trying again…"
            : err instanceof ApiError
              ? err.message
              : "Could not open chat",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per conversation
  }, [conversationId, router]);

  useEffect(() => {
    if (!error || !conversationId) return;
    const id = window.setTimeout(() => setReloadAt((n) => n + 1), 8000);
    return () => window.clearTimeout(id);
  }, [error, conversationId, reloadAt]);

  useEffect(() => {
    if (!reloadAt || !error) return;
    let cancelled = false;
    void refresh()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reloadAt, error, refresh]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !conversationId || loading || error) return;

    const gapFill = () => {
      const last = [...messagesRef.current]
        .reverse()
        .find((item) => !item.id.startsWith("temp-"));
      if (!last) return;
      void listMessages(token, conversationId, { after: last.id, limit: 100 })
        .then((rows) => setMessages((prev) => mergeMessages(prev, rows)))
        .catch(() => undefined);
    };

    const stop = subscribeChat(token, {
      onConnect: () => {
        void joinConversation(conversationId).then((ok) => {
          liveRef.current = ok;
          if (ok) gapFill();
        });
      },
      onDisconnect: () => {
        liveRef.current = false;
      },
      onMessage: (message) => {
        if (message.conversationId !== conversationId) return;
        setMessages((prev) => mergeMessages(prev, [message]));
        const uid = meIdRef.current;
        if (uid && message.senderId !== uid) {
          void markConversationRead(token, conversationId, [message.id]).catch(
            () => undefined,
          );
        }
      },
      onRead: (update) => {
        if (update.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((item) =>
            item.senderId !== update.readerId && !item.readAt
              ? { ...item, readAt: update.readAt }
              : item,
          ),
        );
      },
      onOffer: (offer) => {
        if (offer.conversationId !== conversationId) return;
        setOffers((prev) => {
          const index = prev.findIndex((item) => item.id === offer.id);
          if (index < 0) return [...prev, offer];
          const next = [...prev];
          next[index] = offer;
          return next;
        });
      },
    });

    const id = window.setInterval(() => {
      if (liveRef.current || document.visibilityState === "hidden") return;
      gapFill();
    }, 30000);

    return () => {
      liveRef.current = false;
      stop();
      window.clearInterval(id);
    };
  }, [conversationId, loading, error]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, offers]);

  const thread = useMemo(() => {
    const offerIdsInMessages = new Set(
      messages.filter((m) => m.offerId).map((m) => m.offerId as string),
    );
    const items: ThreadItem[] = messages.map((m) => ({
      kind: "message",
      key: `m-${m.id}`,
      at: m.createdAt,
      message: m,
    }));
    for (const o of offers) {
      if (offerIdsInMessages.has(o.id)) continue;
      items.push({
        kind: "offer",
        key: `o-${o.id}`,
        at: o.createdAt,
        offer: o,
      });
    }
    items.sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    return items;
  }, [messages, offers]);

  const offersById = useMemo(() => {
    const map = new Map<string, OfferDto>();
    for (const o of offers) map.set(o.id, o);
    return map;
  }, [offers]);

  async function sendText() {
    const token = getAccessToken();
    const text = draft.trim();
    if (!token || !conversationId || !text || !meId) return;
    setSending(true);
    const cid = clientMsgId();
    const optimistic: ChatMessage = {
      id: `temp-${cid}`,
      conversationId,
      senderId: meId,
      type: "TEXT",
      body: text,
      imageKey: null,
      offerId: null,
      listingCardId: null,
      clientMsgId: cid,
      deliveredAt: null,
      readAt: null,
      scamWarning: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      const saved = await postMessage(token, conversationId, {
        type: "TEXT",
        body: text,
        clientMsgId: cid,
      });
      setMessages((prev) =>
        prev.map((m) => (m.clientMsgId === cid ? saved : m)),
      );
      if (saved.scamWarning) {
        setToast({
          message: "Security tip: keep payments on ReWorth",
          tone: "warn",
        });
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.clientMsgId !== cid));
      setDraft(text);
      setToast({
        message: err instanceof ApiError ? err.message : "Send failed",
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  }

  async function submitOffer(amountKobo: number, note?: string) {
    const token = getAccessToken();
    if (!token || !meta) return;
    setOfferBusy(true);
    try {
      const offer = await createOffer(token, meta.listingId, {
        amountKobo,
        note,
        conversationId: meta.id,
      });
      setOffers((prev) => [offer, ...prev.filter((o) => o.id !== offer.id)]);
      setOfferOpen(false);
      setToast({ message: "Offer sent", tone: "success" });
      await refresh();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Offer failed",
        tone: "error",
      });
    } finally {
      setOfferBusy(false);
    }
  }

  async function runOfferAction(
    action: "accept" | "reject" | "withdraw",
    offer: OfferDto,
  ) {
    const token = getAccessToken();
    if (!token) return;
    setActionBusy(true);
    try {
      if (action === "accept") {
        const res = await acceptOffer(token, offer.id);
        setOffers((prev) =>
          prev.map((o) => (o.id === offer.id ? res.offer : o)),
        );
        const intentId = res.orderIntent?.id;
        // Buyer completes payment; seller stays in chat with toast.
        if (meId === offer.buyerId) {
          const q = new URLSearchParams({ listingId: offer.listingId });
          if (intentId) q.set("orderIntentId", intentId);
          else q.set("offerId", offer.id);
          router.push(`/checkout?${q.toString()}`);
          return;
        }
        setToast({
          message: intentId
            ? "Offer accepted — buyer can check out"
            : "Offer accepted — listing reserved",
          tone: "success",
        });
      } else if (action === "reject") {
        const updated = await rejectOffer(token, offer.id);
        setOffers((prev) =>
          prev.map((o) => (o.id === offer.id ? updated : o)),
        );
        setToast({ message: "Offer rejected", tone: "info" });
      } else {
        const updated = await withdrawOffer(token, offer.id);
        setOffers((prev) =>
          prev.map((o) => (o.id === offer.id ? updated : o)),
        );
        setToast({ message: "Offer withdrawn", tone: "info" });
      }
      await refresh();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Action failed",
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function submitCounter() {
    const token = getAccessToken();
    if (!token || !counterFor) return;
    const value = Number(counterNaira.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1) {
      setToast({ message: "Enter a counter amount", tone: "warn" });
      return;
    }
    setActionBusy(true);
    try {
      const child = await counterOffer(token, counterFor.id, {
        amountKobo: nairaToKobo(value),
      });
      setCounterFor(null);
      setCounterNaira("");
      setOffers((prev) => [child, ...prev]);
      setToast({ message: "Counter offer sent", tone: "success" });
      await refresh();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Counter failed",
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function doBlock() {
    const token = getAccessToken();
    if (!token || !meta) return;
    setSafetyBusy(true);
    try {
      await blockUser(token, meta.counterpart.id);
      setSafetyOpen(false);
      setToast({ message: "User blocked", tone: "success" });
      router.replace("/chats");
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Block failed",
        tone: "error",
      });
    } finally {
      setSafetyBusy(false);
    }
  }

  async function doReport() {
    const token = getAccessToken();
    if (!token || !meta) return;
    if (!reportReason.trim()) {
      setToast({ message: "Add a reason", tone: "warn" });
      return;
    }
    setSafetyBusy(true);
    try {
      await reportUser(token, meta.counterpart.id, {
        reason: reportReason.trim(),
        detail: reportDetail.trim() || undefined,
        conversationId: meta.id,
      });
      setSafetyOpen(false);
      setReportReason("");
      setReportDetail("");
      setToast({ message: "Report submitted", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Report failed",
        tone: "error",
      });
    } finally {
      setSafetyBusy(false);
    }
  }

  async function doMuteToggle() {
    const token = getAccessToken();
    if (!token || !meta) return;
    setSafetyBusy(true);
    try {
      if (meta.muted) {
        await unmuteConversation(token, meta.id);
        setMeta({ ...meta, muted: false });
        setToast({ message: "Unmuted", tone: "success" });
      } else {
        await muteConversation(token, meta.id);
        setMeta({ ...meta, muted: true, unreadCount: 0 });
        setToast({
          message: "Muted — badges suppressed for this chat",
          tone: "info",
        });
      }
      setSafetyOpen(false);
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Mute failed",
        tone: "error",
      });
    } finally {
      setSafetyBusy(false);
    }
  }

  function renderOffer(offer: OfferDto) {
    if (!meId) return null;
    return (
      <OfferCard
        offer={offer}
        meId={meId}
        busy={actionBusy}
        onAccept={() => void runOfferAction("accept", offer)}
        onReject={() => void runOfferAction("reject", offer)}
        onWithdraw={() => void runOfferAction("withdraw", offer)}
        onCounter={() => {
          setCounterFor(offer);
          setCounterNaira(String(Math.round(offer.amountKobo / 100)));
        }}
        onCheckout={() => {
          const q = new URLSearchParams({ listingId: offer.listingId });
          q.set("offerId", offer.id);
          router.push(`/checkout?${q.toString()}`);
        }}
      />
    );
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8">
        <div className="mx-auto max-w-lg space-y-3">
          <Skeleton className="h-10 w-2/3" label="Loading chat" />
          <Skeleton className="h-24 w-full" label="Loading messages" />
          <Skeleton className="h-24 w-3/4" label="Loading messages" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Chat unavailable"
          description={error}
          action={
            <Link href="/chats">
              <Button variant="primary">Back to chats</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Link
            href="/chats"
            className="text-sm font-semibold text-[var(--rw-accent)]"
          >
            Back
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {meta?.listingTitle ?? "Conversation"}
            </p>
            <p className="truncate text-sm text-[var(--rw-ink-muted)]">
              {meta?.counterpart.displayName ?? "Member"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSafetyOpen(true)}
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            Safety
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-4 pt-4">
        {thread.length === 0 ? (
          <EmptyState
            title="Say hello"
            description="Ask about condition, pickup, or send an offer."
            className="flex-1"
          />
        ) : (
          <ul className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
            {thread.map((item) => {
              if (item.kind === "offer") {
                return (
                  <li key={item.key} className="flex justify-center">
                    {renderOffer(item.offer)}
                  </li>
                );
              }
              const m = item.message;
              const mine = meId != null && m.senderId === meId;
              const linkedOffer =
                m.offerId && offersById.get(m.offerId)
                  ? offersById.get(m.offerId)!
                  : null;

              return (
                <li key={item.key} className="space-y-2">
                  {m.scamWarning ? (
                    <aside
                      role="alert"
                      className="rounded-[var(--rw-radius)] border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    >
                      Security warning: this message may ask for off-platform
                      payment. Keep deals on ReWorth.
                    </aside>
                  ) : null}
                  {m.type === "OFFER_CARD" && linkedOffer ? (
                    <div className={mine ? "flex justify-end" : "flex justify-start"}>
                      {renderOffer(linkedOffer)}
                    </div>
                  ) : m.type === "SYSTEM" ? (
                    <p className="text-center text-xs text-[var(--rw-ink-muted)]">
                      {m.body}
                    </p>
                  ) : (
                    <div
                      className={[
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        mine
                          ? "ml-auto bg-[var(--rw-accent)] text-white"
                          : "mr-auto border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]",
                      ].join(" ")}
                    >
                      {!mine && m.sender?.displayName ? (
                        <p className="mb-1 text-xs font-semibold opacity-70">
                          {m.sender.displayName}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  )}
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            placeholder="Message…"
            aria-label="Message"
            maxLength={4000}
            className="min-w-0 flex-1 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          />
          <Button
            variant="primary"
            size="sm"
            className="shrink-0"
            disabled={sending || !draft.trim()}
            onClick={() => void sendText()}
          >
            Send
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setOfferOpen(true)}
            disabled={!meta}
          >
            Make offer
          </Button>
        </div>
      </div>

      <MakeOfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        submitting={offerBusy}
        onSubmit={submitOffer}
      />

      <Modal
        open={Boolean(counterFor)}
        onClose={() => setCounterFor(null)}
        title="Counter offer"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Amount (₦)"
            inputMode="decimal"
            value={counterNaira}
            onChange={(e) => setCounterNaira(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={actionBusy}
            onClick={() => void submitCounter()}
          >
            {actionBusy ? "Sending…" : "Send counter"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        title="Block or report"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--rw-ink-muted)]">
            Mute suppresses badges and push stubs. Block stops new messages.
            Report flags the account for review.
          </p>
          <Input
            label="Report reason"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Scam, harassment…"
            maxLength={120}
          />
          <Input
            label="Details (optional)"
            value={reportDetail}
            onChange={(e) => setReportDetail(e.target.value)}
            maxLength={2000}
          />
          <Button
            variant="secondary"
            disabled={safetyBusy}
            onClick={() => void doReport()}
          >
            Report user
          </Button>
          <Button
            variant="secondary"
            disabled={safetyBusy}
            onClick={() => void doMuteToggle()}
          >
            {meta?.muted ? "Unmute conversation" : "Mute conversation"}
          </Button>
          <Button
            variant="danger"
            disabled={safetyBusy}
            onClick={() => void doBlock()}
          >
            Block user
          </Button>
        </div>
      </Modal>

      {toast ? (
        <div className="fixed bottom-28 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
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
