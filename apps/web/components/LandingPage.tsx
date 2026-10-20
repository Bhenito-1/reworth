"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatNgn } from "@reworth/shared";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2";

type ModeId = "buy" | "sell" | "swap" | "give";
type FilterId = "all" | "swap" | "free" | "under";
type Trade = "swap" | "free" | "sale";

type Listing = {
  id: string;
  title: string;
  image: string;
  badge: string;
  trade: Trade;
  priceLabel: string;
  price: number;
  distance: string;
  body: string;
  seller: string;
  verified?: boolean;
};

const MODES: {
  id: ModeId;
  index: string;
  title: string;
  line: string;
  desktop: string;
  detail: string;
  popular?: boolean;
}[] = [
  {
    id: "buy",
    index: "01",
    title: "Buy",
    line: "Curated treasures at fair prices",
    desktop: "Find what you need, locally.",
    detail:
      "Shop neighbour listings at fair local prices — pieces already in your city, ready to move.",
  },
  {
    id: "sell",
    index: "02",
    title: "Sell",
    line: "List what you no longer need",
    desktop: "List what you no longer need.",
    detail:
      "Photograph it, name a fair price, and let someone nearby give it a second life.",
  },
  {
    id: "swap",
    index: "03",
    title: "Swap",
    line: "Trade items directly with peers",
    desktop: "Trade one item for another.",
    popular: true,
    detail:
      "Equal trade proposals without money exchanging hands. Trade your road bike for an analog synth or swap seasonal wardrobe capsules seamlessly.",
  },
  {
    id: "give",
    index: "04",
    title: "Give away",
    line: "Pass it on for free to a neighbor",
    desktop: "Pass it on for free.",
    detail: "Zero price. A neighbour collects it, and it stays out of the landfill.",
  },
];

/** Paid listings stay at or above this. Free giveaways stay at 0. */
const MIN_NAIRA = 1_000;
const UNDER_NAIRA = 25_000;

function priceLabel(naira: number, prefix?: string) {
  if (naira === 0) return "Free";
  const amount = Math.max(MIN_NAIRA, naira);
  const formatted = formatNgn({ amountNaira: amount });
  return prefix ? `${prefix} ${formatted}` : formatted;
}

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All items" },
  { id: "swap", label: "Direct Swap" },
  { id: "free", label: "Free listings" },
  { id: "under", label: `Under ${formatNgn({ amountNaira: UNDER_NAIRA })}` },
];

const TRENDING: Listing[] = [
  {
    id: "minolta",
    title: "Minolta Hi-Matic 7s",
    image: "/brand/landing/camera.jpg",
    badge: "Wants Synth",
    trade: "swap",
    priceLabel: priceLabel(180_000, "Est. value"),
    price: 180_000,
    distance: "0.4 mi away",
    body: "Flawless shutter. Looking for a Korg Volca or similar.",
    seller: "Maya R.",
    verified: true,
  },
  {
    id: "monstera",
    title: "Monstera Deliciosa",
    image: "/brand/landing/plant.jpg",
    badge: "Free Giveaway",
    trade: "free",
    priceLabel: "Free",
    price: 0,
    distance: "0.6 mi away",
    body: "Healthy rooted cutting, ready for a new window.",
    seller: "Leo S.",
  },
];

const DISCOVERED: Listing[] = [
  {
    id: "olympus",
    title: "Olympus OM-2 Film Camera",
    image: "/brand/landing/camera.jpg",
    badge: "Wants Synth",
    trade: "swap",
    priceLabel: priceLabel(120_000),
    price: 120_000,
    distance: "0.4 mi away",
    body: "35mm body with a working meter. Happy to swap for a synth.",
    seller: "Maya R.",
    verified: true,
  },
  {
    id: "mugs",
    title: "Set of Stoneware Mugs",
    image: "/brand/landing/mugs.jpg",
    badge: "Free Giveaway",
    trade: "free",
    priceLabel: "Free",
    price: 0,
    distance: "0.2 mi away",
    body: "Four handmade mugs. Small chips, honest wear.",
    seller: "Adaeze K.",
  },
  {
    id: "coat",
    title: "Heavy Tailored Wool Overcoat",
    image: "/brand/landing/coat.jpg",
    badge: "For Sale",
    trade: "sale",
    priceLabel: priceLabel(85_000),
    price: 85_000,
    distance: "1.1 mi away",
    body: "Charcoal wool, size M. Worn one season.",
    seller: "Tomi A.",
    verified: true,
  },
  {
    id: "keys",
    title: "Custom Oak Mechanical Keyboard",
    image: "/brand/landing/keys.jpg",
    badge: "For Sale",
    trade: "sale",
    priceLabel: priceLabel(40_000),
    price: 40_000,
    distance: "0.8 mi away",
    body: "Lubed switches in an oak case. Pickup only.",
    seller: "Chinedu O.",
  },
];

