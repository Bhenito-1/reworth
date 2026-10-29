"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

/** Desktop bar. Home is the ReWorth wordmark. Chats is an icon at the end. */
const BAR_LINKS: { href: string; label: string; match: (pathname: string) => boolean }[] = [
  { href: "/search", label: "Explore", match: (p) => p.startsWith("/search") },
  { href: "/selling", label: "My listings", match: (p) => p.startsWith("/selling") },
  { href: "/orders", label: "Orders", match: (p) => p.startsWith("/orders") },
  { href: "/#how", label: "How it works", match: () => false },
  {
    href: "/communities",
    label: "Community",
    match: (p) => p.startsWith("/communities"),
  },
  { href: "/#impact", label: "Sustainability", match: () => false },
];

/** Sell, wishlist, and cart live under Account on desktop. */
const ACCOUNT_MENU: Item[] = ["/sell", "/wishlist", "/cart", "/account"].map(
  (href) => ITEMS.find((entry) => entry.href === href)!,
);

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

function AccountMenu({
  pathname,
  onLogout,
}: {
  pathname: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-full py-1 pl-1 pr-2 text-[var(--rw-ink)] hover:bg-[var(--rw-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--rw-beige)] text-[var(--rw-ink)]">
          <AccountIcon className="h-4 w-4" />
        </span>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 overflow-hidden rounded-2xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] py-1 shadow-[0_16px_40px_rgba(23,42,58,0.12)]"
        >
          {ACCOUNT_MENU.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={[
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--rw-accent)]",
                  active
                    ? "bg-[var(--rw-beige)] text-[var(--rw-ink)]"
                    : "text-[var(--rw-ink)] hover:bg-[var(--rw-bg)]",
                ].join(" ")}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-[var(--rw-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--rw-accent)]"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
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

export function AppNav() {
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
        <div className="flex flex-col gap-1 px-3 pb-4">
          <a
            href="/#how"
            onClick={opts?.onNavigate}
            className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] hover:text-[var(--rw-ink)]"
          >
            How it works
          </a>
          <Link
            href="/communities"
            onClick={opts?.onNavigate}
            className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] hover:text-[var(--rw-ink)]"
          >
            Community
          </Link>
          <a
            href="/#impact"
            onClick={opts?.onNavigate}
            className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] hover:text-[var(--rw-ink)]"
          >
            Sustainability
          </a>
        </div>
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
      <div className="fixed inset-x-0 top-0 z-40 hidden px-4 pt-3 lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-[1.35rem] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 shadow-[0_12px_40px_rgba(23,42,58,0.1)]">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className="shrink-0 rounded-full px-3 py-1.5 text-base font-semibold tracking-tight text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          >
            ReWorth
          </Link>
          <nav aria-label="Primary" className="flex min-w-0 flex-1 justify-center">
            <ul className="flex items-center gap-1">
              {BAR_LINKS.map((item) => {
                const active = item.match(pathname);
                const hash = item.href.includes("#");
                const href =
                  hash && pathname === "/"
                    ? item.href.slice(item.href.indexOf("#"))
                    : item.href;
                const className = [
                  "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                  active
                    ? "bg-[var(--rw-beige)] text-[var(--rw-ink)]"
                    : "text-[var(--rw-ink-muted)] hover:bg-[var(--rw-bg)] hover:text-[var(--rw-ink)]",
                ].join(" ");
                return (
                  <li key={item.href}>
                    {hash ? (
                      <a
                        href={href}
                        className={className}
                        onClick={(event) => {
                          if (pathname !== "/") return;
                          const id = item.href.split("#")[1];
                          const target = document.getElementById(id);
                          if (!target) return;
                          event.preventDefault();
                          const top =
                            target.getBoundingClientRect().top +
                            window.scrollY -
                            112;
                          document.scrollingElement?.scrollTo({
                            top,
                            behavior: "smooth",
                          });
                          history.replaceState(null, "", `/#${id}`);
                        }}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={className}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
          <Link
            href="/chats"
            aria-label="Chats"
            aria-current={pathname.startsWith("/chats") ? "page" : undefined}
            className={[
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
              pathname.startsWith("/chats")
                ? "bg-[var(--rw-beige)] text-[var(--rw-ink)]"
                : "text-[var(--rw-ink)] hover:bg-[var(--rw-bg)]",
            ].join(" ")}
          >
            <Icon name="chats" />
          </Link>
          <NotificationBell count={unreadNotifications} className="" />
          <Link
            href="/sell"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--rw-accent)] px-3.5 py-2 text-sm font-semibold text-[var(--rw-on-accent)] hover:bg-[var(--rw-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2"
          >
            <span aria-hidden>+</span>
            List item
          </Link>
          <AccountMenu pathname={pathname} onLogout={() => void logout()} />
        </div>
      </div>

      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <span className="block h-0.5 w-5 bg-[var(--rw-ink)]" />
          <span className="block h-0.5 w-5 bg-[var(--rw-ink)]" />
          <span className="block h-0.5 w-5 bg-[var(--rw-ink)]" />
        </button>
        <p className="text-base font-semibold tracking-tight">ReWorth</p>
        <NotificationBell count={unreadNotifications} />
      </div>

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
