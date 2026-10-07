"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  Toast,
} from "@reworth/ui-web";
import { MakeOfferModal } from "../../../components/chat/MakeOfferModal";
import { SwapProposalModal } from "../../../components/swap/SwapProposalModal";
import { apiFetch, ApiError } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  createConversation,
  createOffer,
} from "../../../lib/chat";
import {
  favouriteListing,
  getMeFavourites,
  unfavouriteListing,
} from "../../../lib/discovery";
import { addToCart } from "../../../lib/cart";
import { CartIcon } from "../../../components/AppNav";
import { fetchRecommendations } from "../../../lib/intelligence";
import {
  CONDITION_LABELS,
  formatPostedAt,
  getListing,
  getPriceIntelligence,
  listingImageUrl,
  reportListing,
} from "../../../lib/listings";
import { createGiveawayClaim } from "../../../lib/swap";
import { formatResponseShort } from "../../../lib/trust";
import {
  formatInspectedDate,
  getInspectionReport,
  getListingInspectionReport,
  isLuxuryListing,
  isVehicleListing,
  luxuryAuthLabel,
  requestInspection,
  resolveInspectedBadge,
  type InspectionReport,
} from "../../../lib/verticals";
import type {
  MeResponse,
  PriceIntelligence,
  PublicListing,
} from "../../../lib/types";
import { DiscoveryListingCard } from "../../../components/discovery/DiscoveryListingCard";
import {
  BOOST_DURATIONS_HOURS,
  newIdempotencyKey,
  purchaseBoost,
  purchaseFeatured,
  quoteBoost,
  quoteFeatured,
  type BoostQuote,
  type FeaturedQuote,
} from "../../../lib/monetization";