const STEPS = [
  {
    title: "Snap & Voice-List",
    body: "Take two photos and say what it is. The listing writes itself — condition, price, and neighbourhood.",
    icon: "camera" as const,
  },
  {
    title: "Match, Sell, or Gift",
    body: "A matcher suggests a trade, a fair price, or a neighbour who will actually use it.",
    icon: "people" as const,
  },
  {
    title: "Pass the Value Forward",
    body: "Meet nearby, swap or sell, and keep the thing in use. One less item in a landfill.",
    icon: "loop" as const,
  },
];

const FOOTER = [
  {
    title: "ReWorth",
    blurb: "The circular marketplace for things you already own.",
    links: [] as { href: string; label: string }[],
  },
  {
    title: "Discover",
    links: [
      { href: "#discover", label: "All listings" },
      { href: "#discover", label: "Live swaps" },
      { href: "#discover", label: "Free giveaways" },
      { href: "#community", label: "Near you" },
    ],
  },
  {
    title: "Movement",
    links: [
      { href: "#how", label: "How it works" },
      { href: "#modes", label: "Circular system" },
      { href: "#community", label: "Community" },
      { href: "#loop", label: "Sustainability" },
    ],
  },
  {
    title: "Trust & Support",
    links: [
      { href: "/onboarding", label: "Buyer protection" },
      { href: "/onboarding", label: "Safe meetup" },
      { href: "/login", label: "Privacy" },
      { href: "/login", label: "Help" },
    ],
  },
];

function matches(item: Listing, filter: FilterId) {
  if (filter === "swap") return item.trade === "swap";
  if (filter === "free") return item.trade === "free";
  if (filter === "under") return item.price < UNDER_NAIRA;
  return true;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d="M12 19.2s-6.4-3.9-6.4-8.1A3.6 3.6 0 0 1 12 8.2a3.6 3.6 0 0 1 6.4 2.9c0 4.2-6.4 8.1-6.4 8.1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModeIcon({ id }: { id: ModeId }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (id === "buy") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M6 8h12l-1 11H7L6 8Z" {...common} />
        <path d="M9 8V7a3 3 0 0 1 6 0v1" {...common} />
      </svg>
    );
  }
  if (id === "sell") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M4 12V6h6l9 9-6 6-9-9Z" {...common} />
        <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === "swap") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5" {...common} />
        <path d="M18 7v4M6 17v-4" {...common} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path d="M12 4v8M8.5 6.5 12 3l3.5 3.5" {...common} />
      <rect x="5" y="12" width="14" height="8" rx="1.5" {...common} />
    </svg>
  );
}

