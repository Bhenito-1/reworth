"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatNgn, nairaToKobo } from "@reworth/shared";
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
  unblockUser,
  clientMsgId,
  counterOffer,
  createOffer,
  listConversations,
  listMessages,
  listOffers,
  markConversationRead,
  meetupMapsUrl,
  muteConversation,
  parseMeetupPin,
  postMeetupPin,
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
import {
  acceptSwapProposal,
  cancelSwapProposal,
  parseSwapProposalCard,
  rejectSwapProposal,
} from "../../../lib/swap";

type OfferNotice = {
  message?: string;
  tone?: "info" | "success" | "warn" | "error";
  durationMs?: number;
};

/** Survives React strict mode remounting, which would otherwise drop the notice. */
let queuedOfferNotice: OfferNotice | null | undefined;

function formatDeliveryDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function consumeOfferNotice(): OfferNotice | null {
  if (typeof window === "undefined") return null;
  if (queuedOfferNotice !== undefined) return queuedOfferNotice;
  try {
    const raw = sessionStorage.getItem("reworth:offer-notice");
    sessionStorage.removeItem("reworth:offer-notice");
    if (!raw) {
      queuedOfferNotice = null;
      return null;
    }
    const notice = JSON.parse(raw) as OfferNotice;
    queuedOfferNotice = notice.message ? notice : null;
  } catch {
    sessionStorage.removeItem("reworth:offer-notice");
    queuedOfferNotice = null;
  }
  return queuedOfferNotice ?? null;
}

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
  const [pinOpen, setPinOpen] = useState(false);
  const [pinLabel, setPinLabel] = useState("Meetup point");
  const [pinLat, setPinLat] = useState("6.4474");
  const [pinLng, setPinLng] = useState("3.4721");
  const [pinBusy, setPinBusy] = useState(false);
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
    durationMs?: number;
  } | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
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
    const notice = consumeOfferNotice();
    if (notice?.message) {
      setToast({
        message: notice.message,
        tone: notice.tone,
        durationMs: notice.durationMs,
      });
    }
    const clearQueue = window.setTimeout(() => {
      queuedOfferNotice = undefined;
    }, 0);
    return () => window.clearTimeout(clearQueue);
  }, []);

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
    const scroller = threadRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages, offers]);

  const thread = useMemo(() => {
    const cutoff = meta?.deletedAt ? new Date(meta.deletedAt).getTime() : 0;
    const visibleMessages = cutoff
      ? messages.filter((message) => new Date(message.createdAt).getTime() > cutoff)
      : messages;
    const visibleOffers = cutoff
      ? offers.filter((offer) => new Date(offer.createdAt).getTime() > cutoff)
      : offers;
    const offerIdsInMessages = new Set(
      visibleMessages.filter((m) => m.offerId).map((m) => m.offerId as string),
    );
    const items: ThreadItem[] = visibleMessages.map((m) => ({
      kind: "message",
      key: `m-${m.id}`,
      at: m.createdAt,
      message: m,
    }));
    for (const o of visibleOffers) {
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
  }, [messages, offers, meta?.deletedAt]);

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

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setToast({ message: "Geolocation not available in this browser", tone: "warn" });
      return;
    }
    setPinBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPinLat(String(pos.coords.latitude));
        setPinLng(String(pos.coords.longitude));
        setPinBusy(false);
        setToast({ message: "Location filled from GPS", tone: "success" });
      },
      () => {
        setPinBusy(false);
        setToast({ message: "Could not get location permission", tone: "error" });
      },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  }

  async function shareMeetupPin() {
    const token = getAccessToken();
    if (!token || !conversationId) return;
    const lat = Number(pinLat);
    const lng = Number(pinLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setToast({ message: "Enter valid lat/lng", tone: "warn" });
      return;
    }
    setPinBusy(true);
    try {
      const saved = await postMeetupPin(token, conversationId, {
        lat,
        lng,
        label: pinLabel.trim() || "Meetup point",
        clientMsgId: clientMsgId(),
      });
      setMessages((prev) => [...prev, saved]);
      setPinOpen(false);
      setToast({ message: "Meetup pin shared", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not share pin",
        tone: "error",
      });
    } finally {
      setPinBusy(false);
    }
  }

  async function submitOffer(amountKobo: number, note?: string) {
    const token = getAccessToken();
    if (!token || !meta) return;
    const amountLabel = formatNgn({ amountKobo });
    const item = meta.listingTitle?.trim() || "this item";
    setOfferBusy(true);
    try {
      const offer = await createOffer(token, meta.listingId, {
        amountKobo,
        note,
        conversationId: meta.id,
      });
      setOffers((prev) => [offer, ...prev.filter((o) => o.id !== offer.id)]);
      setToast({
        message: `Offer of ${amountLabel} sent for ${item}. The seller can accept, decline, or counter it.`,
        tone: "success",
      });
      await refresh();
    } catch (err) {
      const reason =
        err instanceof ApiError ? err.message : "Something went wrong. Try again.";
      setToast({
        message: `Your offer of ${amountLabel} for ${item} was not sent. ${reason}`,
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
      setMeta({ ...meta, blockedByMe: true });
      setSafetyOpen(false);
      setToast({ message: "User blocked", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Block failed",
        tone: "error",
      });
    } finally {
      setSafetyBusy(false);
    }
  }

  async function doUnblock() {
    const token = getAccessToken();
    if (!token || !meta) return;
    setSafetyBusy(true);
    try {
      await unblockUser(token, meta.counterpart.id);
      setMeta({ ...meta, blockedByMe: false });
      setSafetyOpen(false);
      setToast({ message: "User unblocked", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Unblock failed",
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

  async function runSwapAction(
    action: "accept" | "reject" | "cancel",
    proposalId: string,
  ) {
    const token = getAccessToken();
    if (!token) return;
    setActionBusy(true);
    try {
      if (action === "accept") {
        const res = (await acceptSwapProposal(token, proposalId)) as {
          orders?: { id: string; payerId: string }[];
        };
        const mine = res.orders?.find((order) => order.payerId === meId);
        setToast({
          message:
            "Swap accepted. Open the order to pay the delivery fee and the ₦500 swap fee.",
          tone: "success",
        });
        await refresh();
        if (mine) router.push(`/orders/${mine.id}`);
        return;
      }
      if (action === "cancel") {
        await cancelSwapProposal(token, proposalId);
        setToast({ message: "Swap cancelled", tone: "info" });
      } else {
        await rejectSwapProposal(token, proposalId);
        setToast({ message: "Swap rejected", tone: "info" });
      }
      await refresh();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Swap action failed",
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  function renderSwapProposal(body: string | null) {
    const parsed = parseSwapProposalCard(body);
    const isListingSeller = Boolean(meta && meId === meta.sellerId);
    const accepted = parsed?.kind === "swap-accepted";
    const rejected = parsed?.kind === "swap-rejected";
    const cancelled = parsed?.kind === "swap-cancelled";
    const closed = accepted || rejected || cancelled;
    const settled = Boolean(
      parsed &&
        !closed &&
        messages.some((message) => {
          const later = parseSwapProposalCard(message.body);
          return (
            later?.swapProposalId === parsed.swapProposalId &&
            (later.kind === "swap-accepted" ||
              later.kind === "swap-rejected" ||
              later.kind === "swap-cancelled")
          );
        }),
    );
    if (settled) return null;
    const mineOrder = parsed?.orders.find((order) => order.payerId === meId);
    return (
      <div className="w-full min-w-0 max-w-sm rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
        {accepted ? (
          <p className="text-[13px] font-semibold leading-5 text-[var(--rw-ink-muted)]">
            Swap order
          </p>
        ) : null}
        <p className={`${closed ? "mt-1 " : ""}text-[17px] font-semibold leading-6`}>
          {accepted
            ? "Swap accepted"
            : rejected
              ? "Swap rejected"
              : cancelled
                ? "Swap cancelled"
                : parsed?.title || "Swap proposal"}
        </p>
        {!accepted && parsed?.description ? (
          <p className="mt-2 text-[15px] leading-6 text-[var(--rw-ink-muted)]">
            {parsed.description}
          </p>
        ) : null}
        {parsed && parsed.imageUrls.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {parsed.imageUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt="Swap photo"
                className="h-24 w-24 shrink-0 rounded-xl object-cover"
              />
            ))}
          </div>
        ) : null}
        {accepted && mineOrder?.receive && mineOrder.send ? (
          <div className="mt-3 space-y-2">
            {[
              ["You send", mineOrder.send],
              ["You receive", mineOrder.receive],
            ].map(([label, item]) => {
              const side = item as { title: string; imageUrl?: string | null };
              return (
                <div key={String(label)} className="flex items-center gap-3">
                  {side.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={side.imageUrl}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-[var(--rw-border)]" />
                  )}
                  <div>
                    <p className="text-xs text-[var(--rw-ink-muted)]">{String(label)}</p>
                    <p className="text-[15px] font-semibold leading-5">{side.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {parsed?.deliveryOn ? (
          <p className="mt-3 text-sm font-semibold">
            Delivery day · {formatDeliveryDay(parsed.deliveryOn)}
          </p>
        ) : null}
        <p className="mt-2 text-[15px] leading-6 text-[var(--rw-ink-muted)]">
          {accepted
            ? "This is now an order for both of you. Each person pays the delivery fee and a ₦500 swap fee. Cancel it from the order, before either of you pays."
            : rejected
              ? "This proposal was rejected."
              : cancelled
                ? "This proposal was cancelled. The listing is back on the marketplace."
                : "If they accept, both of you get an order. Each person pays the delivery fee and a ₦500 swap fee."}
        </p>
        {parsed && !closed && isListingSeller ? (
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={actionBusy}
              onClick={() => void runSwapAction("accept", parsed.swapProposalId)}
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={actionBusy}
              onClick={() => void runSwapAction("reject", parsed.swapProposalId)}
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={actionBusy}
              onClick={() => void runSwapAction("cancel", parsed.swapProposalId)}
            >
              Cancel swap
            </Button>
          </div>
        ) : parsed && !closed ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[var(--rw-ink-muted)]">Waiting for them to accept</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={actionBusy}
              onClick={() => void runSwapAction("cancel", parsed.swapProposalId)}
            >
              Cancel swap
            </Button>
          </div>
        ) : !parsed ? (
          <p className="mt-3 text-[var(--rw-ink-muted)]">Swap proposal</p>
        ) : null}
      </div>
    );
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
    <main className="flex h-[calc(100dvh-var(--rw-nav-offset,3.5rem))] w-full max-w-full flex-col overflow-hidden bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <header className="z-20 shrink-0 border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 backdrop-blur-md">
        <div className="relative mx-auto flex min-h-12 w-full min-w-0 max-w-lg items-center px-4 py-3 sm:px-8">
          <Link
            href="/chats"
            className="relative z-10 text-sm font-semibold text-[var(--rw-accent)]"
          >
            Back
          </Link>
          <div className="pointer-events-none absolute inset-x-20 text-center">
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
            className="relative z-10 ml-auto text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            Safety
          </button>
        </div>
      </header>

      <div
        ref={threadRef}
        className="mx-auto flex min-h-0 w-full min-w-0 max-w-lg flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8"
      >
        {thread.length === 0 ? (
          <EmptyState
            title="Say hello"
            description="Ask about condition, delivery, or send an offer."
            className="flex-1"
          />
        ) : (
          <ul className="flex w-full min-w-0 flex-col gap-3 pb-4">
            {thread.map((item) => {
              if (item.kind === "offer") {
                return (
                  <li key={item.key} className="flex min-w-0 justify-center">
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
                <li key={item.key} className="min-w-0 space-y-2">
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
                    <div className={mine ? "flex min-w-0 justify-end" : "flex min-w-0 justify-start"}>
                      {renderOffer(linkedOffer)}
                    </div>
                  ) : m.type === "SWAP_PROPOSAL_CARD" ? (
                    <div className={mine ? "flex min-w-0 justify-end" : "flex min-w-0 justify-start"}>
                      {renderSwapProposal(m.body)}
                    </div>
                  ) : m.type === "SYSTEM" && parseMeetupPin(m.body) ? (
                    (() => {
                      const pin = parseMeetupPin(m.body)!;
                      return (
                        <a
                          href={meetupMapsUrl(pin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mx-auto block max-w-[85%] rounded-[var(--rw-radius)] border border-[var(--rw-accent)] bg-[var(--rw-beige,#F2E7D5)] px-3.5 py-3 text-left no-underline"
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-accent)]">
                            Meetup pin
                          </p>
                          <p className="mt-1 text-sm font-medium text-[var(--rw-ink)]">
                            {pin.label}
                          </p>
                          <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                            Private to this chat · Open in Maps
                          </p>
                        </a>
                      );
                    })()
                  ) : m.type === "SYSTEM" ? (
                    <p className="text-center text-xs text-[var(--rw-ink-muted)]">
                      {m.body}
                    </p>
                  ) : (
                    <div
                      className={[
                        "max-w-[85%] min-w-0 break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
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
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="z-20 w-full min-w-0 shrink-0 border-t border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/95 backdrop-blur-md">
        {toast ? (
          <div className="mx-auto w-full min-w-0 max-w-lg px-4 pt-3 sm:px-8">
            <Toast
              message={toast.message}
              tone={toast.tone}
              durationMs={toast.durationMs}
              onDismiss={() => setToast(null)}
            />
          </div>
        ) : null}
        <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-2 px-4 py-3 sm:px-8">
          {meta?.blockedByMe ? (
            <Button
              variant="primary"
              disabled={safetyBusy}
              onClick={() => void doUnblock()}
            >
              Unblock
            </Button>
          ) : (
            <>
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
            className="w-full min-w-0 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          />
          <div className="flex min-w-0 gap-2">
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
              className="min-w-0 flex-1"
              onClick={() => setOfferOpen(true)}
              disabled={!meta}
            >
              Make offer
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setPinOpen(true)}
              disabled={!meta || sending}
            >
              Meetup pin
            </Button>
          </div>
            </>
          )}
        </div>
      </div>

      <MakeOfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        submitting={offerBusy}
        onSubmit={submitOffer}
      />

      <Modal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Share meetup pin"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--rw-ink-muted)]">
            Private to this chat only — never shown on public listings.
          </p>
          <Input
            label="Label"
            value={pinLabel}
            onChange={(e) => setPinLabel(e.target.value)}
            placeholder="Lekki Mall gate"
            maxLength={80}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Latitude"
              value={pinLat}
              onChange={(e) => setPinLat(e.target.value)}
              inputMode="decimal"
            />
            <Input
              label="Longitude"
              value={pinLng}
              onChange={(e) => setPinLng(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <Button
            variant="secondary"
            disabled={pinBusy}
            onClick={() => useBrowserLocation()}
          >
            {pinBusy ? "Working…" : "Use my location"}
          </Button>
          <Button
            variant="primary"
            disabled={pinBusy}
            onClick={() => void shareMeetupPin()}
          >
            {pinBusy ? "Sharing…" : "Share pin in chat"}
          </Button>
        </div>
      </Modal>

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
            variant={meta?.blockedByMe ? "secondary" : "danger"}
            disabled={safetyBusy}
            onClick={() => void (meta?.blockedByMe ? doUnblock() : doBlock())}
          >
            {meta?.blockedByMe ? "Unblock user" : "Block user"}
          </Button>
        </div>
      </Modal>

    </main>
  );
}
