import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import type { ChatMessage, OfferDto } from "./chat";

export type InboxUpdate = {
  conversationId: string;
  lastMessageAt: string;
  preview: string | null;
  senderId: string;
};

export type ReadUpdate = {
  conversationId: string;
  readerId: string;
  readAt: string;
};

type Handlers = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: ChatMessage) => void;
  onRead?: (update: ReadUpdate) => void;
  onOffer?: (offer: OfferDto) => void;
  onInbox?: (update: InboxUpdate) => void;
};

let socket: Socket | null = null;
let socketToken: string | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Handlers>();

function origin(): string {
  return API_URL.replace(/\/api\/v1\/?$/, "");
}

function ensure(token: string) {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (socket && socketToken === token) return;
  socket?.disconnect();
  socketToken = token;
  const next = io(`${origin()}/chat`, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000,
  });
  next.on("connect", () => {
    for (const listener of listeners) listener.onConnect?.();
  });
  next.on("disconnect", () => {
    for (const listener of listeners) listener.onDisconnect?.();
  });
  next.on("message.new", (message: ChatMessage) => {
    for (const listener of listeners) listener.onMessage?.(message);
  });
  next.on("message.read", (update: ReadUpdate) => {
    for (const listener of listeners) listener.onRead?.(update);
  });
  next.on("offer.updated", (offer: OfferDto) => {
    for (const listener of listeners) listener.onOffer?.(offer);
  });
  next.on("inbox.updated", (update: InboxUpdate) => {
    for (const listener of listeners) listener.onInbox?.(update);
  });
  next.io.on("reconnect_attempt", () => {
    next.auth = { token: socketToken ?? token };
  });
  socket = next;
}

/** One shared connection while any chat screen is open. */
export function subscribeChat(token: string, handlers: Handlers): () => void {
  ensure(token);
  listeners.add(handlers);
  if (socket?.connected) handlers.onConnect?.();
  return () => {
    listeners.delete(handlers);
    if (listeners.size > 0) return;
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (listeners.size > 0) return;
      socket?.disconnect();
      socket = null;
      socketToken = null;
    }, 1500);
  };
}

export function joinConversation(conversationId: string): Promise<boolean> {
  const current = socket;
  if (!current?.connected) return Promise.resolve(false);
  return new Promise((resolve) => {
    current.timeout(4000).emit(
      "conversation.join",
      { conversationId },
      (err: unknown, res?: { ok?: boolean }) => {
        resolve(!err && res?.ok === true);
      },
    );
  });
}

export function mergeMessages(
  prev: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const next = [...prev];
  for (const msg of incoming) {
    const byId = next.findIndex((item) => item.id === msg.id);
    if (byId >= 0) {
      next[byId] = msg;
      continue;
    }
    if (msg.clientMsgId) {
      const byClient = next.findIndex(
        (item) => item.clientMsgId && item.clientMsgId === msg.clientMsgId,
      );
      if (byClient >= 0) {
        next[byClient] = msg;
        continue;
      }
    }
    next.push(msg);
  }
  return next;
}
