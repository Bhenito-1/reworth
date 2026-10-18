"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAccessToken } from "../../lib/auth";
import { subscribeChat } from "../../lib/chat-socket";
import { unreadNotificationCount } from "../../lib/notifications";

export function useUnreadNotificationCount() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (document.visibilityState === "hidden") return;
      const token = getAccessToken();
      if (!token) {
        setCount(0);
        return;
      }
      void unreadNotificationCount(token)
        .then((res) => {
          if (!cancelled) setCount(res.count);
        })
        .catch(() => undefined);
    };

    load();
    const token = getAccessToken();
    const stop = token
      ? subscribeChat(token, {
          onInbox: () => load(),
          onRead: () => load(),
        })
      : () => undefined;
    const id = window.setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      stop();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [pathname]);

  return count;
}

export function NotificationBell({ count }: { count: number }) {
  const label =
    count > 0
      ? `Notifications, ${count} unread`
      : "Notifications";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--rw-ink)] hover:bg-[var(--rw-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
    >
      <BellIcon />
      {count > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--rw-accent)] px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function BellIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.7 1.7 0 0 0 3.4 0" />
    </svg>
  );
}