export default function ListingPdpPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const from = useSearchParams().get("from");
  const backHref = from && /^\/users\/[\w-]+$/.test(from) ? from : null;

  const [listing, setListing] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reporting, setReporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qty, setQty] = useState(1);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  const [cartFormOpen, setCartFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [similar, setSimilar] = useState<PublicListing[]>([]);
  const [priceIntel, setPriceIntel] = useState<PriceIntelligence | null>(null);
  const [reportViewerOpen, setReportViewerOpen] = useState(false);
  const [inspectionReport, setInspectionReport] =
    useState<InspectionReport | null>(null);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [boostHours, setBoostHours] =
    useState<(typeof BOOST_DURATIONS_HOURS)[number]>(24);
  const [boostQuote, setBoostQuote] = useState<BoostQuote | null>(null);
  const [featuredQuote, setFeaturedQuote] = useState<FeaturedQuote | null>(
    null,
  );
  const [monetizeBusy, setMonetizeBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const data = await getListing(id, token);
      setListing(data);
      setActiveImage(0);

      void fetchRecommendations(
        {
          surface: "similar",
          listingId: id,
          city: data.city ?? undefined,
          limit: 8,
        },
        token,
      )
        .then((res) => setSimilar(res.items ?? []))
        .catch(() => setSimilar([]));

      void getPriceIntelligence(id)
        .then((intel) => setPriceIntel(intel))
        .catch(() => setPriceIntel(null));

      if (token) {
        try {
          const me = await apiFetch<MeResponse>("/me", { token });
          setMeId(me.id);
        } catch {
          setMeId(null);
        }
        try {
          const favs = await getMeFavourites(token);
          setSaved(favs.items.some((i) => i.listing.id === id));
        } catch {
          setSaved(false);
        }
      } else {
        setMeId(null);
        setSaved(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Listing not found");
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function requireAuth(): string | null {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to continue", tone: "warn" });
      router.push("/");
      return null;
    }
    return token;
  }

  async function startChat() {
    if (!id || chatBusy) return;
    const token = requireAuth();
    if (!token) return;
    setChatBusy(true);
    try {
      const conv = await createConversation(token, id);
      router.push(`/chats/${conv.id}`);
    } catch (err) {
      setChatBusy(false);
      setToast({
        message: err instanceof ApiError ? err.message : "Could not start chat",
        tone: "error",
      });
    }
  }

  async function submitOffer(amountKobo: number, note?: string) {
    if (!id) return;
    const token = requireAuth();
    if (!token) return;
    setOfferBusy(true);
    try {
      const conv = await createConversation(token, id);
      await createOffer(token, id, {
        amountKobo,
        note,
        conversationId: conv.id,
      });
      setOfferOpen(false);
      setToast({ message: "Offer sent", tone: "success" });
      router.push(`/chats/${conv.id}`);
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Offer failed",
        tone: "error",
      });
    } finally {
      setOfferBusy(false);
    }
  }

  async function saveToCart() {
    if (!id) return;
    const token = requireAuth();
    if (!token) return;
    setCartBusy(true);
    try {
      await addToCart(token, id, qty);
      setCartReady(true);
      setToast({
        message:
          qty === 1
            ? "Added to cart. Open your cart to place the order."
            : `Added ${qty} to cart. Open your cart to place the order.`,
        tone: "success",
      });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not add to cart",
        tone: "error",
      });
    } finally {
      setCartBusy(false);
    }
  }

  async function toggleSave() {
    const token = getAccessToken();
    if (!token || !id) {
      setToast({ message: "Sign in to save listings", tone: "warn" });
      return;
    }
    setSaving(true);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await favouriteListing(id, token);
      else await unfavouriteListing(id, token);
      setToast({
        message: next ? "Added to wishlist" : "Removed from wishlist",
        tone: "success",
      });
    } catch (err) {
      setSaved(!next);
      setToast({
        message: err instanceof ApiError ? err.message : "Could not update",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function shareListing() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: listing?.title ?? "ReWorth listing",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast({ message: "Link copied", tone: "success" });
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setToast({ message: "Link copied", tone: "success" });
      } catch {
        setToast({ message: "Could not copy link", tone: "error" });
      }
    }
  }

  async function submitReport() {
    const token = getAccessToken();
    if (!token) {
      setToast({ message: "Sign in to report a listing", tone: "warn" });
      setReportOpen(false);
      return;
    }
    if (!reportReason.trim() || !id) {
      setToast({ message: "Add a reason", tone: "warn" });
      return;
    }
    setReporting(true);
    try {
      await reportListing(id, token, reportReason.trim(), reportDetail.trim());
      setReportOpen(false);
      setReportReason("");
      setReportDetail("");
      setToast({ message: "Report submitted", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Report failed",
        tone: "error",
      });
    } finally {
      setReporting(false);
    }
  }

  async function openInspectionReport() {
    if (!listing) return;
    const badge = resolveInspectedBadge(listing);
    setReportViewerOpen(true);
    setReportLoading(true);
    setInspectionReport(null);
    try {
      const token = getAccessToken();
      if (badge.inspectionId) {
        const report = await getInspectionReport(badge.inspectionId, token);
        setInspectionReport(report);
      } else {
        const report = await getListingInspectionReport(listing.id, token);
        setInspectionReport(report);
      }
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Inspection report unavailable",
        tone: "error",
      });
    } finally {
      setReportLoading(false);
    }
  }

  async function onRequestInspection() {
    if (!id) return;
    const token = requireAuth();
    if (!token) return;
    setInspectionBusy(true);
    try {
      await requestInspection(id, token);
      setToast({
        message: "Inspection requested — pay & schedule next",
        tone: "success",
      });
      await load();
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not request inspection",
        tone: "error",
      });
    } finally {
      setInspectionBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="aspect-[4/3] w-full" label="Loading gallery" />
          <Skeleton className="h-8 w-1/2" label="Loading price" />
          <Skeleton className="h-6 w-3/4" label="Loading title" />
          <Skeleton className="h-32 w-full" label="Loading details" />
        </div>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)] px-6">
        <EmptyState
          title="Listing unavailable"
          description={error ?? "This item may have been removed."}
          action={
            <Link href="/">
              <Button variant="primary">Back home</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const images = [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const heroUrl = listingImageUrl(images[activeImage]) ?? listingImageUrl(images[0]);
  const isSwap =
    listing.sellingMode === "SWAP" || listing.sellingMode === "SWAP_CASH";
  const isGiveAway = listing.sellingMode === "GIVE_AWAY";
  const posted = formatPostedAt(listing.publishedAt ?? listing.createdAt);

  const fulfilment: string[] = [];
  if (listing.fulfilmentPickup) fulfilment.push("Pickup");
  if (listing.fulfilmentMeet) fulfilment.push("Meet point");
  if (listing.fulfilmentDelivery) fulfilment.push("Delivery (quote at checkout)");

  const inspected = resolveInspectedBadge(listing);
  const authLabel = luxuryAuthLabel(listing);
  const vehicleListing = isVehicleListing(listing);
  const luxuryListing = isLuxuryListing(listing);

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40vh]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(14,159,110,0.12), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
              >
                ← Back
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
            >
              Report
            </button>
          </div>
        </header>

        <section aria-label="Photo gallery" className="rw-fade-up">
          <div className="aspect-[4/3] overflow-hidden rounded-[var(--rw-radius-lg)] bg-[var(--rw-border)]">
            {heroUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--rw-ink-muted)]">
                No photos yet
              </div>
            )}
          </div>
          {images.length > 1 ? (
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => {
                const thumb = listingImageUrl(img);
                return (
                  <li key={img.id}>
                    <button
                      type="button"
                      onClick={() => setActiveImage(i)}
                      aria-label={`Photo ${i + 1}`}
                      aria-pressed={activeImage === i}
                      className={[
                        "h-16 w-16 overflow-hidden rounded-[var(--rw-radius)] border-2",
                        activeImage === i
                          ? "border-[var(--rw-accent)]"
                          : "border-transparent",
                      ].join(" ")}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="rw-fade-up-delay mt-8">
          <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {isGiveAway
              ? "Free"
              : isSwap
                ? "Swap"
                : formatNgn({ amountKobo: listing.priceKobo })}
            {!isGiveAway && !isSwap ? (
              <span className="ml-2 text-base font-medium text-[var(--rw-ink-muted)]">
                per unit
                {typeof listing.quantityAvailable === "number"
                  ? ` · ${listing.quantityAvailable} available`
                  : ""}
              </span>
            ) : null}
            {!isGiveAway && !isSwap && listing.negotiable ? (
              <span className="ml-2 text-base font-medium text-[var(--rw-ink-muted)]">
                · Negotiable
              </span>
            ) : null}
          </p>
          <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
            {listing.title || "Untitled listing"}
          </h1>
          {(inspected.inspected ||
            authLabel ||
            listing.certificateId ||
            listing.instantBuyEligible) && (
            <ul
              className="mt-3 flex flex-wrap gap-2"
              aria-label="Trust badges"
            >
              {listing.instantBuyEligible ? (
                <li>
                  <span className="inline-flex items-center rounded-[var(--rw-radius)] bg-[var(--rw-accent-muted)] px-3 py-1.5 text-sm font-semibold text-[var(--rw-accent)]">
                    Instant Buy
                  </span>
                </li>
              ) : null}
              {inspected.inspected ? (
                <li>
                  <button
                    type="button"
                    onClick={() => void openInspectionReport()}
                    className="inline-flex items-center rounded-[var(--rw-radius)] bg-[var(--rw-success-muted)] px-3 py-1.5 text-sm font-semibold text-[var(--rw-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                  >
                    Inspected ✓
                    {inspected.completedAt
                      ? ` · ${formatInspectedDate(inspected.completedAt)}`
                      : ""}
                  </button>
                </li>
              ) : null}
              {authLabel ? (
                <li>
                  <span
                    className={[
                      "inline-flex items-center rounded-[var(--rw-radius)] px-3 py-1.5 text-sm font-semibold",
                      authLabel === "Authentic ✓"
                        ? "bg-[var(--rw-success-muted)] text-[var(--rw-success)]"
                        : "border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] text-[var(--rw-ink-muted)]",
                    ].join(" ")}
                  >
                    {authLabel}
                  </span>
                </li>
              ) : null}
              {listing.certificateId ? (
                <li>
                  <span className="inline-flex items-center rounded-[var(--rw-radius)] border border-[var(--rw-border)] px-3 py-1.5 font-mono text-xs text-[var(--rw-ink-muted)]">
                    Cert {listing.certificateId}
                  </span>
                </li>
              ) : null}
            </ul>
          )}
          {vehicleListing && !inspected.inspected ? (
            <p className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={inspectionBusy}
                onClick={() => void onRequestInspection()}
              >
                {inspectionBusy ? "Requesting…" : "Request inspection"}
              </Button>
            </p>
          ) : null}
          {luxuryListing && listing.authRequired ? (
            <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">
              Luxury authentication required before sale completes.
            </p>
          ) : null}
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--rw-ink-muted)]">
            <span>
              {CONDITION_LABELS[listing.condition] ?? listing.condition}
            </span>
            <span aria-hidden>·</span>
            <span>
              {listing.community || listing.city || "Lagos"}
            </span>
            <span aria-hidden>·</span>
            <time dateTime={listing.publishedAt ?? listing.createdAt}>
              {posted}
            </time>
          </p>
          {priceIntel?.confidenceLabel ? (
            <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
              {priceIntel.confidenceLabel}
            </p>
          ) : null}
          {listing.movingSale ? (
            <p className="mt-3">
              <Link
                href={`/moving-sales/${listing.movingSale.id}`}
                className="inline-flex items-center rounded-[var(--rw-radius)] bg-[var(--rw-accent-muted)] px-3 py-1.5 text-sm font-medium text-[var(--rw-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              >
                Moving sale: {listing.movingSale.title} →
              </Link>
            </p>
          ) : null}
          {listing.communityChip ? (
            <p className="mt-2">
              <Link
                href={`/communities/${listing.communityChip.slug}`}
                className="inline-flex items-center rounded-full border border-[var(--rw-border)] px-3 py-1 text-xs font-medium text-[var(--rw-ink-muted)] hover:text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
              >
                {listing.communityChip.name}
                {listing.communityChip.privacy !== "PUBLIC"
                  ? " · members"
                  : ""}
              </Link>
            </p>
          ) : null}
          {meId && meId === listing.seller.id && !listing.movingSale ? (
            <p className="mt-3 text-sm">
              <Link
                href={`/moving-sales/new?listingId=${listing.id}`}
                className="font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
              >
                Add to moving sale?
              </Link>
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => void toggleSave()}
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={saved}
            >
              <span aria-hidden style={{ color: saved ? "#DC2626" : "#5C636A" }}>
                {saved ? "♥" : "♡"}
              </span>
              <span className="ml-1.5">{saved ? "Saved" : "Save"}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void shareListing()}
              aria-label="Share listing"
            >
              Share
            </Button>
          </div>

          {meId && meId === listing.seller.id ? (
            <OwnerMonetization
              listingId={listing.id}
              boosted={Boolean(listing.boosted)}
              featured={Boolean(listing.featured)}
              boostHours={boostHours}
              setBoostHours={setBoostHours}
              boostQuote={boostQuote}
              setBoostQuote={setBoostQuote}
              featuredQuote={featuredQuote}
              setFeaturedQuote={setFeaturedQuote}
              busy={monetizeBusy}
              setBusy={setMonetizeBusy}
              onToast={(message, tone) => setToast({ message, tone })}
              onRefresh={() => void load()}
            />
          ) : null}
        </section>

        {meId === listing.seller.id ? null : (
        <section
          className="mt-8 flex items-center gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-4"
          aria-label="Seller"
        >
          <Link
            href={`/users/${listing.seller.id}?from=/listings/${listing.id}`}
            className="flex min-w-0 flex-1 items-center gap-4 rounded-[var(--rw-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--rw-accent-muted)] text-lg font-semibold text-[var(--rw-accent)]"
              aria-hidden
            >
              {(listing.seller.displayName || "S").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {listing.seller.displayName}
                {listing.seller.verificationBadge ? (
                  <span className="ml-2 text-sm font-medium text-[var(--rw-accent)]">
                    Identity Verified ✓
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-[var(--rw-ink-muted)]">
                {listing.seller.ratingLabel}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {listing.seller.trustBadge ? (
                  <span className="rounded-[var(--rw-radius)] bg-[var(--rw-gold-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--rw-ink)]">
                    {listing.seller.trustBadge}
                  </span>
                ) : null}
                {formatResponseShort(listing.seller.responseMinutes) ? (
                  <span className="text-[var(--rw-ink-muted)]">
                    {formatResponseShort(listing.seller.responseMinutes)}
                  </span>
                ) : null}
              </p>
            </div>
            <span className="text-sm font-medium text-[var(--rw-accent)]">
              Profile →
            </span>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            className="w-16 shrink-0"
            disabled={chatBusy}
            aria-busy={chatBusy}
            onClick={() => void startChat()}
          >
            Chat
          </Button>
        </section>
        )}

        <section className="mt-8" aria-labelledby="pdp-desc">
          <h2 id="pdp-desc" className="text-lg font-semibold">
            Description
          </h2>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-[var(--rw-ink-muted)]">
            {listing.description || "No description provided."}
          </p>
          {!isGiveAway && !isSwap && meId !== listing.seller.id ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <CartIcon className="h-20 w-20 text-[var(--rw-ink-muted)]" />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="px-5"
                  disabled={(listing.quantityAvailable ?? 1) < 1}
                  onClick={() => setCartFormOpen(true)}
                >
                  Add to cart
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!requireAuth()) return;
                    setOfferOpen(true);
                  }}
                >
                  Make offer
                </Button>
              </div>
              {(listing.quantityAvailable ?? 1) < 1 ? (
                <p className="mt-2 text-sm font-medium text-[var(--rw-ink-muted)]">
                  No units left
                </p>
              ) : null}
              {cartFormOpen && (listing.quantityAvailable ?? 1) > 0 ? (
                <form
                  className="mt-4 w-full space-y-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (meId && meId === listing.seller.id) {
                      setToast({
                        message: "You can't add your own listing to the cart",
                        tone: "warn",
                      });
                      return;
                    }
                    void saveToCart();
                  }}
                >
                  <p className="text-sm font-medium">How many units?</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full border border-[var(--rw-border)]"
                      onClick={() => setQty((n) => Math.max(1, n - 1))}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold">
                      {qty}
                    </span>
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full border border-[var(--rw-border)] disabled:opacity-40"
                      disabled={qty >= (listing.quantityAvailable ?? 1)}
                      onClick={() =>
                        setQty((n) =>
                          Math.min(listing.quantityAvailable ?? 1, n + 1),
                        )
                      }
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <span className="text-sm text-[var(--rw-ink-muted)]">
                      {listing.quantityAvailable ?? 1} available
                    </span>
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    disabled={cartBusy}
                  >
                    {cartBusy ? "Adding…" : `Add ${qty} to cart`}
                  </Button>
                  {cartReady ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => router.push("/cart")}
                    >
                      Go to cart
                    </Button>
                  ) : null}
                </form>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-8" aria-labelledby="pdp-delivery">
          <h2 id="pdp-delivery" className="text-lg font-semibold">
            Delivery options
          </h2>
          {fulfilment.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {fulfilment.map((f) => (
                <li
                  key={f}
                  className="rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-1.5 text-sm"
                >
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
              Seller has not set fulfilment options.
            </p>
          )}
        </section>

        {listing.buyerProtection ? (
          <aside
            className="mt-8 rounded-[var(--rw-radius-lg)] border border-[var(--rw-accent)]/30 bg-[var(--rw-accent-muted)]/50 px-4 py-3"
            aria-label="Buyer protection"
          >
            <p className="text-sm font-semibold text-[var(--rw-accent)]">
              Buyer protection
            </p>
            <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
              Pay on ReWorth when available — funds held until you confirm.
            </p>
          </aside>
        ) : null}

        {isSwap && meId !== listing.seller.id ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-center text-sm font-medium text-[var(--rw-ink-muted)]">
              Interested in swapping? Chat with the seller
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!requireAuth()) return;
                setSwapOpen(true);
              }}
            >
              Swap
            </Button>
          </div>
        ) : null}

        {isGiveAway && meId !== listing.seller.id ? (
          <div className="mt-8 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              disabled={claimBusy}
              onClick={async () => {
                if (!id) return;
                const token = requireAuth();
                if (!token) return;
                setClaimBusy(true);
                try {
                  await createGiveawayClaim(token, id);
                  setToast({
                    message: "Claim sent — seller will review",
                    tone: "success",
                  });
                } catch (err) {
                  setToast({
                    message:
                      err instanceof ApiError ? err.message : "Could not claim",
                    tone: "error",
                  });
                } finally {
                  setClaimBusy(false);
                }
              }}
            >
              {claimBusy ? "Claiming…" : "Claim this item"}
            </Button>
          </div>
        ) : null}

        {similar.length > 0 ? (
          <section className="mt-12" aria-labelledby="similar-heading">
            <h2 id="similar-heading" className="text-lg font-semibold">
              Similar items
            </h2>
            <ul className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {similar.map((item) => (
                <li key={item.id} className="w-40 shrink-0 sm:w-44">
                  <DiscoveryListingCard listing={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <MakeOfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        submitting={offerBusy}
        onSubmit={submitOffer}
      />

      <SwapProposalModal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        token={getAccessToken() ?? ""}
        targetListingId={id ?? ""}
        onSubmitted={() =>
          setToast({ message: "Swap proposal sent", tone: "success" })
        }
        onNeedListing={() => router.push("/sell")}
      />

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report listing"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Reason"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Spam, scam, prohibited…"
            maxLength={200}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-detail" className="text-sm font-medium">
              Details (optional)
            </label>
            <textarea
              id="report-detail"
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
            />
          </div>
          <Button
            variant="danger"
            disabled={reporting}
            onClick={() => void submitReport()}
          >
            {reporting ? "Sending…" : "Submit report"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={reportViewerOpen}
        onClose={() => setReportViewerOpen(false)}
        title="Inspection report"
      >
        {reportLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : inspectionReport ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="text-[var(--rw-ink-muted)]">Status · </span>
              <span className="font-medium">{inspectionReport.status}</span>
            </p>
            {inspectionReport.conditionScore != null ? (
              <p>
                <span className="text-[var(--rw-ink-muted)]">
                  Condition score ·{" "}
                </span>
                <span className="font-medium">
                  {inspectionReport.conditionScore}
                </span>
              </p>
            ) : null}
            {inspectionReport.verifiedMileage != null ? (
              <p>
                <span className="text-[var(--rw-ink-muted)]">Mileage · </span>
                <span className="font-medium">
                  {inspectionReport.verifiedMileage.toLocaleString("en-NG")} km
                </span>
              </p>
            ) : null}
            {inspectionReport.registrationOk != null ? (
              <p>
                Registration{" "}
                {inspectionReport.registrationOk ? "verified ✓" : "issue noted"}
              </p>
            ) : null}
            {inspectionReport.accidentNotes ? (
              <p className="text-[var(--rw-ink-muted)]">
                {inspectionReport.accidentNotes}
              </p>
            ) : null}
            {inspectionReport.tyreBatteryNotes ? (
              <p className="text-[var(--rw-ink-muted)]">
                {inspectionReport.tyreBatteryNotes}
              </p>
            ) : null}
            {inspectionReport.completedAt ? (
              <time
                className="text-xs text-[var(--rw-ink-muted)]"
                dateTime={inspectionReport.completedAt}
              >
                Completed{" "}
                {formatInspectedDate(inspectionReport.completedAt)}
              </time>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--rw-ink-muted)]">
            Report not available.
          </p>
        )}
      </Modal>

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

function OwnerMonetization({
  listingId,
  boosted,
  featured,
  boostHours,
  setBoostHours,
  boostQuote,
  setBoostQuote,
  featuredQuote,
  setFeaturedQuote,
  busy,
  setBusy,
  onToast,
  onRefresh,
}: {
  listingId: string;
  boosted: boolean;
  featured: boolean;
  boostHours: (typeof BOOST_DURATIONS_HOURS)[number];
  setBoostHours: (h: (typeof BOOST_DURATIONS_HOURS)[number]) => void;
  boostQuote: BoostQuote | null;
  setBoostQuote: (q: BoostQuote | null) => void;
  featuredQuote: FeaturedQuote | null;
  setFeaturedQuote: (q: FeaturedQuote | null) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (message: string, tone?: "info" | "success" | "warn" | "error") => void;
  onRefresh: () => void;
}) {
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [bq, fq] = await Promise.all([
          quoteBoost(token, boostHours),
          quoteFeatured(token),
        ]);
        if (!cancelled) {
          setBoostQuote(bq);
          setFeaturedQuote(fq);
        }
      } catch {
        if (!cancelled) {
          setBoostQuote(null);
          setFeaturedQuote(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boostHours, listingId, setBoostQuote, setFeaturedQuote]);

  async function onBoost() {
    const token = getAccessToken();
    if (!token) {
      onToast("Sign in to boost", "warn");
      return;
    }
    setBusy(true);
    try {
      await purchaseBoost(token, {
        listingId,
        hours: boostHours,
        idempotencyKey: newIdempotencyKey("boost"),
      });
      onToast("Boost purchased", "success");
      onRefresh();
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Boost failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onFeature() {
    const token = getAccessToken();
    if (!token) {
      onToast("Sign in to feature", "warn");
      return;
    }
    setBusy(true);
    try {
      await purchaseFeatured(token, {
        listingId,
        idempotencyKey: newIdempotencyKey("featured"),
      });
      onToast("Featured slot purchased", "success");
      onRefresh();
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : "Featured failed",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
      aria-label="Promote listing"
    >
      <h2 className="text-base font-semibold tracking-tight">Promote</h2>
      <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
        {boosted ? "Boosted · " : ""}
        {featured ? "Featured" : "Reach more Lagos buyers"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {BOOST_DURATIONS_HOURS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setBoostHours(h)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              boostHours === h
                ? "border-[var(--rw-accent)] bg-[var(--rw-accent-muted)] text-[var(--rw-ink)]"
                : "border-[var(--rw-border)] text-[var(--rw-ink-muted)]"
            }`}
          >
            {h}h
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !boostQuote || boosted}
          onClick={() => void onBoost()}
        >
          {boosted
            ? "Already boosted"
            : boostQuote
              ? `Boost · ${formatNgn({ amountKobo: boostQuote.priceKobo })}`
              : "Boost…"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !featuredQuote || featured}
          onClick={() => void onFeature()}
        >
          {featured
            ? "Already featured"
            : featuredQuote
              ? `Feature · ${formatNgn({ amountKobo: featuredQuote.priceKobo })}`
              : "Feature…"}
        </Button>
      </div>
    </div>
  );
}
