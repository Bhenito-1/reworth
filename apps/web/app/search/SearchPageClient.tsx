"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { nairaToKobo } from "@reworth/shared";
import {
  Button,
  Chip,
  EmptyState,
  Input,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { DiscoveryListingCard } from "../../components/discovery/DiscoveryListingCard";
import { ApiError, apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { addToCart } from "../../lib/cart";
import { COMMUNITIES } from "../../lib/communities";
import {
  RADIUS_OPTIONS,
  SORT_OPTIONS,
  buildSearchQueryString,
  compactFilters,
  createSavedSearch,
  favouriteListing,
  looksLikeNaturalLanguage,
  searchFiltersFromParams,
  searchListings,
  searchNl,
  unfavouriteListing,
} from "../../lib/discovery";
import { CONDITIONS, CONDITION_LABELS } from "../../lib/listings";
import type {
  MeResponse,
  PublicListing,
  RadiusKm,
  SearchFilters,
  SearchResult,
} from "../../lib/types";

function filtersToUrl(filters: SearchFilters, nl?: boolean): string {
  const compact = compactFilters(filters);
  const qs = buildSearchQueryString(compact);
  if (!nl) return `/search${qs || ""}`;
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  params.set("nl", "1");
  return `/search?${params.toString()}`;
}

export default function SearchPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<SearchFilters>(() =>
    searchFiltersFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [useNl, setUseNl] = useState(() => searchParams.get("nl") === "1");
  const [chips, setChips] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);
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

  const priceMinNaira =
    draft.priceMinKobo != null ? String(draft.priceMinKobo / 100) : "";
  const priceMaxNaira =
    draft.priceMaxKobo != null ? String(draft.priceMaxKobo / 100) : "";

  const runSearch = useCallback(
    async (
      filters: SearchFilters,
      opts?: { nl?: boolean; append?: boolean; prevItems?: PublicListing[] },
    ) => {
      const token = getAccessToken();
      const nl = Boolean(opts?.nl);
      if (!opts?.append) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        if (nl && filters.q && !opts?.append) {
          const nlRes = await searchNl(
            { query: filters.q, lat: filters.lat, lng: filters.lng },
            token,
          );
          setChips(nlRes.interpreted.chips ?? []);
          const merged = {
            ...compactFilters(nlRes.interpreted.filters),
            community:
              filters.community ?? nlRes.interpreted.filters.community,
            radiusKm: filters.radiusKm ?? nlRes.interpreted.filters.radiusKm,
          };
          setDraft((d) => ({ ...d, ...merged, q: filters.q }));
          setResult(nlRes.results);
        } else {
          if (!opts?.append) setChips([]);
          const res = await searchListings(
            { ...compactFilters(filters), limit: 24 },
            token,
          );
          if (opts?.append && opts.prevItems) {
            setResult({
              ...res,
              items: [...opts.prevItems, ...res.items],
            });
          } else {
            setResult(res);
          }
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Search failed");
        if (!opts?.append) setResult(null);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    const filters = searchFiltersFromParams(
      new URLSearchParams(searchParams.toString()),
    );
    const nlFlag = searchParams.get("nl") === "1";
    setDraft(filters);
    setQuery(filters.q ?? "");
    setUseNl(nlFlag);
    void runSearch(filters, {
      nl: nlFlag || looksLikeNaturalLanguage(filters.q ?? ""),
    });
  }, [searchParams, runSearch]);

  function applyAndNavigate(next: SearchFilters, nl?: boolean) {
    const compact = compactFilters({ ...next, q: query.trim() || undefined });
    router.push(filtersToUrl(compact, nl ?? useNl));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    const nl = useNl || looksLikeNaturalLanguage(q);
    applyAndNavigate({ ...draft, q: q || undefined }, nl);
  }

  function updateDraft<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function toggleFavourite(listing: PublicListing) {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to save listings", tone: "warn" });
      router.push("/");
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
        message:
          err instanceof ApiError ? err.message : "Could not update save",
        tone: "error",
      });
    }
  }

  async function addListingToCart(listing: PublicListing) {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to use the cart", tone: "warn" });
      router.push("/");
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

  async function saveCurrentSearch() {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to save searches", tone: "warn" });
      router.push("/");
      return;
    }
    const filters = compactFilters({ ...draft, q: query.trim() || undefined });
    const name =
      filters.q?.slice(0, 40) ||
      filters.community ||
      filters.condition ||
      "Saved search";
    setSavingSearch(true);
    try {
      await createSavedSearch(token, name, filters as Record<string, unknown>);
      setToast({ message: "Search saved", tone: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not save search",
        tone: "error",
      });
    } finally {
      setSavingSearch(false);
    }
  }

  async function loadMore() {
    if (!result?.nextCursor || loadingMore) return;
    await runSearch(
      {
        ...draft,
        q: query.trim() || undefined,
        cursor: result.nextCursor,
      },
      { nl: false, append: true, prevItems: result.items },
    );
  }

  function removeChip(chip: string) {
    setChips((c) => c.filter((x) => x !== chip));
    setUseNl(false);
    applyAndNavigate({ ...draft, q: query.trim() || undefined }, false);
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <header className="sticky top-14 z-30 border-b border-[var(--rw-border)]/70 bg-[var(--rw-bg)]/90 backdrop-blur-md lg:top-[var(--rw-nav-offset,0px)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <form
            onSubmit={onSubmit}
            className="flex min-w-0 flex-1 items-center gap-2"
            role="search"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or ask in plain English…"
              aria-label="Search"
              className="min-w-0 flex-1 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
            />
            <label className="hidden items-center gap-1 text-xs text-[var(--rw-ink-muted)] sm:flex">
              <input
                type="checkbox"
                checked={useNl}
                onChange={(e) => setUseNl(e.target.checked)}
                className="accent-[var(--rw-accent)]"
              />
              NL
            </label>
            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside
          aria-label="Filters"
          className="h-fit space-y-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/80 p-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
            Filters
          </h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="f-community">
              Community
            </label>
            <select
              id="f-community"
              value={draft.community ?? ""}
              onChange={(e) =>
                updateDraft("community", e.target.value || undefined)
              }
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-2 text-sm"
            >
              <option value="">Any</option>
              {COMMUNITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Radius</p>
            <div className="flex flex-wrap gap-1.5">
              {RADIUS_OPTIONS.map((opt) => (
                <Chip
                  key={String(opt.value)}
                  selected={
                    opt.value === "all"
                      ? draft.radiusKm == null
                      : draft.radiusKm === opt.value
                  }
                  onClick={() =>
                    updateDraft(
                      "radiusKm",
                      opt.value === "all"
                        ? undefined
                        : (opt.value as RadiusKm),
                    )
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Min ₦"
              inputMode="numeric"
              value={priceMinNaira}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                updateDraft(
                  "priceMinKobo",
                  e.target.value === "" || !Number.isFinite(n)
                    ? undefined
                    : nairaToKobo(n),
                );
              }}
            />
            <Input
              label="Max ₦"
              inputMode="numeric"
              value={priceMaxNaira}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                updateDraft(
                  "priceMaxKobo",
                  e.target.value === "" || !Number.isFinite(n)
                    ? undefined
                    : nairaToKobo(n),
                );
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="f-condition">
              Condition
            </label>
            <select
              id="f-condition"
              value={draft.condition ?? ""}
              onChange={(e) =>
                updateDraft("condition", e.target.value || undefined)
              }
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-2 text-sm"
            >
              <option value="">Any</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draft.verifiedOnly)}
              onChange={(e) =>
                updateDraft(
                  "verifiedOnly",
                  e.target.checked ? true : undefined,
                )
              }
              className="accent-[var(--rw-accent)]"
            />
            Verified sellers
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draft.deliveryAvailable)}
              onChange={(e) =>
                updateDraft(
                  "deliveryAvailable",
                  e.target.checked ? true : undefined,
                )
              }
              className="accent-[var(--rw-accent)]"
            />
            Delivery available
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="f-sort">
              Sort
            </label>
            <select
              id="f-sort"
              value={draft.sort ?? "newest"}
              onChange={(e) =>
                updateDraft(
                  "sort",
                  (e.target.value as SearchFilters["sort"]) || "newest",
                )
              }
              className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-2 py-2 text-sm"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={() =>
              applyAndNavigate({
                ...draft,
                q: query.trim() || undefined,
              })
            }
          >
            Apply filters
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={savingSearch}
            onClick={() => void saveCurrentSearch()}
          >
            {savingSearch ? "Saving…" : "Save this search"}
          </Button>
        </aside>

        <section>
          {chips.length > 0 ? (
            <div className="mb-4" aria-live="polite">
              <p className="text-sm font-medium text-[var(--rw-ink-muted)]">
                Interpreted as:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <Chip
                    key={chip}
                    selected
                    onClick={() => removeChip(chip)}
                    aria-label={`Remove ${chip}`}
                  >
                    {chip} ×
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="aspect-[3/4] w-full rounded-[var(--rw-radius-lg)]"
                  label="Loading result"
                />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              title="Search failed"
              description={error}
              action={
                <Button
                  variant="primary"
                  onClick={() =>
                    void runSearch({
                      ...draft,
                      q: query.trim() || undefined,
                    })
                  }
                >
                  Retry
                </Button>
              }
            />
          ) : !result || result.items.length === 0 ? (
            <EmptyState
              title="No matches"
              description="Try different filters or a broader radius."
              action={
                <Link href="/">
                  <Button variant="secondary">Back home</Button>
                </Link>
              }
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-[var(--rw-ink-muted)]">
                {result.total} result{result.total === 1 ? "" : "s"}
                {result.tookMs != null ? ` · ${result.tookMs}ms` : ""}
              </p>
              <ul className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3">
                {result.items.map((item) => {
                  const own = meId != null && item.seller.id === meId;
                  return (
                    <li key={item.id} className="h-full">
                      <DiscoveryListingCard
                        listing={item}
                        favourited={favourites.has(item.id)}
                        onToggleFavourite={
                          own ? undefined : (l) => void toggleFavourite(l)
                        }
                        onAddToCart={
                          own ? undefined : (l) => void addListingToCart(l)
                        }
                      />
                    </li>
                  );
                })}
              </ul>
              {result.nextCursor ? (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="secondary"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
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
