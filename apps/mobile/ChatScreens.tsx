import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { screenBounds, ScrollView } from "./components/BoundScroll";
import { ApiError } from "./lib/api";
import { clearTokens, ensureAccessToken, getAccessToken } from "./lib/auth";
import {
  acceptOffer,
  blockUser,
  unblockUser,
  clientMsgId,
  conversationThumbUrl,
  counterOffer,
  createOffer,
  deleteConversation,
  listConversations,
  listMessages,
  listOffers,
  markConversationRead,
  muteConversation,
  nairaToKobo,
  offerStatusLabel,
  postMessage,
  rejectOffer,
  safeChatPreview,
  reportUser,
  unmuteConversation,
  withdrawOffer,
  type ChatMessage,
  type ConversationListItem,
  type OfferDto,
} from "./lib/chat";
import {
  joinConversation,
  mergeMessages,
  subscribeChat,
  type InboxUpdate,
} from "./lib/chat-socket";
import {
  acceptSwapProposal,
  cancelSwapProposal,
  parseSwapProposalCard,
  rejectSwapProposal,
} from "./lib/swap";
import { formatNgnFromKobo } from "./lib/types";
import { EmptyState } from "./components/EmptyState";
import { useColors } from "./theme/ThemeProvider";
import { colors } from "./theme/tokens";

type Props = {
  meId: string;
  openConversationId?: string | null;
  onConversationOpened?: () => void;
  onActiveChange?: (conversationId: string | null) => void;
  onCheckout?: (params: {
    listingId: string;
    offerId?: string;
    orderIntentId?: string;
    payOrderId?: string;
  }) => void;
  onOpenOrder?: (orderId: string) => void;
  onBrowse?: () => void;
  /** Called when session cannot be recovered — parent should return to onboarding */
  onSessionExpired?: () => void;
};

type ThreadItem =
  | { kind: "message"; key: string; at: string; message: ChatMessage }
  | { kind: "offer"; key: string; at: string; offer: OfferDto };

