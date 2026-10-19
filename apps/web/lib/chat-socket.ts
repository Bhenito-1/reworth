"use client";

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
let lifecycleBound = false;
/** True while the tab is frozen / in bfcache — avoid noisy reconnect loops. */
let suspended = false;
const listeners = new Set<Handlers>();

function origin(): string {
  return API_URL.replace(/\/api\/v1\/?$/, "");
}

function bindLifecycle() {
  if (lifecycleBound || typeof window === "undefined") return;
  lifecycleBound = true;

  const suspend = () => {
    if (!socket || suspended) return;
    suspended = true;
    // Close cleanly so Chrome can bfcache the page without a failed WS error.
    socket.io.reconnection(false);
    socket.disconnect();
  };

  const resume = () => {
    if (!suspended) return;
    suspended = false;
    if (!socketToken || listeners.size === 0) return;
    const token = socketToken;
    if (socket) {
      socket.io.reconnection(true);
      if (!socket.connected) socket.connect();
      return;
    }
    socketToken = null;
    ensure(token);
  };

  window.addEventListener("pagehide", suspend);
  window.addEventListener("freeze", suspend);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) resume();
  });
  document.addEventListener("resume", resume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
}

function ensure(token: string) {
  bindLifecycle();
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (suspended) {
    socketToken = token;
    return;
  }
  if (socket && socketToken === token) {
    if (!socket.connected) socket.connect();
    return;
  }
  socket?.disconnect();
  socketToken = token;
  const next = io(`${origin()}/chat`, {
    auth: { token },
    // Prefer websocket; allow polling fallback on hosts that interrupt WS.
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
      suspended = false;
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
