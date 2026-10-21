"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, EmptyState, Skeleton, Toast } from "@reworth/ui-web";
import { DiscoveryListingCard } from "./DiscoveryListingCard";
import { ApiError, apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "../../lib/areas";
import {
  RADIUS_OPTIONS,
  fetchCategories,
  fetchHome,
  favouriteListing,
  getMeFavourites,
  looksLikeNaturalLanguage,
  unfavouriteListing,
  type DiscoveryLocation,
} from "../../lib/discovery";
import { getRegion, listRegions, type RegionCity } from "../../lib/region";
import { formatNgn } from "@reworth/shared";
import { addToCart } from "../../lib/cart";
import type { CategoryNode, HomeRail, MeResponse, RadiusKm } from "../../lib/types";

function listingInCategory(
  item: { category: { id: string; slug: string } | null },
  selected: { id: string; slug: string },
): boolean {
  const category = item.category;
  if (!category) return false;
  if (category.id === selected.id) return true;
  const parent = category.slug.split("--")[0];
  return parent === selected.slug || category.slug === selected.slug;
}

function sellerCatalogue(rails: HomeRail[]): HomeRail[] {
  return rails.filter((rail) => rail.id !== "my_listed_products");
}

const LAGOS_HOTSPOTS = areaChoices("lagos", FALLBACK_AREAS.lagos ?? []);

function widerRadius(current: DiscoveryLocation["radiusKm"]) {
  const order = RADIUS_OPTIONS.map((option) => option.value);
  const index = order.indexOf(current);
  if (index < 0 || index >= order.length - 1) return order[order.length - 1];
  return order[index + 1];
}

export function DiscoveryHomePage() {
  const router = useRouter();

  const [loc, setLoc] = useState<DiscoveryLocation>({
    city: "",
    community: "",
    radiusKm: "all",
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const [regions, setRegions] = useState<RegionCity[]>([]);
  const [draftState, setDraftState] = useState("");
  const [draftArea, setDraftArea] = useState("");
  const [areaOptions, setAreaOptions] = useState<AreaChoice[]>([]);
  const [query, setQuery] = useState("");
  const [useNl, setUseNl] = useState(false);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryNode | null>(
    null,
  );
  const [swapOnly, setSwapOnly] = useState(false);
  const [rails, setRails] = useState<HomeRail[]>([]);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    void apiFetch<MeResponse>("/me", { token })
      .then((me) => {
        if (!cancelled) setMeId(me.id);
      })
      .catch(() => {
        if (!cancelled) setMeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onClear = () => {
      setLoc({ city: "", community: "", radiusKm: "all" });
      setLocationOpen(false);
    };
    window.addEventListener("reworth-home-location-cleared", onClear);
    return () =>
      window.removeEventListener("reworth-home-location-cleared", onClear);
  }, []);

  const load = useCallback(async (
    location: DiscoveryLocation,
    opts?: { silent?: boolean },
  ) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const radiusKm =
        location.radiusKm === "all"
          ? undefined
          : (location.radiusKm as RadiusKm);
      const [home, cats] = await Promise.all([
        fetchHome(
          {
            community: location.community || undefined,
            city: location.community ? location.city || undefined : undefined,
            radiusKm,
          },
          getAccessToken(),
        ),
        fetchCategories().catch(() => [] as CategoryNode[]),
      ]);
      setRails(sellerCatalogue(home.rails ?? []));
      setCategories(cats);
      if (getAccessToken()) {
        const favs = await getMeFavourites(getAccessToken()!).catch(() => null);
        setFavourites(
          new Set(favs?.items.map((item) => item.listing.id) ?? []),
        );
      }
    } catch (err) {
      if (opts?.silent) return;
      setError(err instanceof ApiError ? err.message : "Could not load home");
      setRails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(loc);
  }, [loc, load]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void load(loc, { silent: true });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [loc, load]);

  function updateLoc(next: DiscoveryLocation) {
    setLoc(next);
  }

  function openLocation() {
    setDraftState("");
    setDraftArea(loc.community);
    setLocationOpen(true);
    void listRegions()
      .then((items) => {
        const list =
          items.length > 0
            ? items
            : FALLBACK_STATES.map((item) => ({
                key: item.key,
                city: item.key,
                displayName: item.displayName,
              }));
        setRegions(list);
        if (loc.city) {
          const match = list.find(
            (item) =>
              item.displayName === loc.city ||
              item.city === loc.city ||
              item.key === loc.city,
          );
          if (match) setDraftState(match.city || match.key);
        }
      })
      .catch(() => {
        setRegions(
          FALLBACK_STATES.map((item) => ({
            key: item.key,
            city: item.key,
            displayName: item.displayName,
          })),
        );
      });
  }

  useEffect(() => {
    if (!draftState) {
      setAreaOptions([]);
      return;
    }
    let cancelled = false;
    void getRegion(draftState)
      .then((detail) => {
        if (cancelled) return;
        const source =
          detail?.areas && detail.areas.length > 0
            ? detail.areas
            : (FALLBACK_AREAS[draftState] ?? []);
        setAreaOptions(areaChoices(draftState, source));
      })
      .catch(() => {
        if (!cancelled) {
          setAreaOptions(
            areaChoices(draftState, FALLBACK_AREAS[draftState] ?? []),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draftState]);

  const locationLabel = loc.community
    ? `${loc.community}, ${loc.city || "selected state"} · Change`
    : "Filter items by location";

  async function toggleFavourite(listing: { id: string }) {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to save listings", tone: "warn" });
      return;
    }
    const isFav = favourites.has(listing.id);
    setFavourites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(listing.id);
      else next.add(listing.id);
      return next;
    });
    try {
      if (isFav) await unfavouriteListing(listing.id, token);
      else await favouriteListing(listing.id, token);
      setToast({
        message: isFav ? "Removed from wishlist" : "Added to wishlist",
        tone: "success",
      });
    } catch (err) {
      setFavourites((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(listing.id);
        else next.delete(listing.id);
        return next;
      });
      setToast({
        message: err instanceof ApiError ? err.message : "Could not update",
        tone: "error",
      });
    }
  }

  async function addListingToCart(listing: { id: string }) {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to use the cart", tone: "warn" });
      return;
    }
    try {
      await addToCart(token, listing.id, 1);
      setToast({ message: "Added to cart", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not add to cart",
        tone: "error",
      });
    }
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (loc.community) params.set("community", loc.community);
    if (loc.radiusKm !== "all") params.set("radiusKm", String(loc.radiusKm));
    const nl = useNl || looksLikeNaturalLanguage(q);
    if (nl && q) params.set("nl", "1");
    router.push(`/search?${params.toString()}`);
  }

  const filtering = Boolean(categoryFilter) || swapOnly;
  const orderedRails = [...rails]
    .filter((rail) => !filtering || rail.id !== "moving_sales")
    .map((rail) => ({
      ...rail,
      items: rail.items.filter((item) => {
        if (swapOnly && item.sellingMode !== "SWAP") return false;
        if (categoryFilter && !listingInCategory(item, categoryFilter)) {
          return false;
        }
        return true;
      }),
    }))
    .filter((rail) => {
      if (!filtering) return true;
      if (rail.id === "moving_sales") {
        return (rail.movingSales?.length ?? 0) > 0 || rail.items.length > 0;
      }
      return rail.items.length > 0;
    })
    .sort((a, b) => {
      const rank = (id: string) =>
        id === "just_listed" ? 0 : id === "price_drops" ? 1 : 2;
      return rank(a.id) - rank(b.id);
    });
  const swapCount = new Set(
    rails.flatMap((rail) =>
      rail.items
        .filter((item) => item.sellingMode === "SWAP")
        .map((item) => item.id),
    ),
  ).size;
  const nextRadius = widerRadius(loc.radiusKm);
  const nextRadiusLabel =
    RADIUS_OPTIONS.find((option) => option.value === nextRadius)?.label ??
    "All Lagos";
  const alertParams = new URLSearchParams();
  if (loc.community) alertParams.set("community", loc.community);
  if (loc.city) alertParams.set("city", loc.city);
  if (loc.radiusKm !== "all") alertParams.set("radiusKm", String(loc.radiusKm));
  const alertHref = alertParams.toString()
    ? `/search?${alertParams.toString()}`
    : "/search";
  const proximityTitle =
    loc.radiusKm === 2
      ? "Looking near your immediate street?"
      : loc.radiusKm === "all"
        ? "Looking across Lagos?"
        : `Looking within ${loc.radiusKm} km?`;

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
        <header className="flex items-center gap-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            ReWorth
          </Link>
          <nav
            aria-label="Discover"
            className="hidden items-center gap-6 text-sm text-[var(--rw-ink-muted)] md:flex"
          >
            <a href="#how" className="hover:text-[var(--rw-ink)]">
              How it Works
            </a>
            <Link href="/search" className="hover:text-[var(--rw-ink)]">
              Explore
            </Link>
            <Link href="/communities" className="hover:text-[var(--rw-ink)]">
              Community
            </Link>
            <a href="#impact" className="hover:text-[var(--rw-ink)]">
              Sustainability
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/account"
              className="text-sm font-medium text-[var(--rw-ink-muted)] hover:text-[var(--rw-ink)]"
            >
              Account
            </Link>
            <Link
              href="/sell"
              className="rounded-full bg-[var(--rw-accent)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2"
            >
              Get Started
            </Link>
            <Link
              href="/account"
              aria-label="Your account"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] text-sm font-semibold"
            >
              <span aria-hidden>R</span>
            </Link>
          </div>
        </header>

        <section className="pt-6">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--rw-ink-muted)]">
            CIRCULAR MARKETPLACE · LAGOS CHAPTER
          </p>
          <h1 className="mt-3 max-w-[14ch] text-4xl font-semibold tracking-tight sm:text-5xl">
            Find something worth keeping.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--rw-ink-muted)] sm:text-base">
            Lagos, your unused things are worth something. Swap gadgets, refresh
            your wardrobe, or give treasures a second life without waste.
          </p>
          <form
            onSubmit={submitSearch}
            role="search"
            className="mt-6 flex flex-wrap items-center gap-2 rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 shadow-[0_8px_24px_rgba(23,42,58,0.05)] sm:flex-nowrap sm:px-4"
          >
            <label htmlFor="home-search" className="sr-only">
              Search listings
            </label>
            <svg
              viewBox="0 0 24 24"
              className="hidden h-4 w-4 shrink-0 text-[var(--rw-ink-muted)] sm:block"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              id="home-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items, brands, vintage tech, or office desk Ikeja"
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm focus-visible:outline-none"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--rw-ink-muted)]">
              <input
                type="checkbox"
                checked={useNl}
                onChange={(e) => setUseNl(e.target.checked)}
                className="accent-[var(--rw-accent)]"
              />
              NL search
            </label>
            <Button type="submit" variant="primary" size="sm">
              Explore
            </Button>
          </form>
          <nav
            aria-label="AI & platform tools"
            className="mt-4 flex flex-wrap gap-2"
          >
            {[
              { href: "/ask", label: "Ask ReWorth (AI)" },
              { href: "/room-scan", label: "Room scan (AR camera)" },
              { href: "/worth", label: "What's it worth?" },
              { href: "/consign", label: "Consign / list item" },
            ].map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              >
                {tool.label}
              </Link>
            ))}
          </nav>
        </section>

        <section aria-label="Location" className="mt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-start gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => (locationOpen ? setLocationOpen(false) : openLocation())}
              className="rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              aria-expanded={locationOpen}
              aria-haspopup="dialog"
            >
              {locationLabel} ▾
            </button>
            {locationOpen ? (
              <div
                role="dialog"
                aria-label="Choose a location"
                className="absolute left-0 z-20 mt-2 w-[min(100vw-2rem,22rem)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 shadow-lg"
              >
                <p className="text-sm text-[var(--rw-ink-muted)]">
                  Pick a state, then an area. Home keeps showing every listing until you apply this.
                </p>
                <p className="mt-3 text-sm font-semibold">State</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(regions.length > 0
                    ? regions
                    : FALLBACK_STATES.map((item) => ({
                        key: item.key,
                        city: item.key,
                        displayName: item.displayName,
                      }))
                  ).map((item) => {
                    const key = item.city || item.key;
                    const selected = draftState === key;
                    return (
                      <Chip
                        key={key}
                        selected={selected}
                        onClick={() => {
                          setDraftState(key);
                          setDraftArea("");
                        }}
                      >
                        {item.displayName}
                      </Chip>
                    );
                  })}
                </div>
                {draftState ? (
                  <>
                    <p className="mt-3 text-sm font-semibold">Area</p>
                    {areaOptions.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                        No areas are available for this state yet.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {areaOptions.map((area) => (
                          <Chip
                            key={area.value}
                            selected={draftArea === area.value}
                            onClick={() => setDraftArea(area.value)}
                          >
                            {area.label}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                    Select a state to see its areas.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!draftState || !draftArea}
                    onClick={() => {
                      const state = (
                        regions.length > 0
                          ? regions
                          : FALLBACK_STATES.map((item) => ({
                              key: item.key,
                              city: item.key,
                              displayName: item.displayName,
                            }))
                      ).find((item) => (item.city || item.key) === draftState);
                      if (!state || !draftArea) return;
                      updateLoc({
                        ...loc,
                        city: state.displayName,
                        community: draftArea,
                      });
                      setLocationOpen(false);
                    }}
                  >
                    Show this area
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      updateLoc({ ...loc, city: "", community: "" });
                      setLocationOpen(false);
                    }}
                  >
                    Show all areas
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Radius">
            <span className="self-center text-xs font-medium text-[var(--rw-ink-muted)]">
              Radius
            </span>
            {RADIUS_OPTIONS.map((opt) => (
              <Chip
                key={String(opt.value)}
                selected={loc.radiusKm === opt.value}
                onClick={() => updateLoc({ ...loc, radiusKm: opt.value })}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs font-medium text-[var(--rw-ink-muted)] sm:mr-0">
              Hotspots
            </span>
            {LAGOS_HOTSPOTS.map((area) => (
              <button
                key={area.value}
                type="button"
                aria-pressed={loc.community === area.value}
                onClick={() =>
                  updateLoc({
                    ...loc,
                    city: "Lagos",
                    community: loc.community === area.value ? "" : area.value,
                  })
                }
                className={[
                  "rounded-full px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                  loc.community === area.value
                    ? "bg-[var(--rw-ink)] text-white"
                    : "text-[var(--rw-ink-muted)] hover:text-[var(--rw-ink)]",
                ].join(" ")}
              >
                {area.label}
              </button>
            ))}
          </div>
          </div>
        </section>

        <section
          aria-label="Proximity"
          className="mt-5 grid gap-3 lg:grid-cols-[1.15fr_1fr]"
        >
          <div className="relative min-h-48 overflow-hidden rounded-3xl border border-[var(--rw-border)] bg-[#e4efe4]">
            <svg
              viewBox="0 0 640 280"
              className="absolute inset-0 h-full w-full"
              aria-hidden
            >
              <path
                d="M40 200c80-90 140-40 210-70s90-80 170-60 120 40 180 10"
                fill="none"
                stroke="#7aa37a"
                strokeWidth="28"
                strokeLinecap="round"
                opacity="0.45"
              />
              <path
                d="M20 90c120 20 160 80 250 70s140-60 230-20 90 40 120 20"
                fill="none"
                stroke="#c5d7c2"
                strokeWidth="36"
                strokeLinecap="round"
              />
              <circle cx="210" cy="130" r="7" fill="#172a3a" />
              <circle cx="340" cy="108" r="7" fill="#d96a32" />
              <circle cx="430" cy="150" r="6" fill="#172a3a" />
            </svg>
            <p className="absolute bottom-3 left-3 rounded-full bg-[var(--rw-bg-elevated)]/95 px-3 py-1 text-xs font-semibold shadow-sm">
              Live now: {loc.community || loc.city || "Lagos Island & Mainland"}
            </p>
          </div>
          <div className="flex flex-col justify-center rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5 sm:p-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--rw-accent)]">
              PROXIMITY
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {proximityTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--rw-ink-muted)]">
              {loc.community
                ? `Showing listings around ${loc.community}. Widen the radius if this street is quiet.`
                : "Pick a hotspot or widen the radius to see more of Lagos. Home stays city-wide until you do."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {nextRadius !== loc.radiusKm ? (
                <button
                  type="button"
                  onClick={() => updateLoc({ ...loc, radiusKm: nextRadius })}
                  className="text-sm font-semibold text-[var(--rw-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                >
                  Expand to {nextRadiusLabel}
                </button>
              ) : null}
              <Link
                href={alertHref}
                className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
              >
                Set alert for my neighbourhood
              </Link>
            </div>
          </div>
        </section>

        <section aria-label="Categories" className="mt-6">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              aria-pressed={!categoryFilter && !swapOnly}
              onClick={() => {
                setCategoryFilter(null);
                setSwapOnly(false);
              }}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                !categoryFilter && !swapOnly
                  ? "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)] shadow-sm"
                  : "text-[var(--rw-ink-muted)]",
              ].join(" ")}
            >
              All discoveries
            </button>
            {categories.length === 0 && loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-9 w-24 shrink-0 rounded-full"
                    label="Loading category"
                  />
                ))
              : categories.map((cat) => {
                  const selected = categoryFilter?.id === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setSwapOnly(false);
                        setCategoryFilter((current) =>
                          current?.id === cat.id ? null : cat,
                        );
                      }}
                      className={[
                        "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                        selected
                          ? "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)] shadow-sm"
                          : "text-[var(--rw-ink-muted)]",
                      ].join(" ")}
                    >
                      {cat.name}
                    </button>
                  );
                })}
            <button
              type="button"
              aria-pressed={swapOnly}
              onClick={() => {
                setCategoryFilter(null);
                setSwapOnly((current) => !current);
              }}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]",
                swapOnly
                  ? "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)] shadow-sm"
                  : "text-[var(--rw-ink-muted)]",
              ].join(" ")}
            >
              Swap only{swapCount ? ` (${swapCount})` : ""}
            </button>
          </div>
        </section>

        {error ? (
          <div className="mt-12">
            <EmptyState
              title="Couldn’t load discovery"
              description={error}
              action={
                <Button variant="primary" onClick={() => void load(loc)}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : loading ? (
          <div className="mt-8 space-y-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-4 h-6 w-40" label="Loading rail" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <Skeleton
                      key={j}
                      className="h-64 rounded-2xl"
                      label="Loading card"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-10">
            {orderedRails.map((rail) => {
              const isMovingSales = rail.id === "moving_sales";
              const movingSales = rail.movingSales ?? [];
              const hasMoving = isMovingSales && movingSales.length > 0;
              const hasListings = rail.items.length > 0;
              const empty = isMovingSales
                ? !hasMoving && !hasListings
                : !hasListings;

              const priceDrop = rail.id === "price_drops";
              return (
                <section
                  key={rail.id}
                  aria-labelledby={`rail-${rail.id}`}
                  className={
                    priceDrop
                      ? "rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 sm:p-5"
                      : undefined
                  }
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      {priceDrop ? (
                        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--rw-accent)]">
                          RECENT REDUCTIONS
                        </p>
                      ) : rail.id === "just_listed" ? (
                        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--rw-ink-muted)]">
                          REAL-TIME FEED
                        </p>
                      ) : null}
                      <h2
                        id={`rail-${rail.id}`}
                        className="text-xl font-semibold tracking-tight"
                      >
                        {rail.title}
                      </h2>
                    </div>
                    {rail.id === "just_listed" ? (
                      <Link
                        href="/search?sort=newest"
                        className="shrink-0 text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
                      >
                        View all shop drops
                      </Link>
                    ) : null}
                  </div>
                  {empty ? (
                    <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                      {rail.emptyMessage ?? "Nothing here yet."}
                    </p>
                  ) : (
                    <>
                      {hasMoving ? (
                        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {movingSales.map((ms) => (
                            <li key={ms.id} className="min-w-0">
                              <Link
                                href={`/moving-sales/${ms.id}`}
                                className="block rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                              >
                                <p className="line-clamp-2 font-semibold leading-snug">
                                  {ms.title}
                                </p>
                                <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                                  {ms.itemCount} item
                                  {ms.itemCount === 1 ? "" : "s"} ·{" "}
                                  {formatNgn({
                                    amountKobo: ms.combinedPriceKobo,
                                  })}{" "}
                                  combined
                                </p>
                                {ms.community ? (
                                  <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
                                    {ms.community}
                                  </p>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {hasListings ? (
                        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                          {rail.items.map((item) => {
                            const own = meId != null && item.seller.id === meId;
                            return (
                              <li key={item.id} className="min-w-0">
                                <DiscoveryListingCard
                                  listing={item}
                                  favourited={favourites.has(item.id)}
                                  onToggleFavourite={
                                  own
                                    ? undefined
                                    : (listing) => void toggleFavourite(listing)
                                }
                                  onAddToCart={
                                    own
                                      ? undefined
                                      : (listing) => void addListingToCart(listing)
                                  }
                                />
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </>
                  )}
                </section>
              );
            })}
            {rails.length === 0 ? (
              <EmptyState
                title="No listings nearby"
                description="Try another community or be the first to sell."
                action={
                  <Link href="/sell">
                    <Button variant="sell">Sell</Button>
                  </Link>
                }
              />
            ) : filtering && orderedRails.every((rail) => rail.items.length === 0) ? (
              <EmptyState
                title={
                  categoryFilter
                    ? `No ${categoryFilter.name} items`
                    : "No swap items"
                }
                description="Nothing in this filter is on the homepage right now."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCategoryFilter(null);
                      setSwapOnly(false);
                    }}
                  >
                    Show all items
                  </Button>
                }
              />
            ) : null}
          </div>
        )}

        <section
          id="how"
          aria-label="How ReWorth works here"
          className="mt-12 grid gap-3 md:grid-cols-3"
        >
          <article
            id="impact"
            className="rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5"
          >
            <h2 className="font-semibold">Lagos safe swap hubs</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--rw-ink-muted)]">
              Meet at known neighbourhoods — Lekki, Ikoyi, and VI — and keep the
              handoff in the chat.
            </p>
          </article>
          <article className="rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5">
            <h2 className="font-semibold">Zero cash swaps</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--rw-ink-muted)]">
              Trade item for item. No bank transfer and no hidden fee on a pure
              swap.
            </p>
          </article>
          <article className="rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5">
            <h2 className="font-semibold">Carbon tracked</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--rw-ink-muted)]">
              A swap keeps the thing in use instead of sending it to landfill.
            </p>
          </article>
        </section>

        <footer className="mt-10 rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-5 py-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-semibold">ReWorth</p>
              <p className="mt-2 text-sm leading-6 text-[var(--rw-ink-muted)]">
                Lagos, your unused things are worth something.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Discover</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--rw-ink-muted)]">
                <li><Link href="/search" className="hover:text-[var(--rw-ink)]">Current items</Link></li>
                <li><Link href="/communities" className="hover:text-[var(--rw-ink)]">Communities</Link></li>
                <li><Link href="/wishlist" className="hover:text-[var(--rw-ink)]">Wishlist</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Movement</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--rw-ink-muted)]">
                <li><Link href="/ask" className="hover:text-[var(--rw-ink)]">Ask ReWorth</Link></li>
                <li><Link href="/worth" className="hover:text-[var(--rw-ink)]">What&apos;s it worth</Link></li>
                <li><Link href="/consign" className="hover:text-[var(--rw-ink)]">Consign</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Trust & support</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--rw-ink-muted)]">
                <li><Link href="/settings/privacy" className="hover:text-[var(--rw-ink)]">Privacy</Link></li>
                <li><Link href="/account" className="hover:text-[var(--rw-ink)]">Account</Link></li>
                <li><Link href="/orders" className="hover:text-[var(--rw-ink)]">Orders</Link></li>
              </ul>
            </div>
          </div>
          <p className="mt-6 text-xs text-[var(--rw-ink-muted)]">© 2026 ReWorth</p>
        </footer>
      </div>
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 lg:left-[calc(50%+var(--rw-sidebar-offset,0px))]">
          <Toast
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </main>
  );
}