function StepIcon({ name }: { name: (typeof STEPS)[number]["icon"] }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "camera") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M4 9h3l1.5-2h7L17 9h3v10H4V9Z" {...common} />
        <circle cx="12" cy="14" r="3" {...common} />
      </svg>
    );
  }
  if (name === "people") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <circle cx="9" cy="9" r="2.2" {...common} />
        <circle cx="16" cy="10" r="1.8" {...common} />
        <path d="M4.5 18c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6" {...common} />
        <path d="M14 14.6c1.4-.3 2.8.2 3.6 1.6" {...common} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path d="M7 8a6 6 0 0 1 10-2M17 16a6 6 0 0 1-10 2" {...common} />
      <path d="M16 4h3v3M8 20H5v-3" {...common} />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="M8 14s4-3.4 4-6.2A4 4 0 0 0 4 7.8C4 10.6 8 14 8 14Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TradeCard({
  item,
  saved,
  onSave,
}: {
  item: Listing;
  saved: boolean;
  onSave: () => void;
}) {
  const badgeClass =
    item.trade === "free"
      ? "bg-[var(--rw-success)] text-white"
      : item.trade === "swap"
        ? "bg-[var(--rw-navy)] text-white"
        : "bg-[var(--rw-ink)] text-white";

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] shadow-[var(--rw-shadow-float)]">
      <Link
        href="/onboarding"
        className={`flex h-full flex-col rounded-[var(--rw-radius-lg)] ${focus}`}
      >
        <div className="relative aspect-[4/3] bg-[var(--rw-beige)]">
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 22vw, 46vw"
            className="object-cover"
          />
          <span
            className={`absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide ${badgeClass}`}
          >
            {item.badge}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3 lg:p-4">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight lg:text-base">
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-start justify-between gap-1.5 text-[11px] leading-tight lg:text-xs">
            <span className="font-semibold text-[var(--rw-ink)]">{item.priceLabel}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-right text-[var(--rw-ink-muted)]">
              <PinIcon />
              <span className="max-w-[4.2rem] lg:max-w-none">{item.distance}</span>
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--rw-ink-muted)] lg:text-[13px]">
            {item.body}
          </p>
          <p className="mt-auto flex items-center gap-2 pt-3 text-xs">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--rw-beige)] text-[10px] font-semibold text-[var(--rw-navy)]"
              aria-hidden
            >
              {item.seller.slice(0, 1)}
            </span>
            <span className="truncate text-[var(--rw-ink-muted)]">
              {item.seller}
            </span>
            {item.verified ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--rw-success-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--rw-success)]">
                Verified
              </span>
            ) : null}
          </p>
        </div>
      </Link>
      <button
        type="button"
        aria-label={saved ? `Unsave ${item.title}` : `Save ${item.title}`}
        aria-pressed={saved}
        onClick={onSave}
        className={`absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[var(--rw-ink)] shadow-sm ${focus} ${saved ? "text-[var(--rw-accent)]" : ""}`}
      >
        <HeartIcon filled={saved} />
      </button>
    </article>
  );
}

/**
 * Guest entry. Phone layout and desktop layout follow the marketing comps.
 */
