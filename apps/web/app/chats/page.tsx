"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Chip, EmptyState, Skeleton } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  conversationThumbUrl,
  listConversations,
  offerStatusLabel,
  type ConversationListItem,
} from "../../lib/chat";
import { subscribeChat, type InboxUpdate } from "../../lib/chat-socket";

export default function ChatsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listConversations(token);
      setItems(rows);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(
        err instanceof ApiError && err.status === 429
          ? "Chats are busy for a moment. Trying again…"
          : err instanceof ApiError
            ? err.message
            : "Could not load chats",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let live = false;

    const applyInbox = (update: InboxUpdate) => {
      setItems((prev) => {
        const index = prev.findIndex((row) => row.id === update.conversationId);
        if (index < 0) {
          void listConversations(token)
            .then((rows) => {
              setItems(rows);
              setError(null);
              setLoading(false);
            })
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
    };

    const stop = subscribeChat(token, {
      onConnect: () => {
        live = true;
      },
      onDisconnect: () => {
        live = false;
      },
      onInbox: applyInbox,
    });

    const id = window.setInterval(() => {
      if (live || document.visibilityState === "hidden") return;
      void listConversations(token)
        .then((rows) => {
          setItems(rows);
          setError(null);
          setLoading(false);
        })
        .catch(() => undefined);
    }, 30000);

    return () => {
      stop();
      window.clearInterval(id);
    };
  }, []);

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 50% 0%, rgba(14,159,110,0.1), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-lg px-4 pt-8 sm:px-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-[var(--rw-accent)]">ReWorth</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Chats</h1>
          <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
            Offers and messages with buyers and sellers.
          </p>
        </header>

        {loading ? (
          <ul className="space-y-3" aria-busy="true" aria-label="Loading chats">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-20 w-full" label="Loading conversation" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <EmptyState
            title="Could not load chats"
            description={error}
            action={
              <button
                type="button"
                className="text-sm font-semibold text-[var(--rw-accent)] underline"
                onClick={() => void load()}
              >
                Retry
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            description="Tap Chat on a listing to start talking — or make an offer."
            action={
              <Link
                href="/"
                className="text-sm font-semibold text-[var(--rw-accent)] underline"
              >
                Browse listings
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2" aria-label="Conversations">
            {items.map((c) => {
              const thumb = conversationThumbUrl(c.listingThumb);
              return (
                <li key={c.id}>
                  <Link
                    href={`/chats/${c.id}`}
                    className="flex gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-3 transition-colors hover:border-[var(--rw-accent)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--rw-radius)] bg-[var(--rw-border)]">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-full items-center justify-center text-sm font-semibold text-[var(--rw-ink-muted)]"
                          aria-hidden
                        >
                          {(c.listingTitle || "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-semibold">
                          {c.listingTitle || "Listing"}
                        </p>
                        {c.unreadCount > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[var(--rw-accent)] px-1.5 py-0.5 text-xs font-bold text-white">
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        ) : c.muted ? (
                          <span className="shrink-0 text-xs font-medium text-[var(--rw-ink-muted)]">
                            Muted
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-[var(--rw-ink-muted)]">
                        {c.counterpart.displayName}
                        {c.lastMessagePreview
                          ? ` · ${c.lastMessagePreview}`
                          : " · No messages yet"}
                      </p>
                      {c.activeOffer ? (
                        <div className="mt-2">
                          <Chip
                            selected
                            className="pointer-events-none text-xs"
                          >
                            {formatNgn({
                              amountKobo: c.activeOffer.amountKobo,
                            })}{" "}
                            · {offerStatusLabel(String(c.activeOffer.status))}
                          </Chip>
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