export function ChatsPanel({
  meId,
  openConversationId,
  onConversationOpened,
  onActiveChange,
  onCheckout,
  onOpenOrder,
  onBrowse,
  onSessionExpired,
}: Props) {
  const theme = useColors();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    openConversationId ?? null,
  );
  const skipEmptyReport = useRef(activeId == null);
  const [pendingDelete, setPendingDelete] = useState<ConversationListItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        setSessionExpired(true);
        setError("Session expired — sign in again");
        setItems([]);
        return;
      }
      setItems(await listConversations(token));
    } catch (err) {
      const unauthorized =
        err instanceof ApiError && err.status === 401;
      if (unauthorized) {
        setSessionExpired(true);
        setError("Session expired — sign in again");
        await clearTokens();
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load chats");
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let stop = () => undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let live = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      stop = subscribeChat(token, {
        onConnect: () => {
          live = true;
        },
        onDisconnect: () => {
          live = false;
        },
        onInbox: (update: InboxUpdate) => {
          setItems((prev) => {
            const index = prev.findIndex((row) => row.id === update.conversationId);
            if (index < 0) {
              void listConversations(token)
                .then(setItems)
                .catch(() => undefined);
              return prev;
            }
            const row = prev[index];
            const incoming = update.senderId === row.counterpart.id;
            const next = [...prev];
            next[index] = {
              ...row,
              lastMessageAt: update.lastMessageAt,
              lastMessagePreview: update.preview,
              unreadCount: incoming ? row.unreadCount + 1 : row.unreadCount,
            };
            next.sort(
              (a, b) =>
                new Date(b.lastMessageAt ?? 0).getTime() -
                new Date(a.lastMessageAt ?? 0).getTime(),
            );
            return next;
          });
        },
      });
      timer = setInterval(() => {
        if (live || AppState.currentState !== "active") return;
        void listConversations(token)
          .then(setItems)
          .catch(() => undefined);
      }, 30000);
    })();
    return () => {
      cancelled = true;
      stop();
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (openConversationId) {
      setActiveId(openConversationId);
      onConversationOpened?.();
    }
  }, [openConversationId, onConversationOpened]);

  useEffect(() => {
    if (skipEmptyReport.current && activeId == null) return;
    skipEmptyReport.current = false;
    onActiveChange?.(activeId);
  }, [activeId, onActiveChange]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        setSessionExpired(true);
        return;
      }
      await deleteConversation(token, pendingDelete.id);
      setItems((prev) => prev.filter((row) => row.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete this chat",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (activeId) {
    return (
      <ChatThread
        conversationId={activeId}
        meId={meId}
        onCheckout={onCheckout}
        onOpenOrder={onOpenOrder}
        onBack={() => {
          setActiveId(null);
          void load();
        }}
      />
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.canvas }]}>
      <Text style={[styles.brand, { color: theme.ink }]} accessibilityRole="header">
        Chats
      </Text>
      <Text style={[styles.copy, { color: theme.muted }]}>
        Offers and messages with local buyers.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.orange} accessibilityLabel="Loading" />
        </View>
      ) : sessionExpired ? (
        <EmptyState
          title="Sign in again"
          body="Your session expired. Sign back in to see chats and offers."
          ctaLabel="Sign in"
          onCta={() => {
            void clearTokens().then(() => onSessionExpired?.());
          }}
          illustration="messages"
        />
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={[styles.retryText, { color: theme.orange }]}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="No messages"
          body="Open a listing and tap Chat or Make offer."
          ctaLabel="Browse listings"
          onCta={() => onBrowse?.()}
          illustration="messages"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          style={screenBounds}
          contentContainerStyle={styles.listPad}
          renderItem={({ item: c }) => {
            const thumb = conversationThumbUrl(c.listingThumb);
            return (
              <Pressable
                style={[
                  styles.row,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                  },
                ]}
                onPress={() => setActiveId(c.id)}
                onLongPress={() => {
                  setDeleteError(null);
                  setPendingDelete(c);
                }}
                delayLongPress={500}
                accessibilityRole="button"
                accessibilityLabel={c.listingTitle}
                accessibilityHint="Long press to delete this chat for you"
              >
                <View style={[styles.thumb, { backgroundColor: theme.border }]}>
                  {thumb ? (
                    <Image
                      source={{ uri: thumb }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={[styles.thumbLetter, { color: theme.muted }]}>
                      {(c.listingTitle || "?").slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[styles.rowTitle, { color: theme.ink }]}
                      numberOfLines={1}
                    >
                      {c.listingTitle || "Listing"}
                    </Text>
                    {c.unreadCount > 0 ? (
                      <View
                        style={[styles.badge, { backgroundColor: theme.orange }]}
                      >
                        <Text style={styles.badgeText}>
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </Text>
                      </View>
                    ) : c.muted ? (
                      <Text style={[styles.mutedChip, { color: theme.muted }]}>
                        Muted
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.rowPreview, { color: theme.muted }]}
                    numberOfLines={1}
                  >
                    {c.counterpart.displayName}
                    {c.lastMessagePreview
                      ? ` · ${safeChatPreview(c.lastMessagePreview)}`
                      : " · No messages yet"}
                  </Text>
                  {c.activeOffer ? (
                    <Text
                      style={[
                        styles.offerChip,
                        {
                          backgroundColor: theme.orangeWash,
                          color: theme.orange,
                        },
                      ]}
                    >
                      {formatNgnFromKobo(c.activeOffer.amountKobo)} ·{" "}
                      {offerStatusLabel(String(c.activeOffer.status))}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={pendingDelete != null} transparent animationType="slide">
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.canvas }]}>
            <Text style={[styles.sheetTitle, { color: theme.ink }]}>
              Delete chat
            </Text>
            <Text style={[styles.copy, { color: theme.muted, marginTop: 8 }]}>
              Delete this chat with{" "}
              {pendingDelete?.counterpart.displayName ?? "this member"} on your
              side? They still have their messages.
            </Text>
            {deleteError ? (
              <Text style={[styles.error, { color: theme.error }]} accessibilityRole="alert">
                {deleteError}
              </Text>
            ) : null}
            <Pressable
              style={[styles.primaryBtn, { marginTop: 16 }, deleting && styles.disabled]}
              disabled={deleting}
              onPress={() => void confirmDelete()}
              accessibilityRole="button"
              accessibilityLabel="Delete chat"
            >
              <Text style={styles.primaryBtnText}>
                {deleting ? "Deleting…" : "Delete chat"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!deleting) setPendingDelete(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.linkCenter, { color: theme.orange }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChatThread({
  conversationId,
  meId,
  onBack,
  onCheckout,
  onOpenOrder,
}: {
  conversationId: string;
  meId: string;
  onBack: () => void;
  onCheckout?: (params: {
    listingId: string;
    offerId?: string;
    orderIntentId?: string;
    payOrderId?: string;
  }) => void;
  onOpenOrder?: (orderId: string) => void;
}) {
  const theme = useColors();
  const [meta, setMeta] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offers, setOffers] = useState<OfferDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerNaira, setOfferNaira] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [counterFor, setCounterFor] = useState<OfferDto | null>(null);
  const [counterNaira, setCounterNaira] = useState("");
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const marked = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const refresh = useCallback(async () => {
    const token = await ensureAccessToken();
    if (!token) return;
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
        /* ignore */
      }
    }
    if (!marked.current) {
      marked.current = true;
      const unread = msgs
        .filter((m) => !m.readAt && m.senderId !== meId)
        .map((m) => m.id);
      void markConversationRead(
        token,
        conversationId,
        unread.length ? unread : undefined,
      ).catch(() => undefined);
    }
  }, [conversationId, meId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not open chat");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const liveRef = { current: false };
    let stop = () => undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const gapFill = () => {
        const last = [...messagesRef.current]
          .reverse()
          .find((item) => !item.id.startsWith("temp-"));
        if (!last) return;
        void listMessages(token, conversationId, { after: last.id, limit: 100 })
          .then((rows) => setMessages((prev) => mergeMessages(prev, rows)))
          .catch(() => undefined);
      };
      stop = subscribeChat(token, {
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
          if (message.senderId !== meId) {
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
      timer = setInterval(() => {
        if (liveRef.current || AppState.currentState !== "active") return;
        gapFill();
      }, 30000);
    })();
    return () => {
      cancelled = true;
      stop();
      if (timer) clearInterval(timer);
    };
  }, [conversationId]);

  const thread = useMemo(() => {
    const cutoff = meta?.deletedAt ? new Date(meta.deletedAt).getTime() : 0;
    const visibleMessages = cutoff
      ? messages.filter((message) => new Date(message.createdAt).getTime() > cutoff)
      : messages;
    const visibleOffers = cutoff
      ? offers.filter((offer) => new Date(offer.createdAt).getTime() > cutoff)
      : offers;
    const inMsg = new Set(
      visibleMessages.filter((m) => m.offerId).map((m) => m.offerId as string),
    );
    const items: ThreadItem[] = visibleMessages.map((m) => ({
      kind: "message",
      key: `m-${m.id}`,
      at: m.createdAt,
      message: m,
    }));
    for (const o of visibleOffers) {
      if (inMsg.has(o.id)) continue;
      items.push({ kind: "offer", key: `o-${o.id}`, at: o.createdAt, offer: o });
    }
    items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return items;
  }, [messages, offers, meta?.deletedAt]);

  const offersById = useMemo(() => {
    const map = new Map<string, OfferDto>();
    for (const o of offers) map.set(o.id, o);
    return map;
  }, [offers]);

  async function sendText() {
    const token = await ensureAccessToken();
    const text = draft.trim();
    if (!token || !text) return;
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
        setToast("Security tip: keep payments on ReWorth");
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.clientMsgId !== cid));
      setDraft(text);
      setToast(err instanceof ApiError ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function submitOffer() {
    const token = await ensureAccessToken();
    if (!token || !meta) return;
    const value = Number(offerNaira.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1) {
      setToast("Enter an amount in ₦");
      return;
    }
    setOfferBusy(true);
    try {
      const offer = await createOffer(token, meta.listingId, {
        amountKobo: nairaToKobo(value),
        conversationId: meta.id,
      });
      setOffers((prev) => [offer, ...prev.filter((o) => o.id !== offer.id)]);
      setOfferOpen(false);
      setOfferNaira("");
      setToast("Offer sent");
      await refresh();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Offer failed");
    } finally {
      setOfferBusy(false);
    }
  }

  async function runOfferAction(
    action: "accept" | "reject" | "withdraw",
    offer: OfferDto,
  ) {
    const token = await ensureAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      if (action === "accept") {
        const res = await acceptOffer(token, offer.id);
        setOffers((prev) =>
          prev.map((o) => (o.id === offer.id ? res.offer : o)),
        );
        const intentId = res.orderIntent?.id;
        if (meId === offer.buyerId) {
          onCheckout?.({
            listingId: offer.listingId,
            ...(intentId
              ? { orderIntentId: intentId }
              : { offerId: offer.id }),
          });
          return;
        }
        setToast(
          intentId
            ? "Offer accepted — buyer can check out"
            : "Offer accepted — listing reserved",
        );
      } else if (action === "reject") {
        const updated = await rejectOffer(token, offer.id);
        setOffers((prev) =>
          prev.map((o) => (o.id === offer.id ? updated : o)),
        );
        setToast("Offer rejected");
      } else {
        const updated = await withdrawOffer(token, offer.id);
        setOffers((prev) =>
          prev.map((o) => (o.id === offer.id ? updated : o)),
        );
        setToast("Offer withdrawn");
      }
      await refresh();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCounter() {
    const token = await ensureAccessToken();
    if (!token || !counterFor) return;
    const value = Number(counterNaira.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1) {
      setToast("Enter a counter amount");
      return;
    }
    setBusy(true);
    try {
      const child = await counterOffer(token, counterFor.id, {
        amountKobo: nairaToKobo(value),
      });
      setCounterFor(null);
      setCounterNaira("");
      setOffers((prev) => [child, ...prev]);
      setToast("Counter offer sent");
      await refresh();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Counter failed");
    } finally {
      setBusy(false);
    }
  }

  async function doBlock() {
    const token = await ensureAccessToken();
    if (!token || !meta) return;
    setBusy(true);
    try {
      await blockUser(token, meta.counterpart.id);
      setSafetyOpen(false);
      setMeta({ ...meta, blockedByMe: true });
      setSafetyOpen(false);
      setToast("User blocked");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Block failed");
    } finally {
      setBusy(false);
    }
  }

  async function doUnblock() {
    const token = await ensureAccessToken();
    if (!token || !meta) return;
    setBusy(true);
    try {
      await unblockUser(token, meta.counterpart.id);
      setMeta({ ...meta, blockedByMe: false });
      setSafetyOpen(false);
      setToast("User unblocked");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Unblock failed");
    } finally {
      setBusy(false);
    }
  }

  async function doReport() {
    const token = await ensureAccessToken();
    if (!token || !meta) return;
    if (!reportReason.trim()) {
      setToast("Add a reason");
      return;
    }
    setBusy(true);
    try {
      await reportUser(token, meta.counterpart.id, {
        reason: reportReason.trim(),
        conversationId: meta.id,
      });
      setSafetyOpen(false);
      setReportReason("");
      setToast("Report submitted");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  async function doMuteToggle() {
    const token = await ensureAccessToken();
    if (!token || !meta) return;
    setBusy(true);
    try {
      if (meta.muted) {
        await unmuteConversation(token, meta.id);
        setMeta({ ...meta, muted: false });
        setToast("Unmuted");
      } else {
        await muteConversation(token, meta.id);
        setMeta({ ...meta, muted: true, unreadCount: 0 });
        setToast("Muted — no badges for new messages");
      }
      setSafetyOpen(false);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Mute failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSwapAction(
    action: "accept" | "reject" | "cancel",
    proposalId: string,
  ) {
    const token = await ensureAccessToken();
    if (!token) return;
    setSwapBusyId(proposalId);
    try {
      if (action === "accept") {
        const res = (await acceptSwapProposal(token, proposalId)) as {
          orders?: { id: string; payerId: string }[];
        };
        const mine = res.orders?.find((order) => order.payerId === meId);
        setToast(
          "Swap accepted. Open the order to pay the delivery fee and the ₦500 swap fee.",
        );
        await refresh();
        if (mine) onOpenOrder?.(mine.id);
        return;
      }
      if (action === "cancel") {
        await cancelSwapProposal(token, proposalId);
        setToast("Swap cancelled");
      } else {
        await rejectSwapProposal(token, proposalId);
        setToast("Swap rejected");
      }
      await refresh();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Swap action failed");
    } finally {
      setSwapBusyId(null);
    }
  }

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

  function SwapSide({
    label,
    item,
  }: {
    label: string;
    item: { title: string; imageUrl?: string | null };
  }) {
    return (
      <View style={styles.swapSide}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.swapSidePhoto}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.swapSidePhoto, styles.swapSideFallback]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.swapSideLabel}>{label}</Text>
          <Text style={styles.swapSideTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </View>
    );
  }

  function renderSwapCard(m: ChatMessage) {
    const parsed = parseSwapProposalCard(m.body);
    if (!parsed) {
      return (
        <View style={styles.swapCard}>
          <Text style={styles.swapTitle}>Swap proposal</Text>
        </View>
      );
    }
    const isListingSeller = Boolean(meta && meId === meta.sellerId);
    const accepted = parsed.kind === "swap-accepted";
    const rejected = parsed.kind === "swap-rejected";
    const cancelled = parsed.kind === "swap-cancelled";
    const closed = accepted || rejected || cancelled;
    const settled =
      !closed &&
      messages.some((message) => {
        if (message.id === m.id || message.type !== "SWAP_PROPOSAL_CARD") {
          return false;
        }
        const later = parseSwapProposalCard(message.body);
        return (
          later?.swapProposalId === parsed.swapProposalId &&
          (later.kind === "swap-accepted" ||
            later.kind === "swap-rejected" ||
            later.kind === "swap-cancelled")
        );
      });
    if (settled) return null;
    const mineOrder = parsed.orders.find((order) => order.payerId === meId);
    return (
      <View style={styles.swapCard}>
        {accepted ? <Text style={styles.swapEyebrow}>Swap order</Text> : null}
        <Text style={styles.swapTitle}>
          {accepted
            ? "Swap accepted"
            : rejected
              ? "Swap rejected"
              : cancelled
                ? "Swap cancelled"
                : parsed.title || "Swap proposal"}
        </Text>
        {!accepted && parsed.description ? (
          <Text style={styles.swapBody}>{parsed.description}</Text>
        ) : null}
        {parsed.imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swapPhotoRow}
          >
            {parsed.imageUrls.map((url) => (
              <Image
                key={url}
                source={{ uri: url }}
                style={styles.swapPhoto}
                resizeMode="cover"
                accessibilityLabel="Swap photo"
              />
            ))}
          </ScrollView>
        ) : null}
        {accepted && mineOrder?.receive && mineOrder.send ? (
          <View style={styles.swapExchange}>
            <SwapSide label="You send" item={mineOrder.send} />
            <SwapSide label="You receive" item={mineOrder.receive} />
          </View>
        ) : null}
        {parsed.deliveryOn ? (
          <Text style={styles.swapMeta}>
            Delivery day · {formatDeliveryDay(parsed.deliveryOn)}
          </Text>
        ) : null}
        <Text style={styles.swapBody}>
          {accepted
            ? "This is now an order for both of you. Each person pays the delivery fee and a ₦500 swap fee. Cancel it from the order, before either of you pays."
            : rejected
              ? "This proposal was rejected."
              : cancelled
                ? "This proposal was cancelled. The listing is back on the marketplace."
                : "If they accept, both of you get an order. Each person pays the delivery fee and a ₦500 swap fee."}
        </Text>
        {!closed && isListingSeller ? (
          <View style={styles.offerActions}>
            <MiniBtn
              label="Accept"
              primary
              disabled={swapBusyId === parsed.swapProposalId}
              onPress={() => void runSwapAction("accept", parsed.swapProposalId)}
            />
            <MiniBtn
              label="Reject"
              disabled={swapBusyId === parsed.swapProposalId}
              onPress={() => void runSwapAction("reject", parsed.swapProposalId)}
            />
            <MiniBtn
              label="Cancel swap"
              disabled={swapBusyId === parsed.swapProposalId}
              onPress={() => void runSwapAction("cancel", parsed.swapProposalId)}
            />
          </View>
        ) : !closed ? (
          <View style={styles.offerActions}>
            <Text style={styles.muted}>Waiting for them to accept</Text>
            <MiniBtn
              label="Cancel swap"
              disabled={swapBusyId === parsed.swapProposalId}
              onPress={() => void runSwapAction("cancel", parsed.swapProposalId)}
            />
          </View>
        ) : null}
      </View>
    );
  }

  function renderOfferCard(offer: OfferDto) {
    const isSeller = meId === offer.sellerId;
    const isBuyer = meId === offer.buyerId;
    const pending = offer.status === "PENDING";
    const accepted = offer.status === "ACCEPTED";
    return (
      <View style={styles.offerCard}>
        <Text style={styles.offerLabel}>Offer</Text>
        <Text style={styles.offerAmount}>
          {formatNgnFromKobo(offer.amountKobo)}
        </Text>
        <Text style={styles.offerStatus}>
          {offerStatusLabel(String(offer.status))}
        </Text>
        {pending ? (
          <View style={styles.offerActions}>
            {isSeller ? (
              <>
                <MiniBtn
                  label="Accept"
                  primary
                  disabled={busy}
                  onPress={() => void runOfferAction("accept", offer)}
                />
                <MiniBtn
                  label="Reject"
                  disabled={busy}
                  onPress={() => void runOfferAction("reject", offer)}
                />
                <MiniBtn
                  label="Counter"
                  disabled={busy}
                  onPress={() => {
                    setCounterFor(offer);
                    setCounterNaira(String(Math.round(offer.amountKobo / 100)));
                  }}
                />
              </>
            ) : null}
            {isBuyer ? (
              <MiniBtn
                label="Withdraw"
                danger
                disabled={busy}
                onPress={() => void runOfferAction("withdraw", offer)}
              />
            ) : null}
          </View>
        ) : null}
        {accepted && isBuyer ? (
          <View style={styles.offerActions}>
            <MiniBtn
              label="Checkout"
              primary
              disabled={busy}
              onPress={() =>
                onCheckout?.({
                  listingId: offer.listingId,
                  offerId: offer.id,
                })
              }
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
          <ActivityIndicator color={theme.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={onBack} style={styles.retry}>
          <Text style={styles.retryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.threadHeader}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          style={styles.threadSide}
        >
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <View style={styles.threadTitles} pointerEvents="none">
          <Text style={styles.threadTitle} numberOfLines={1}>
            {meta?.listingTitle ?? "Conversation"}
          </Text>
          <Text style={styles.threadSubtitle} numberOfLines={1}>
            {meta?.counterpart.displayName ?? "Member"}
          </Text>
        </View>
        <Pressable
          onPress={() => setSafetyOpen(true)}
          accessibilityRole="button"
          style={[styles.threadSide, styles.threadSideEnd]}
        >
          <Text style={styles.link}>Safety</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.threadPad}
        keyboardShouldPersistTaps="handled"
      >
        {thread.length === 0 ? (
          <Text style={[styles.muted, styles.centerText]}>
            Say hello — or make an offer.
          </Text>
        ) : (
          thread.map((item) => {
            if (item.kind === "offer") {
              return (
                <View key={item.key} style={styles.offerWrap}>
                  {renderOfferCard(item.offer)}
                </View>
              );
            }
            const m = item.message;
            const mine = m.senderId === meId;
            const linked = m.offerId ? offersById.get(m.offerId) : null;
            return (
              <View key={item.key} style={styles.msgBlock}>
                {m.scamWarning ? (
                  <View style={styles.warn} accessibilityRole="alert">
                    <Text style={styles.warnText}>
                      Security warning: keep payments on ReWorth.
                    </Text>
                  </View>
                ) : null}
                {m.type === "OFFER_CARD" && linked ? (
                  <View style={styles.offerWrap}>{renderOfferCard(linked)}</View>
                ) : m.type === "SWAP_PROPOSAL_CARD" ? (
                  <View style={styles.offerWrap}>{renderSwapCard(m)}</View>
                ) : m.type === "SYSTEM" ? (
                  <Text style={[styles.muted, styles.centerText]}>{m.body}</Text>
                ) : (
                  <View
                    style={[
                      styles.bubble,
                      mine
                        ? {
                            alignSelf: "flex-end",
                            backgroundColor: theme.orangeWash,
                          }
                        : {
                            alignSelf: "flex-start",
                            backgroundColor: theme.beige,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: theme.border,
                          },
                    ]}
                  >
                    <Text
                      style={[styles.bubbleText, { color: theme.ink }]}
                    >
                      {m.body}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
        {toast ? (
          <Pressable onPress={() => setToast(null)}>
            <Text style={styles.toast}>{toast}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {meta?.blockedByMe ? (
        <View style={styles.composer}>
          <Pressable
            style={[
              styles.sendBtn,
              styles.unblockBtn,
              { backgroundColor: theme.orange },
              busy && styles.disabled,
            ]}
            disabled={busy}
            onPress={() => void doUnblock()}
            accessibilityRole="button"
            accessibilityLabel="Unblock"
          >
            <Text style={styles.sendText}>Unblock</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            style={[
              styles.composerInput,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                color: theme.ink,
              },
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={theme.muted}
            accessibilityLabel="Message"
            maxLength={4000}
          />
          <Pressable
            style={[
              styles.sendBtn,
              { backgroundColor: theme.orange },
              (!draft.trim() || sending) && styles.disabled,
            ]}
            disabled={!draft.trim() || sending}
            onPress={() => void sendText()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
          <Pressable
            style={[styles.offerBtn, !meta && styles.disabled]}
            onPress={() => setOfferOpen(true)}
            disabled={!meta}
          >
            <Text style={styles.offerBtnText}>Make offer</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={offerOpen} animationType="slide" transparent>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Make offer</Text>
            <Text style={styles.label}>Amount (₦)</Text>
            <TextInput
              style={styles.input}
              value={offerNaira}
              onChangeText={setOfferNaira}
              keyboardType="numeric"
              placeholder="45000"
            />
            <Pressable
              style={[styles.primaryBtn, offerBusy && styles.disabled]}
              disabled={offerBusy}
              onPress={() => void submitOffer()}
            >
              <Text style={styles.primaryBtnText}>
                {offerBusy ? "Sending…" : "Send offer"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setOfferOpen(false)}>
              <Text style={styles.linkCenter}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(counterFor)} animationType="slide" transparent>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Counter offer</Text>
            <Text style={styles.label}>Amount (₦)</Text>
            <TextInput
              style={styles.input}
              value={counterNaira}
              onChangeText={setCounterNaira}
              keyboardType="numeric"
            />
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void submitCounter()}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Sending…" : "Send counter"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setCounterFor(null)}>
              <Text style={styles.linkCenter}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {safetyOpen ? (
        <View style={styles.safetyLayer}>
          <Pressable
            style={styles.safetyDismiss}
            onPress={() => setSafetyOpen(false)}
            accessibilityLabel="Close safety"
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Block or report</Text>
            <Text style={styles.label}>Report reason</Text>
            <TextInput
              style={styles.input}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Scam, harassment…"
            />
            <Pressable
              style={[styles.secondaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void doReport()}
            >
              <Text style={styles.secondaryBtnText}>Report user</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void doMuteToggle()}
              accessibilityLabel={
                meta?.muted ? "Unmute conversation" : "Mute conversation"
              }
            >
              <Text style={styles.secondaryBtnText}>
                {meta?.muted ? "Unmute conversation" : "Mute conversation"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                meta?.blockedByMe ? styles.secondaryBtn : styles.dangerBtn,
                busy && styles.disabled,
              ]}
              disabled={busy}
              onPress={() => void (meta?.blockedByMe ? doUnblock() : doBlock())}
              accessibilityLabel={
                meta?.blockedByMe ? "Unblock user" : "Block user"
              }
            >
              <Text
                style={
                  meta?.blockedByMe
                    ? styles.secondaryBtnText
                    : styles.dangerBtnText
                }
              >
                {meta?.blockedByMe ? "Unblock user" : "Block user"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setSafetyOpen(false)}>
              <Text style={styles.linkCenter}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MiniBtn({
  label,
  onPress,
  primary,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const theme = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.miniBtn,
        {
          borderColor: theme.border,
          backgroundColor: theme.canvas,
        },
        primary && {
          backgroundColor: theme.orange,
          borderColor: theme.orange,
        },
        danger && {
          backgroundColor: theme.error,
          borderColor: theme.error,
        },
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.miniText,
          { color: theme.ink },
          (primary || danger) && styles.miniTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brand: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  copy: { marginTop: 8, fontSize: 15, color: colors.muted, marginBottom: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  listPad: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbLetter: { fontWeight: "700", color: colors.muted },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  rowPreview: { marginTop: 4, fontSize: 13, color: colors.muted },
  offerChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.orangeWash,
    color: colors.orange,
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.orange,
    alignItems: "center",
  },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: "700" },
  mutedChip: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 14, color: colors.muted },
  error: { color: colors.error, fontSize: 15 },
  retry: { marginTop: 8, padding: 8 },
  retryText: { color: colors.orange, fontWeight: "700" },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  threadSide: {
    width: 64,
    minHeight: 44,
    justifyContent: "center",
    zIndex: 1,
  },
  threadSideEnd: { alignItems: "flex-end" },
  threadTitles: {
    position: "absolute",
    left: 96,
    right: 96,
    alignItems: "center",
  },
  threadTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  threadSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
  link: { color: colors.orange, fontWeight: "700", fontSize: 14 },
  linkCenter: {
    marginTop: 14,
    textAlign: "center",
    color: colors.orange,
    fontWeight: "600",
  },
  threadPad: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 10,
  },
  centerText: { textAlign: "center" },
  msgBlock: { gap: 6 },
  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.orangeWash },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.beige,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: 15, color: colors.ink, lineHeight: 20 },
  bubbleTextMine: { color: colors.ink },
  warn: {
    borderRadius: 10,
    backgroundColor: colors.goldWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    padding: 10,
  },
  warnText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  offerWrap: { alignItems: "center" },
  offerCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  offerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  offerAmount: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  offerStatus: {
    marginTop: 4,
    fontSize: 13,
    color: colors.orange,
    fontWeight: "600",
  },
  offerActions: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.canvas,
  },
  miniPrimary: { backgroundColor: colors.orange, borderColor: colors.orange },
  miniDanger: { backgroundColor: colors.error, borderColor: colors.error },
  miniText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  miniTextOn: { color: colors.onAccent },
  composer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  sendBtn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },
  offerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  swapCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  swapEyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.muted,
  },
  swapTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  swapBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  swapMeta: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  swapPhotoRow: { gap: 8, paddingTop: 4 },
  swapPhoto: { width: 96, height: 96, borderRadius: 12 },
  swapExchange: { gap: 8, marginTop: 4 },
  swapSide: { flexDirection: "row", alignItems: "center", gap: 10 },
  swapSidePhoto: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.beige,
  },
  swapSideFallback: { backgroundColor: colors.beige },
  swapSideLabel: { fontSize: 12, lineHeight: 16, color: colors.muted },
  swapSideTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  offerBtnIcon: { width: 22, height: 22 },
  offerBtnText: { fontWeight: "700", color: colors.ink },
  toast: {
    marginTop: 8,
    textAlign: "center",
    color: colors.orange,
    fontWeight: "600",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  unblockBtn: { flexGrow: 1, alignItems: "center" },
  safetyLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  safetyDismiss: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { fontWeight: "700", color: colors.ink },
  dangerBtn: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.error,
  },
  dangerBtnText: { fontWeight: "700", color: colors.onAccent },
  disabled: { opacity: 0.55 },
});