export function LandingPage() {
  const [openMode, setOpenMode] = useState<ModeId>("swap");
  const [filter, setFilter] = useState<FilterId>("all");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const discovered = DISCOVERED.filter((item) => matches(item, filter));

  function toggleSave(id: string) {
    setSaved((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <a
        href="#modes"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--rw-radius)] focus:bg-[var(--rw-bg-elevated)] focus:px-3 focus:py-2"
      >
        Skip to ways to trade
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--rw-border)] bg-[var(--rw-bg)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:grid lg:h-16 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
          <Link href="/" className={`flex items-center gap-2 ${focus} rounded-full`}>
            <span className="h-2 w-2 rounded-full bg-[var(--rw-accent)]" aria-hidden />
            <span className="text-base font-semibold tracking-tight">ReWorth</span>
          </Link>

          <nav
            className="hidden items-center gap-8 text-sm text-[var(--rw-ink-muted)] lg:flex"
            aria-label="Primary"
          >
            <a className={`hover:text-[var(--rw-ink)] ${focus} rounded-sm`} href="#how">
              How it works
            </a>
            <a className={`hover:text-[var(--rw-ink)] ${focus} rounded-sm`} href="#discover">
              Explore
            </a>
            <a className={`hover:text-[var(--rw-ink)] ${focus} rounded-sm`} href="#community">
              Community
            </a>
            <a className={`hover:text-[var(--rw-ink)] ${focus} rounded-sm`} href="#loop">
              Sustainability
            </a>
          </nav>

          <div className="flex items-center justify-end gap-2">
            <a
              href="#discover"
              aria-label="Explore listings"
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rw-border)] lg:hidden ${focus}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </a>
            <Link
              href="/login"
              aria-label="Account"
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rw-border)] lg:hidden ${focus}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M6 18.5c1.2-2.2 3-3.3 6-3.3s4.8 1.1 6 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </Link>
            <Link
              href="/login"
              className={`hidden rounded-full px-3 py-2 text-sm font-medium hover:bg-[var(--rw-beige)] lg:inline-flex ${focus}`}
            >
              Login
            </Link>
            <Link
              href="/onboarding"
              className={`hidden min-h-10 items-center rounded-full bg-[var(--rw-accent)] px-4 text-sm font-medium text-white hover:bg-[var(--rw-accent-hover)] lg:inline-flex ${focus}`}
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="pb-24 lg:pb-0">
        <section className="px-4 pt-4 lg:px-0 lg:pt-0">
          <div className="relative isolate min-h-[29rem] overflow-hidden rounded-[1.75rem] lg:min-h-[36rem] lg:rounded-none">
            {/* Full file, not the optimizer crop — the hero is a tall cover. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/landing/hero.jpg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
            />
            <div
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,32,45,0.18)_0%,rgba(16,32,45,0.5)_42%,rgba(16,32,45,0.78)_100%)] lg:bg-[radial-gradient(ellipse_at_center,rgba(16,32,45,0.5)_0%,rgba(16,32,45,0.32)_55%,rgba(16,32,45,0.66)_100%)]"
              aria-hidden
            />
            <div className="relative flex min-h-[29rem] flex-col justify-end px-5 pb-14 pt-8 text-white lg:min-h-[36rem] lg:items-center lg:justify-center lg:px-6 lg:pb-16 lg:pt-16 lg:text-center">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur-sm lg:text-[11px]">
                <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                  <span className="rw-beep absolute inline-flex h-full w-full rounded-full bg-[var(--rw-accent)]" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--rw-accent)]" />
                </span>
                Buy, sell, swap, or give away
              </p>
              <h1 className="mt-4 text-[1.85rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:max-w-[12em] lg:text-[3.15rem] lg:leading-[1.05]">
                Your unused things are worth something.
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85 lg:max-w-xl lg:text-base">
                <span className="lg:hidden">
                  A circular marketplace built for neighbour swaps, vintage finds, and giving joyful second lives to things you love.
                </span>
                <span className="hidden lg:inline">
                  A new chance for the things you no longer need.
                </span>
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2 lg:hidden">
                <Link
                  href="/login"
                  className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--rw-accent)] px-4 text-sm font-medium text-white hover:bg-[var(--rw-accent-hover)] ${focus}`}
                >
                  Login
                </Link>
                <Link
                  href="/onboarding"
                  className={`inline-flex min-h-11 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-white/80 px-2.5 text-[13px] font-medium hover:bg-white/10 sm:px-3 sm:text-sm ${focus}`}
                >
                  Create account
                  <ArrowIcon />
                </Link>
              </div>
              <div className="mt-8 hidden gap-3 lg:flex">
                <Link
                  href="/onboarding"
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--rw-accent)] px-5 text-sm font-medium text-white hover:bg-[var(--rw-accent-hover)] ${focus}`}
                >
                  Get started free
                  <ArrowIcon />
                </Link>
                <Link
                  href="/login"
                  className={`inline-flex min-h-11 items-center rounded-full border border-white/50 bg-white/10 px-5 text-sm font-medium backdrop-blur-sm hover:bg-white/20 ${focus}`}
                >
                  Login
                </Link>
              </div>

              <p className="mt-5 inline-flex items-center gap-2 text-xs text-white/90 lg:hidden">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--rw-success)] text-[10px] text-white" aria-hidden>
                  ✓
                </span>
                16,390+ items successfully re-homed this month
              </p>
              <ul className="mt-6 hidden flex-wrap justify-center gap-2 lg:flex" aria-label="ReWorth this month">
                {["16.3k+ rehomed", "2.4k items saved", "100% circular"].map((stat) => (
                  <li
                    key={stat}
                    className="rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-sm backdrop-blur-sm"
                  >
                    {stat}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <ul
            className="relative z-10 -mt-7 grid grid-cols-2 gap-2 lg:hidden"
            aria-label="ReWorth this month"
          >
            <li className="rounded-2xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-3 shadow-[var(--rw-shadow-float)]">
              <p className="text-lg font-semibold tracking-tight">28.4k</p>
              <p className="text-[11px] leading-snug text-[var(--rw-ink-muted)]">
                Items saved from landfill
              </p>
            </li>
            <li className="rounded-2xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-3 shadow-[var(--rw-shadow-float)]">
              <p className="text-lg font-semibold tracking-tight">9,410</p>
              <p className="text-[11px] leading-snug text-[var(--rw-ink-muted)]">
                Active swappers
              </p>
            </li>
          </ul>
        </section>

        <section id="modes" className="scroll-mt-20 px-4 pb-4 pt-10 lg:mx-auto lg:max-w-7xl lg:px-8 lg:pt-16">
          <div className="mb-4 lg:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rw-ink-muted)]">
              Circular system
            </p>
            <h2 className="mt-1 text-[1.7rem] font-semibold tracking-tight">
              The 4 ways to trade
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--rw-ink-muted)]">
              Tap any trade card to preview how ReWorth empowers circular ownership.
            </p>
          </div>

          <div className="rounded-[1.75rem] bg-[var(--rw-navy-dark)] p-2 text-white lg:p-8">
            <div className="hidden items-end justify-between gap-8 lg:flex">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rw-accent)]">
                  Circular exchange
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Choose your circular exchange mode
                </h2>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-white/70">
                When you sell, swap, or give, a neighbour re-homes what you no longer need.
              </p>
            </div>

            <ul className="flex flex-col gap-1 lg:mt-8 lg:grid lg:grid-cols-4 lg:gap-4">
              {MODES.map((mode) => {
                const open = openMode === mode.id;
                return (
                  <li key={mode.id} className="lg:h-full">
                    <div
                      className={`rounded-2xl lg:hidden ${open ? "bg-white/5 ring-1 ring-[var(--rw-accent)]" : ""}`}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenMode(mode.id)}
                        className={`flex w-full items-center gap-3 px-3 py-3.5 text-left ${focus}`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-[var(--rw-accent)]">
                          {mode.index}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold">{mode.title}</span>
                          <span className="block truncate text-xs text-white/65">{mode.line}</span>
                        </span>
                        <svg
                          viewBox="0 0 16 16"
                          className={`h-4 w-4 shrink-0 text-white/70 transition-transform ${open ? "rotate-180" : ""}`}
                          fill="none"
                          aria-hidden
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </button>
                      {open ? (
                        <div className="px-3 pb-4 pl-14">
                          <p className="text-sm leading-relaxed text-white/75">{mode.detail}</p>
                          {mode.id === "swap" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Link
                                href="/onboarding"
                                className={`inline-flex min-h-9 items-center rounded-full bg-[var(--rw-accent)] px-3 text-xs font-medium text-white hover:bg-[var(--rw-accent-hover)] ${focus}`}
                              >
                                Balanced Swap Matcher
                              </Link>
                              <Link
                                href="/login"
                                className={`inline-flex min-h-9 items-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-medium hover:bg-white/15 ${focus}`}
                              >
                                Direct Chat
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="hidden h-full flex-col rounded-2xl bg-white/5 p-5 lg:flex">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/45">{mode.index}</span>
                        {mode.popular ? (
                          <span className="rounded-full bg-[var(--rw-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            Popular
                          </span>
                        ) : null}
                      </div>
                      <span className="mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[var(--rw-accent)]">
                        <ModeIcon id={mode.id} />
                      </span>
                      <p className="mt-4 text-lg font-semibold">{mode.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/65">{mode.desktop}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="community" className="scroll-mt-20 px-4 py-8 lg:mx-auto lg:max-w-7xl lg:px-8 lg:py-16">
          <div id="discover" className="scroll-mt-20" />
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rw-ink-muted)] lg:hidden">
                Community feed
              </p>
              <h2 className="mt-1 text-[1.7rem] font-semibold tracking-tight lg:text-3xl">
                <span className="lg:hidden">Trending Trades</span>
                <span className="hidden lg:inline">Recently discovered & ready to move</span>
              </h2>
            </div>
            <Link
              href="/onboarding"
              className={`shrink-0 text-sm font-medium text-[var(--rw-accent)] lg:hidden ${focus} rounded-sm`}
            >
              View all
            </Link>
            <div className="hidden gap-2 lg:flex" role="group" aria-label="Filter listings">
              {FILTERS.map((item) => {
                const active = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.id)}
                    className={`rounded-full px-3 py-1.5 text-sm ${focus} ${
                      active
                        ? "bg-[var(--rw-navy)] text-white"
                        : "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink-muted)] ring-1 ring-[var(--rw-border)] hover:text-[var(--rw-ink)]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-3 lg:hidden">
            {TRENDING.map((item) => (
              <li key={item.id}>
                <TradeCard
                  item={item}
                  saved={Boolean(saved[item.id])}
                  onSave={() => toggleSave(item.id)}
                />
              </li>
            ))}
          </ul>
          <ul className="hidden gap-5 lg:grid lg:grid-cols-4">
            {discovered.map((item) => (
              <li key={item.id}>
                <TradeCard
                  item={item}
                  saved={Boolean(saved[item.id])}
                  onSave={() => toggleSave(item.id)}
                />
              </li>
            ))}
          </ul>
          {discovered.length === 0 ? (
            <p className="mt-6 hidden text-sm text-[var(--rw-ink-muted)] lg:block">
              Nothing in this lane yet.
            </p>
          ) : null}
        </section>

        <section id="how" className="scroll-mt-20 hidden px-8 py-8 lg:block">
          <div className="mx-auto max-w-7xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rw-accent)]">
              Zero-friction philosophy
            </p>
            <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight">
              How ReWorth works in 3 bubbly steps
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-relaxed text-[var(--rw-ink-muted)]">
              Pass your goods into hands that cherish them, while earning credit or items you truly love.
            </p>
            <ol className="mt-8 grid grid-cols-3 gap-5">
              {STEPS.map((step) => (
                <li
                  key={step.title}
                  className="rounded-[1.5rem] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-6 shadow-[var(--rw-shadow-float)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--rw-accent-muted)] text-[var(--rw-accent)]">
                    <StepIcon name={step.icon} />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--rw-ink-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-4 lg:hidden">
          <div className="flex gap-3 rounded-[1.5rem] bg-[var(--rw-beige)] p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--rw-accent)] text-white">
              <StepIcon name="loop" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Keep goods out of landfills
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--rw-ink-muted)]">
                Join your local neighbourhood swapping circle and meet generous people nearby.
              </p>
            </div>
          </div>
        </section>

        <section id="loop" className="scroll-mt-20 hidden px-8 py-8 lg:block">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-[1.75rem] bg-[linear-gradient(105deg,#e07a45_0%,#d96a32_48%,#c45c2a_100%)] px-10 py-10 text-white sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
                Start clean. Buy clean. Loop.
              </p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
                Clear your shelves. Replenish your home. Zero landfill guilt.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                Join over 28,000 circular swappers redefining what unused things can do.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/onboarding"
                className={`inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-[var(--rw-navy)] hover:bg-[var(--rw-bg)] ${focus}`}
              >
                Create an Account
              </Link>
              <a
                href="#discover"
                className={`inline-flex min-h-11 items-center rounded-full border border-white/70 px-5 text-sm font-medium hover:bg-white/10 ${focus}`}
              >
                Browse Nearby Swaps
              </a>
            </div>
          </div>
        </section>

        <footer className="mt-8 hidden border-t border-[var(--rw-border)] lg:block">
          <div className="mx-auto grid max-w-7xl gap-8 px-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {FOOTER.map((col) => (
              <div key={col.title}>
                <p className="text-sm font-semibold">{col.title}</p>
                {col.blurb ? (
                  <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-[var(--rw-ink-muted)]">
                    {col.blurb}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className={`text-sm text-[var(--rw-ink-muted)] hover:text-[var(--rw-ink)] ${focus} rounded-sm`}
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--rw-border)]">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-8 py-4 text-xs text-[var(--rw-ink-muted)]">
              <p>© 2026 ReWorth. All rights reserved.</p>
              <p className="flex gap-4">
                <Link href="/login" className={focus}>
                  Terms of Service
                </Link>
                <Link href="/login" className={focus}>
                  Privacy
                </Link>
                <Link href="/login" className={focus}>
                  Security
                </Link>
                <Link href="/login" className={focus}>
                  Cookie Policy
                </Link>
              </p>
            </div>
          </div>
        </footer>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rw-border)] bg-[var(--rw-bg)]/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        aria-label="Get started"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <a
            href="#community"
            aria-label="Locate nearby trades"
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-[var(--rw-border)] ${focus}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </a>
          <Link href="/login" className={`text-sm font-medium ${focus} rounded-sm px-2 py-2`}>
            Login
          </Link>
          <Link
            href="/onboarding"
            className={`inline-flex min-h-11 items-center rounded-full bg-[var(--rw-accent)] px-5 text-sm font-medium text-white hover:bg-[var(--rw-accent-hover)] ${focus}`}
          >
            Start Trading
          </Link>
        </div>
      </nav>
    </div>
  );
}
