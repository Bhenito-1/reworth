"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/api";
import { clearTokens, getRefreshToken } from "../lib/auth";
import {
  NotificationBell,
  useUnreadNotificationCount,
} from "./notifications/NotificationBell";

type Item = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: "home" | "search" | "sell" | "listings" | "wishlist" | "cart" | "orders" | "chats" | "account";
};

const ITEMS: Item[] = [
  { href: "/", label: "Home", match: (p) => p === "/", icon: "home" },
  {
    href: "/search",
    label: "Search",
    match: (p) => p.startsWith("/search"),
    icon: "search",
  },
  {
    href: "/sell",
    label: "Sell",
    match: (p) => p === "/sell" || p.startsWith("/sell/"),
    icon: "sell",
  },
  {
    href: "/selling",
    label: "My listings",
    match: (p) => p.startsWith("/selling"),
    icon: "listings",
  },
  {
    href: "/wishlist",
    label: "Wishlist",
    match: (p) => p.startsWith("/wishlist") || p.startsWith("/my"),
    icon: "wishlist",
  },
  { href: "/cart", label: "Cart", match: (p) => p.startsWith("/cart"), icon: "cart" },
  {
    href: "/orders",
    label: "Orders",
    match: (p) => p.startsWith("/orders"),
    icon: "orders",
  },
  {
    href: "/chats",
    label: "Chats",
    match: (p) => p.startsWith("/chats"),
    icon: "chats",
  },
  {
    href: "/account",
    label: "Account",
    match: (p) => p.startsWith("/account"),
    icon: "account",
  },
];

/** Shopping cart: basket, handle, and wheels. */
export function CartIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 5h2.1l1.5 8.6a1.6 1.6 0 0 0 1.6 1.3H18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.6 7.5h12.6l-1.6 6.1H8.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19.25" r="1.35" fill="currentColor" />
      <circle cx="16.5" cy="19.25" r="1.35" fill="currentColor" />
    </svg>
  );
}

export function HeartIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5.5 19c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Icon({ name }: { name: Item["icon"] }) {
  const common = "h-5 w-5 shrink-0";
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M16 16 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "sell") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "listings") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M8 6h11M8 12h11M8 18h11"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="4.5" cy="6" r="1" fill="currentColor" />
        <circle cx="4.5" cy="12" r="1" fill="currentColor" />
        <circle cx="4.5" cy="18" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (name === "wishlist") return <HeartIcon className={common} />;
  if (name === "cart") return <CartIcon className={common} />;
  if (name === "orders") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M7 4.5h10a1 1 0 0 1 1 1V20l-2.2-1.4L13.4 20l-2.4-1.4L8.6 20l-2.4-1.4L4 20V5.5a1 1 0 0 1 1-1h2z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "chats") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M5 18.5 6.2 15A7.5 7.5 0 1 1 12 19.5H7.2L5 18.5z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return <AccountIcon className={common} />;
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                active
                  ? "bg-[var(--rw-accent-muted)] text-[var(--rw-accent)]"
                  : "text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] hover:text-[var(--rw-ink)]",
              ].join(" ")}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppNav({
  desktopOpen,
  onDesktopOpenChange,
}: {
  desktopOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const unreadNotifications = useUnreadNotificationCount();

  async function logout() {
    const refreshToken = getRefreshToken();
    const leaving = window.location.pathname !== "/";
    setOpen(false);
    clearTokens();
    void apiFetch("/auth/logout", {
      method: "POST",
      keepalive: true,
      body: refreshToken ? { refreshToken } : {},
    }).catch(() => undefined);
    if (leaving) window.location.replace("/");
  }

  const panel = (opts?: { onClose?: () => void; onNavigate?: () => void }) => (
    <div className="flex h-full flex-col bg-[var(--rw-bg-elevated)]">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <div>
          <p className="text-lg font-semibold tracking-tight text-[var(--rw-ink)]">
            ReWorth
          </p>
          <p className="text-xs text-[var(--rw-ink-muted)]">Buy, sell, swap</p>
        </div>
        {opts?.onClose ? (
          <button
            type="button"
            onClick={opts.onClose}
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] hover:text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>
      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col">
        <NavLinks pathname={pathname} onNavigate={opts?.onNavigate} />
      </nav>
      <div className="border-t border-[var(--rw-border)] p-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-[var(--rw-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div
        className={[
          "fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3",
          desktopOpen ? "lg:hidden" : "",
        ].join(" ")}
      >
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open || desktopOpen}
          onClick={() => {
            if (window.matchMedia("(min-width: 1024px)").matches) {
              onDesktopOpenChange(true);
              return;
            }
            setOpen(true);
          }}
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <span className="block h-0.5 w-5 bg-[var(--rw-ink)]" />
          <span className="block h-0.5 w-5 bg-[var(--rw-ink)]" />
          <span className="block h-0.5 w-5 bg-[var(--rw-ink)]" />
        </button>
        <p className="text-base font-semibold tracking-tight">ReWorth</p>
        <NotificationBell count={unreadNotifications} />
      </div>

      {desktopOpen ? (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-[var(--rw-border)] lg:block">
          {panel({ onClose: () => onDesktopOpenChange(false) })}
        </aside>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            {panel({
              onClose: () => setOpen(false),
              onNavigate: () => setOpen(false),
            })}
          </aside>
        </div>
      ) : null}
    </>
  );
}
