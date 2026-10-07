import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import {
  acceptOffer,
  blockUser,
  clientMsgId,
  conversationThumbUrl,
  counterOffer,
  createOffer,
  listConversations,
  listMessages,
  listOffers,
  markConversationRead,
  muteConversation,
  nairaToKobo,
  offerStatusLabel,
  postMessage,
  rejectOffer,
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
import { formatNgnFromKobo } from "./lib/types";

type Props = {
  meId: string;
  openConversationId?: string | null;
  onConversationOpened?: () => void;
  onCheckout?: (params: {
    listingId: string;
    offerId?: string;
    orderIntentId?: string;
  }) => void;
};

type ThreadItem =
  | { kind: "message"; key: string; at: string; message: ChatMessage }
  | { kind: "offer"; key: string; at: string; offer: OfferDto };

export function ChatsPanel({
  meId,
  openConversationId,
  onConversationOpened,
  onCheckout,
}: Props) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listConversations(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load chats");
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

  if (activeId) {
    return (
      <ChatThread
        conversationId={activeId}
        meId={meId}
        onCheckout={onCheckout}
        onBack={() => {
          setActiveId(null);
          void load();
        }}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.brand} accessibilityRole="header">
        Chats
      </Text>
      <Text style={styles.copy}>Offers and messages with local buyers.</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0E9F6E" accessibilityLabel="Loading" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.muted}>
            Open a listing and tap Chat or Make offer.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listPad}
          renderItem={({ item: c }) => {
            const thumb = conversationThumbUrl(c.listingThumb);
            return (
              <Pressable
                style={styles.row}
                onPress={() => setActiveId(c.id)}
                accessibilityRole="button"
                accessibilityLabel={c.listingTitle}
              >
                <View style={styles.thumb}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.thumbImg} />
                  ) : (
                    <Text style={styles.thumbLetter}>
                      {(c.listingTitle || "?").slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.listingTitle || "Listing"}
                    </Text>
                    {c.unreadCount > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </Text>
                      </View>
                    ) : c.muted ? (
                      <Text style={styles.mutedChip}>Muted</Text>
                    ) : null}
                  </View>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {c.counterpart.displayName}
                    {c.lastMessagePreview
                      ? ` · ${c.lastMessagePreview}`
                      : " · No messages yet"}
                  </Text>
                  {c.activeOffer ? (
                    <Text style={styles.offerChip}>
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
    </View>
  );
}

function ChatThread({
  conversationId,
  meId,
  onBack,
  onCheckout,
}: {
  conversationId: string;
  meId: string;
  onBack: () => void;
  onCheckout?: (params: {
    listingId: string;
    offerId?: string;
    orderIntentId?: string;
  }) => void;
}) {
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
  const marked = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const refresh = useCallback(async () => {
    const token = await getAccessToken();
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
    const inMsg = new Set(
      messages.filter((m) => m.offerId).map((m) => m.offerId as string),
    );
    const items: ThreadItem[] = messages.map((m) => ({
      kind: "message",
      key: `m-${m.id}`,
      at: m.createdAt,
      message: m,
    }));
    for (const o of offers) {
      if (inMsg.has(o.id)) continue;
      items.push({ kind: "offer", key: `o-${o.id}`, at: o.createdAt, offer: o });
    }
    items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return items;
  }, [messages, offers]);

  const offersById = useMemo(() => {
    const map = new Map<string, OfferDto>();
    for (const o of offers) map.set(o.id, o);
    return map;
  }, [offers]);

  async function sendText() {
    const token = await getAccessToken();
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
    const token = await getAccessToken();
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
    const token = await getAccessToken();
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
    const token = await getAccessToken();
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
    const token = await getAccessToken();
    if (!token || !meta) return;
    setBusy(true);
    try {
      await blockUser(token, meta.counterpart.id);
      setSafetyOpen(false);
      setToast("User blocked");
      onBack();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Block failed");
    } finally {
      setBusy(false);
    }
  }

  async function doReport() {
    const token = await getAccessToken();
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
    const token = await getAccessToken();
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
        <ActivityIndicator color="#0E9F6E" />
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
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <View style={styles.threadTitles}>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {meta?.listingTitle ?? "Conversation"}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {meta?.counterpart.displayName ?? "Member"}
          </Text>
        </View>
        <Pressable onPress={() => setSafetyOpen(true)} accessibilityRole="button">
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
                ) : m.type === "SYSTEM" ? (
                  <Text style={[styles.muted, styles.centerText]}>{m.body}</Text>
                ) : (
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        mine && styles.bubbleTextMine,
                      ]}
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

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          accessibilityLabel="Message"
          maxLength={4000}
        />
        <Pressable
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.disabled]}
          disabled={!draft.trim() || sending}
          onPress={() => void sendText()}
        >
          <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
        </Pressable>
        <Pressable
          style={[styles.offerBtn, !meta && styles.disabled]}
          onPress={() => setOfferOpen(true)}
          disabled={!meta}
        >
          <Text style={styles.offerBtnText}>Make offer</Text>
        </Pressable>
      </View>

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

      <Modal visible={safetyOpen} animationType="slide" transparent>
        <View style={styles.sheetBackdrop}>
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
              accessibilityLabel={meta?.muted ? "Unmute conversation" : "Mute conversation"}
            >
              <Text style={styles.secondaryBtnText}>
                {meta?.muted ? "Unmute conversation" : "Mute conversation"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.dangerBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void doBlock()}
            >
              <Text style={styles.dangerBtnText}>Block user</Text>
            </Pressable>
            <Pressable onPress={() => setSafetyOpen(false)}>
              <Text style={styles.linkCenter}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.miniBtn,
        primary && styles.miniPrimary,
        danger && styles.miniDanger,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.miniText,
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
    color: "#111315",
    letterSpacing: -0.4,
  },
  copy: { marginTop: 8, fontSize: 15, color: "#5C636A", marginBottom: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  listPad: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#E5E2DC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbLetter: { fontWeight: "700", color: "#5C636A" },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#111315" },
  rowPreview: { marginTop: 4, fontSize: 13, color: "#5C636A" },
  offerChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#D1FAE5",
    color: "#0E9F6E",
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#0E9F6E",
    alignItems: "center",
  },
  badgeText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  mutedChip: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5C636A",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#111315" },
  muted: { fontSize: 14, color: "#5C636A" },
  error: { color: "#DC2626", fontSize: 15 },
  retry: { marginTop: 8, padding: 8 },
  retryText: { color: "#0E9F6E", fontWeight: "700" },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  threadTitles: { flex: 1, minWidth: 0 },
  threadTitle: { fontSize: 16, fontWeight: "700", color: "#111315" },
  link: { color: "#0E9F6E", fontWeight: "700", fontSize: 14 },
  linkCenter: {
    marginTop: 14,
    textAlign: "center",
    color: "#0E9F6E",
    fontWeight: "600",
  },
  threadPad: { paddingBottom: 16, gap: 10 },
  centerText: { textAlign: "center" },
  msgBlock: { gap: 6 },
  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#0E9F6E" },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2DC",
  },
  bubbleText: { fontSize: 15, color: "#111315", lineHeight: 20 },
  bubbleTextMine: { color: "#FFFFFF" },
  warn: {
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    padding: 10,
  },
  warnText: { color: "#92400E", fontSize: 13, fontWeight: "600" },
  offerWrap: { alignItems: "center" },
  offerCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  offerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5C636A",
    textTransform: "uppercase",
  },
  offerAmount: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "700",
    color: "#111315",
  },
  offerStatus: { marginTop: 4, fontSize: 13, color: "#0E9F6E", fontWeight: "600" },
  offerActions: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FAF9F7",
  },
  miniPrimary: { backgroundColor: "#0E9F6E", borderColor: "#0E9F6E" },
  miniDanger: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  miniText: { fontSize: 13, fontWeight: "700", color: "#111315" },
  miniTextOn: { color: "#FFFFFF" },
  composer: { flexDirection: "row", gap: 8, alignItems: "center" },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    fontSize: 16,
    color: "#111315",
  },
  sendBtn: {
    backgroundColor: "#0E9F6E",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendText: { color: "#FFF", fontWeight: "700" },
  offerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  offerBtnText: { fontWeight: "700", color: "#111315" },
  toast: {
    marginTop: 8,
    textAlign: "center",
    color: "#0E9F6E",
    fontWeight: "600",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FAF9F7",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: "#111315" },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#111315",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111315",
    backgroundColor: "#FFFFFF",
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: "#0E9F6E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: { fontWeight: "700", color: "#111315" },
  dangerBtn: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#DC2626",
  },
  dangerBtnText: { fontWeight: "700", color: "#FFFFFF" },
  disabled: { opacity: 0.55 },
});
