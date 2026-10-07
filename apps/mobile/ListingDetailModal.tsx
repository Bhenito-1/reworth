import { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BottomSheet } from "./components/BottomSheet";
import { Skeleton } from "./components/Skeleton";
import { ApiError, apiFetch } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import {
  createConversation,
  createOffer,
  nairaToKobo,
} from "./lib/chat";
import {
  favouriteListing,
  getMeFavourites,
  unfavouriteListing,
} from "./lib/discovery";
import { getListing, listingShareUrl } from "./lib/listings";
import { addToCart } from "./lib/cart";
import { fetchRecommendations } from "./lib/intelligence";
import {
  BOOST_DURATIONS_HOURS,
  newIdempotencyKey,
  purchaseBoost,
  purchaseFeatured,
  quoteBoost,
  quoteFeatured,
  type BoostQuote,
  type FeaturedQuote,
} from "./lib/monetization";
import {
  createGiveawayClaim,
  createSwapProposal,
  myLiveListings,
} from "./lib/swap";
import {
  INSPECTION_SLOTS,
  inspectedBadgeLabel,
  isVehicleListing,
  payInspection,
  requestInspection,
  scheduleInspection,
} from "./lib/verticals";
import { formatResponseShort } from "./lib/trust";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type MeResponse,
  type PublicListing,
} from "./lib/types";
import { hapticLight } from "./theme/haptics";
import { useColors } from "./theme/ThemeProvider";
import { colors } from "./theme/tokens";

const GALLERY_W = Dimensions.get("window").width;

type Props = {
  listingId: string | null;
  onClose: () => void;
  dismissLabel?: string;
  onOpenChat?: (conversationId: string) => void;
  onBuyNow?: (listingId: string, quantity?: number) => void;
  onOpenSeller?: (sellerId: string) => void;
  onOpenCart?: () => void;
};

export function ListingDetailModal({
  listingId,
  onClose,
  dismissLabel = "Close",
  onOpenChat,
  onBuyNow,
  onOpenSeller,
  onOpenCart,
}: Props) {
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cartReady, setCartReady] = useState(false);
  const [cartFormOpen, setCartFormOpen] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerNaira, setOfferNaira] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [myListings, setMyListings] = useState<PublicListing[]>([]);
  const [swapSelected, setSwapSelected] = useState<string | null>(null);
  const [swapCashNaira, setSwapCashNaira] = useState("0");
  const [swapBusy, setSwapBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [similar, setSimilar] = useState<PublicListing[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [boostOpen, setBoostOpen] = useState(false);
  const [boostHours, setBoostHours] = useState<(typeof BOOST_DURATIONS_HOURS)[number]>(24);
  const [boostQuote, setBoostQuote] = useState<BoostQuote | null>(null);
  const [featuredQuote, setFeaturedQuote] = useState<FeaturedQuote | null>(null);
  const [boostBusy, setBoostBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectSlot, setInspectSlot] = useState<string>(INSPECTION_SLOTS[0]);
  const c = useColors();

  const gallery = useMemo(() => {
    if (!listing?.images?.length) return [] as string[];
    return [...listing.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((img) => listingImageUrl(img))
      .filter((u): u is string => Boolean(u));
  }, [listing]);

  async function reloadListing(id: string, token?: string | null) {
    const data = await getListing(id, token);
    setListing(data);
    return data;
  }

  useEffect(() => {
    if (!listingId) {
      setListing(null);
      setSaved(false);
      setSimilar([]);
      setMeId(null);
      setBoostOpen(false);
      setGalleryIndex(0);
      setDescExpanded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const data = await getListing(listingId, token);
        if (!cancelled) setListing(data);
        if (!cancelled) {
          void fetchRecommendations(
            {
              surface: "similar",
              listingId,
              city: data.city ?? undefined,
              limit: 6,
            },
            token,
          )
            .then((res) => {
              if (!cancelled) setSimilar(res.items ?? []);
            })
            .catch(() => {
              if (!cancelled) setSimilar([]);
            });
        }
        if (token && !cancelled) {
          try {
            const me = await apiFetch<MeResponse>("/me", { token });
            if (!cancelled) setMeId(me.id);
          } catch {
            if (!cancelled) setMeId(null);
          }
          try {
            const favs = await getMeFavourites(token);
            if (!cancelled) {
              setSaved(favs.items.some((i) => i.listing.id === listingId));
            }
          } catch {
            if (!cancelled) setSaved(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Not found");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    if (!boostOpen) return;
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      setQuoteBusy(true);
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
      } finally {
        if (!cancelled) setQuoteBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boostOpen, boostHours]);

  async function toggleSave() {
    const token = await getAccessToken();
    if (!token || !listingId) {
      setToast("Sign in to save");
      return;
    }
    setSaving(true);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await favouriteListing(listingId, token);
      else await unfavouriteListing(listingId, token);
      setToast(next ? "Added to wishlist" : "Removed from wishlist");
    } catch (err) {
      setSaved(!next);
      setToast(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setSaving(false);
    }
  }

  async function startChat() {
    const token = await getAccessToken();
    if (!token || !listingId) {
      setToast("Sign in to chat");
      return;
    }
    setChatBusy(true);
    try {
      const conv = await createConversation(token, listingId);
      onOpenChat?.(conv.id);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not start chat");
    } finally {
      setChatBusy(false);
    }
  }

  async function submitOffer() {
    const token = await getAccessToken();
    if (!token || !listingId) {
      setToast("Sign in to offer");
      return;
    }
    const value = Number(offerNaira.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1) {
      setToast("Enter an amount in ₦");
      return;
    }
    setOfferBusy(true);
    try {
      const conv = await createConversation(token, listingId);
      await createOffer(token, listingId, {
        amountKobo: nairaToKobo(value),
        conversationId: conv.id,
      });
      setOfferOpen(false);
      setOfferNaira("");
      onOpenChat?.(conv.id);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Offer failed");
    } finally {
      setOfferBusy(false);
    }
  }

  async function openSwapSheet() {
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to propose a swap");
      return;
    }
    setSwapBusy(true);
    try {
      const res = await myLiveListings(token);
      const items = res.items.filter((l) => l.id !== listingId);
      setMyListings(items);
      setSwapSelected(items[0]?.id ?? null);
      setSwapCashNaira("0");
      setSwapOpen(true);
      if (!items.length) {
        setToast("List an item first, then propose a swap");
      }
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not load listings");
    } finally {
      setSwapBusy(false);
    }
  }

  async function submitSwap() {
    if (!listingId || !swapSelected) {
      setToast("Pick one of your live listings");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to propose a swap");
      return;
    }
    setSwapBusy(true);
    try {
      const cashComponentKobo = Math.round(Number(swapCashNaira || 0) * 100);
      const proposal = await createSwapProposal(token, listingId, {
        offeredListingId: swapSelected,
        cashComponentKobo: Number.isFinite(cashComponentKobo)
          ? cashComponentKobo
          : 0,
      });
      setSwapOpen(false);
      setToast("Swap proposal sent");
      if (proposal.conversationId) {
        onOpenChat?.(proposal.conversationId);
      }
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Proposal failed");
    } finally {
      setSwapBusy(false);
    }
  }

  async function startInspection() {
    if (!listingId) return;
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to book inspection");
      return;
    }
    setInspectBusy(true);
    try {
      const row = await requestInspection(token, listingId, {
        slotLabel: inspectSlot,
      });
      setInspectId(row.id);
      const paid = await payInspection(token, row.id);
      if (paid.checkoutUrl) {
        await Linking.openURL(paid.checkoutUrl).catch(() => undefined);
      }
      await scheduleInspection(token, row.id, { slotLabel: inspectSlot });
      setInspectOpen(false);
      setToast("Inspection booked");
      await reloadListing(listingId, token);
    } catch (err) {
      setToast(
        err instanceof ApiError ? err.message : "Inspection booking failed",
      );
    } finally {
      setInspectBusy(false);
    }
  }

  async function claimGiveaway() {
    if (!listingId) return;
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to claim");
      return;
    }
    setClaimBusy(true);
    try {
      await createGiveawayClaim(token, listingId);
      setToast("Claim sent — seller will review");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Claim failed");
    } finally {
      setClaimBusy(false);
    }
  }

  async function confirmBoost() {
    if (!listingId) return;
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to boost");
      return;
    }
    setBoostBusy(true);
    try {
      await purchaseBoost(token, {
        listingId,
        hours: boostHours,
        idempotencyKey: newIdempotencyKey("boost"),
      });
      await reloadListing(listingId, token);
      setBoostOpen(false);
      setToast("Boost active");
    } catch {
      setToast("Boost failed — try again or contact support");
    } finally {
      setBoostBusy(false);
    }
  }

  async function confirmFeatured() {
    if (!listingId) return;
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to feature");
      return;
    }
    setBoostBusy(true);
    try {
      await purchaseFeatured(token, {
        listingId,
        idempotencyKey: newIdempotencyKey("featured"),
      });
      await reloadListing(listingId, token);
      setBoostOpen(false);
      setToast("Featured active");
    } catch {
      setToast("Feature failed — try again or contact support");
    } finally {
      setBoostBusy(false);
    }
  }

  const isSwap =
    listing?.sellingMode === "SWAP" || listing?.sellingMode === "SWAP_CASH";
  const isGiveAway = listing?.sellingMode === "GIVE_AWAY";
  const isOwner = Boolean(meId && listing?.seller.id === meId);

  return (
    <Modal
      visible={Boolean(listingId)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Text style={[styles.brand, { color: c.ink }]}>ReWorth</Text>
          <View style={styles.headerActions}>
            {listingId ? (
              <Pressable
                onPress={() => {
                  void (async () => {
                    const url = listingShareUrl(listingId);
                    const title = listing?.title || "ReWorth listing";
                    await Share.share({
                      message: `${title} on ReWorth\n${url}`,
                      title,
                      url,
                    }).catch(() => undefined);
                  })();
                }}
                accessibilityRole="button"
                accessibilityLabel="Share listing"
                testID="pdp-share"
                hitSlop={8}
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}
              >
                <Text style={[styles.close, { color: c.ink }]}>Share</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={dismissLabel}
              testID="pdp-close"
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={[styles.close, { color: c.orange }]}>{dismissLabel}</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton height={280} />
            <Skeleton height={24} width="40%" />
            <Skeleton height={20} width="70%" />
            <Skeleton height={48} />
          </View>
        ) : error || !listing ? (
          <View style={styles.center}>
            <Text style={[styles.error, { color: c.error }]}>
              {error ?? "Unavailable"}
            </Text>
          </View>
        ) : (
          <>
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
          >
            <View>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const i = Math.round(
                    e.nativeEvent.contentOffset.x / GALLERY_W,
                  );
                  setGalleryIndex(i);
                }}
                accessibilityLabel="Listing photo gallery"
              >
                {(gallery.length ? gallery : [null]).map((uri, i) =>
                  uri ? (
                    <Image
                      key={`${uri}-${i}`}
                      source={{ uri }}
                      style={[styles.hero, { width: GALLERY_W }]}
                      resizeMode="cover"
                      accessibilityLabel={`Photo of ${listing.title || "listing"}, ${i + 1} of ${gallery.length || 1}`}
                    />
                  ) : (
                    <View
                      key="empty"
                      style={[
                        styles.hero,
                        styles.heroEmpty,
                        { width: GALLERY_W, backgroundColor: c.emeraldWash },
                      ]}
                    >
                      <Text style={{ color: c.muted }}>No photo</Text>
                    </View>
                  ),
                )}
              </ScrollView>
              {gallery.length > 0 ? (
                <View
                  style={[styles.counterChip, { backgroundColor: c.surface }]}
                  accessibilityLabel={`Photo ${galleryIndex + 1} of ${gallery.length}`}
                >
                  <Text style={{ color: c.ink, fontSize: 13, fontWeight: "600" }}>
                    {galleryIndex + 1}/{gallery.length}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: c.ink }]}>
                {isGiveAway
                  ? "Free"
                  : isSwap
                    ? "Swap"
                    : formatNgnFromKobo(listing.priceKobo)}
              </Text>
              {!isGiveAway && !isSwap && listing.negotiable ? (
                <View
                  style={[styles.negoChip, { backgroundColor: c.emeraldWash }]}
                >
                  <Text style={{ color: c.emerald, fontSize: 13, fontWeight: "600" }}>
                    Negotiable
                  </Text>
                </View>
              ) : null}
              {listing.buyerProtection ? (
                <View
                  style={[styles.negoChip, { borderColor: c.border, borderWidth: StyleSheet.hairlineWidth }]}
                >
                  <Text style={{ color: c.muted, fontSize: 12, fontWeight: "600" }}>
                    Buyer Protection
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.title, { color: c.ink }]}>
              {listing.title || "Untitled"}
            </Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {listing.condition} · {listing.community || "Lagos"}
            </Text>
            {(() => {
              const badge = listing.inspectedBadge;
              const inspected =
                badge === true ||
                (badge &&
                  typeof badge === "object" &&
                  Boolean(badge.inspected));
              const auth =
                listing.authenticationStatus === "PASSED"
                  ? "Authentic ✓"
                  : listing.authRequired ||
                      (listing.authenticationStatus &&
                        listing.authenticationStatus !== "NOT_REQUIRED")
                    ? "Unauthenticated"
                    : null;
              const promo =
                listing.boosted ||
                listing.featured ||
                listing.instantBuyEligible ||
                inspected ||
                auth ||
                listing.certificateId;
              if (!promo) return null;
              return (
                <View style={styles.badgeRow}>
                  {listing.boosted ? (
                    <Text style={styles.promoBadge}>Boosted</Text>
                  ) : null}
                  {listing.featured ? (
                    <Text style={styles.promoBadgeFeatured}>Featured</Text>
                  ) : null}
                  {listing.instantBuyEligible ? (
                    <Text style={styles.instantBuyBadge}>Instant Buy</Text>
                  ) : null}
                  {inspected ? (
                    <Text style={styles.verticalBadge}>Inspected ✓</Text>
                  ) : null}
                  {auth ? (
                    <Text
                      style={
                        auth === "Authentic ✓"
                          ? styles.verticalBadge
                          : styles.verticalBadgeMuted
                      }
                    >
                      {auth}
                    </Text>
                  ) : null}
                  {listing.certificateId ? (
                    <Text style={styles.verticalBadgeMuted}>
                      Cert {listing.certificateId}
                    </Text>
                  ) : null}
                </View>
              );
            })()}
            {listing.movingSale ? (
              <Text style={styles.chip}>
                Moving sale: {listing.movingSale.title}
              </Text>
            ) : null}
            {listing.communityChip ? (
              <Text style={styles.chip}>
                {listing.communityChip.name}
                {listing.communityChip.privacy !== "PUBLIC"
                  ? " · members"
                  : ""}
              </Text>
            ) : null}

            {isOwner ? null : (
            <Pressable
              style={styles.seller}
              onPress={() => onOpenSeller?.(listing.seller.id)}
              accessibilityRole="button"
              accessibilityLabel={`View ${listing.seller.displayName}'s profile`}
            >
              <Text style={styles.sellerName}>
                {listing.seller.displayName}
                {listing.seller.verificationBadge
                  ? " · Identity Verified ✓"
                  : ""}
              </Text>
              <Text style={styles.muted}>{listing.seller.ratingLabel}</Text>
              {listing.seller.trustBadge ? (
                <Text style={styles.trustBadge}>{listing.seller.trustBadge}</Text>
              ) : null}
              {formatResponseShort(listing.seller.responseMinutes) ? (
                <Text style={styles.muted}>
                  {formatResponseShort(listing.seller.responseMinutes)}
                </Text>
              ) : null}
              <Text style={styles.profileLink}>View profile →</Text>
            </Pressable>
            )}

            <Text style={styles.section}>Description</Text>
            <Text style={styles.copy} numberOfLines={descExpanded ? undefined : 2}>
              {listing.description || "No description."}
            </Text>
            {listing.description && listing.description.length > 80 ? (
              <Pressable
                onPress={() => setDescExpanded((v) => !v)}
                accessibilityRole="button"
              >
                <Text style={styles.profileLink}>
                  {descExpanded ? "Less" : "More"}
                </Text>
              </Pressable>
            ) : null}
            {!isOwner && !isSwap && !isGiveAway ? (
              <View style={styles.cartBlock}>
                <View style={styles.cartCue}>
                  <EmptyCartMark />
                  <Pressable
                    style={[
                      styles.cartOpenBtn,
                      (listing.quantityAvailable ?? 1) < 1 && styles.disabled,
                    ]}
                    disabled={(listing.quantityAvailable ?? 1) < 1}
                    onPress={() => setCartFormOpen(true)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cartOpenBtnText}>Add to cart</Text>
                  </Pressable>
                </View>
                {(listing.quantityAvailable ?? 1) < 1 ? (
                  <Text style={styles.orderHint}>No units left</Text>
                ) : null}
                {cartFormOpen && (listing.quantityAvailable ?? 1) > 0 ? (
                  <View style={styles.cartForm}>
                    <Text style={styles.orderHint}>How many units?</Text>
                    <View style={styles.qtyRow}>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => setQty((n) => Math.max(1, n - 1))}
                        accessibilityRole="button"
                        accessibilityLabel="Decrease quantity"
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValue}>{qty}</Text>
                      <Pressable
                        style={[
                          styles.qtyBtn,
                          qty >= (listing.quantityAvailable ?? 1) &&
                            styles.disabled,
                        ]}
                        disabled={qty >= (listing.quantityAvailable ?? 1)}
                        onPress={() =>
                          setQty((n) =>
                            Math.min(listing.quantityAvailable ?? 1, n + 1),
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Increase quantity"
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </Pressable>
                      <Text style={styles.orderHint}>
                        {listing.quantityAvailable ?? 1} available
                      </Text>
                    </View>
                    <Pressable
                      style={styles.orderBtn}
                      onPress={() => {
                        void (async () => {
                          if (isOwner) {
                            setToast("You can't add your own listing to the cart");
                            return;
                          }
                          const token = await getAccessToken();
                          if (!token || !listingId) {
                            setToast("Sign in to use the cart");
                            return;
                          }
                          const units = Math.min(
                            qty,
                            listing.quantityAvailable ?? 1,
                          );
                          try {
                            await addToCart(token, listingId, units);
                            setCartReady(true);
                            setToast(
                              units === 1
                                ? "Added to cart. Open your cart to place the order."
                                : `Added ${units} to cart. Open your cart to place the order.`,
                            );
                          } catch (err) {
                            setToast(
                              err instanceof ApiError
                                ? err.message
                                : "Could not add to cart",
                            );
                          }
                        })();
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.orderBtnText}>Add {qty} to cart</Text>
                    </Pressable>
                    {cartReady ? (
                      <Pressable
                        onPress={() => onOpenCart?.()}
                        accessibilityRole="button"
                      >
                        <Text style={styles.cartLink}>Go to cart</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.section}>Delivery</Text>
            <Text style={styles.copy}>
              {[
                listing.fulfilmentPickup ? "Pickup" : null,
                listing.fulfilmentMeet ? "Meet" : null,
                listing.fulfilmentDelivery
                  ? "Delivery (quote at checkout)"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Not set"}
            </Text>

            {listing.buyerProtection ? (
              <View style={styles.protect}>
                <Text style={styles.protectTitle}>Buyer protection</Text>
                <Text style={styles.muted}>
                  Pay on ReWorth when available — funds held until you confirm.
                </Text>
              </View>
            ) : null}

            {isSwap ? (
              <Text style={[styles.copy, styles.centerText]}>
                Propose a swap with one of your live listings
              </Text>
            ) : null}

            {similar.length > 0 ? (
              <View style={styles.similarBlock}>
                <Text style={styles.section}>Similar items</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.similarScroll}
                >
                  {similar.map((item) => {
                    const imgs = [...item.images].sort(
                      (a, b) => a.sortOrder - b.sortOrder,
                    );
                    const src = listingImageUrl(imgs[0]);
                    return (
                      <View key={item.id} style={styles.similarCard}>
                        {src ? (
                          <Image
                            source={{ uri: src }}
                            style={styles.similarImg}
                          />
                        ) : (
                          <View style={[styles.similarImg, styles.similarPh]} />
                        )}
                        <Text numberOfLines={2} style={styles.similarTitle}>
                          {item.title || "Untitled"}
                        </Text>
                        <Text style={styles.similarPrice}>
                          {formatNgnFromKobo(item.priceKobo)}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {toast ? (
              <Pressable onPress={() => setToast(null)}>
                <Text style={styles.toast}>{toast}</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={[styles.stickyBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            {isOwner ? (
              <>
                {listing && isVehicleListing(listing) && !inspectedBadgeLabel(listing) ? (
                  <Pressable
                    style={[styles.stickyOutline, { borderColor: c.border }]}
                    onPress={() => setInspectOpen(true)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.stickyOutlineText, { color: c.ink }]}>
                      Book inspection
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.stickyPrimary, { backgroundColor: c.orange, flex: 1 }]}
                  onPress={() => setBoostOpen(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.stickyPrimaryText}>Boost listing</Text>
                </Pressable>
              </>
            ) : isSwap ? (
              <Pressable
                style={[styles.stickyPrimary, { backgroundColor: c.orange, flex: 1 }]}
                onPress={() => {
                  if (!swapBusy) void openSwapSheet();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.stickyPrimaryText}>
                  {swapBusy ? "…" : "Propose swap"}
                </Text>
              </Pressable>
            ) : isGiveAway ? (
              <Pressable
                style={[styles.stickyPrimary, { backgroundColor: c.orange, flex: 1 }]}
                onPress={() => {
                  if (!claimBusy) void claimGiveaway();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.stickyPrimaryText}>
                  {claimBusy ? "…" : "Claim this item"}
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[styles.stickyOutline, { borderColor: c.border }]}
                  onPress={() => {
                    if (!chatBusy) void startChat();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Chat"
                  testID="pdp-chat"
                >
                  <Text style={{ color: c.ink, fontWeight: "600" }}>
                    {chatBusy ? "…" : "Chat"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.stickyGhost}
                  onPress={() => {
                    void hapticLight();
                    if (!saving) void toggleSave();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={saved ? "Unsave" : "Save"}
                  testID="pdp-save"
                >
                  <Text style={{ color: saved ? c.orange : c.ink, fontSize: 18 }}>
                    ♥
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.stickyOutline, { borderColor: c.border, flex: 1 }]}
                  onPress={() => setOfferOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Make offer"
                  testID="pdp-offer"
                >
                  <Text style={{ color: c.ink, fontWeight: "600" }}>Offer</Text>
                </Pressable>
                <Pressable
                  style={[styles.stickyPrimary, { backgroundColor: c.orange, flex: 1.2 }]}
                  onPress={() => {
                    if (listingId) onBuyNow?.(listingId);
                    else setToast("Coming soon");
                  }}
                  accessibilityRole="button"
                  testID="pdp-buy"
                >
                  <Text style={styles.stickyPrimaryText}>Buy Now</Text>
                </Pressable>
              </>
            )}
          </View>
          </>
        )}

        <BottomSheet
          visible={offerOpen}
          title="Make offer"
          onClose={() => setOfferOpen(false)}
        >
          {listing ? (
            <Text style={styles.muted}>
              Asking {formatNgnFromKobo(listing.priceKobo)}
              {listing.negotiable ? " · negotiable" : ""}
            </Text>
          ) : null}
          <Text style={styles.label}>Your offer (₦)</Text>
          <TextInput
            style={styles.input}
            value={offerNaira}
            onChangeText={setOfferNaira}
            keyboardType="numeric"
            placeholder="45000"
            accessibilityLabel="Offer amount in naira"
          />
          {listing && listing.priceKobo > 0 ? (
            <View style={styles.offerChips}>
              {[0.9, 0.85, 0.8].map((pct) => {
                const naira = Math.round((listing.priceKobo * pct) / 100);
                return (
                  <Pressable
                    key={pct}
                    style={styles.offerChip}
                    onPress={() => setOfferNaira(String(naira))}
                    accessibilityRole="button"
                    accessibilityLabel={`${Math.round(pct * 100)} percent of asking`}
                  >
                    <Text style={styles.offerChipText}>
                      {Math.round(pct * 100)}% · ₦{naira.toLocaleString("en-NG")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, offerBusy && styles.disabled]}
            disabled={offerBusy}
            onPress={() => void submitOffer()}
          >
            <Text style={styles.primaryBtnText}>
              {offerBusy ? "Sending…" : "Send offer"}
            </Text>
          </Pressable>
        </BottomSheet>

        <BottomSheet
          visible={inspectOpen}
          title="Book vehicle inspection"
          onClose={() => setInspectOpen(false)}
        >
          <Text style={styles.muted}>
            Pay the inspection fee, then pick a Lagos slot. Results show as
            Inspected ✓ on your listing.
          </Text>
          <Text style={styles.label}>Preferred slot</Text>
          {INSPECTION_SLOTS.map((slot) => (
            <Pressable
              key={slot}
              style={[
                styles.pickRow,
                inspectSlot === slot && styles.pickRowActive,
              ]}
              onPress={() => setInspectSlot(slot)}
            >
              <Text style={styles.pickTitle}>{slot}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.primaryBtn, inspectBusy && styles.disabled]}
            disabled={inspectBusy}
            onPress={() => void startInspection()}
          >
            <Text style={styles.primaryBtnText}>
              {inspectBusy
                ? "Booking…"
                : inspectId
                  ? "Retry booking"
                  : "Pay & schedule"}
            </Text>
          </Pressable>
        </BottomSheet>

        <Modal visible={swapOpen} animationType="slide" transparent>
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Propose a swap</Text>
              {myListings.length === 0 ? (
                <Text style={styles.muted}>
                  You need a live listing to swap. Create one first.
                </Text>
              ) : (
                <>
                  <Text style={styles.label}>Your offer</Text>
                  {myListings.map((l) => (
                    <Pressable
                      key={l.id}
                      style={[
                        styles.pickRow,
                        swapSelected === l.id && styles.pickRowActive,
                      ]}
                      onPress={() => setSwapSelected(l.id)}
                    >
                      <Text style={styles.pickTitle} numberOfLines={1}>
                        {l.title || "Untitled"}
                      </Text>
                      <Text style={styles.muted}>
                        {formatNgnFromKobo(l.priceKobo)}
                      </Text>
                    </Pressable>
                  ))}
                  <Text style={styles.label}>Cash top-up (₦)</Text>
                  <TextInput
                    style={styles.input}
                    value={swapCashNaira}
                    onChangeText={setSwapCashNaira}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                  <Pressable
                    style={[styles.primaryBtn, swapBusy && styles.disabled]}
                    disabled={swapBusy}
                    onPress={() => void submitSwap()}
                  >
                    <Text style={styles.primaryBtnText}>
                      {swapBusy ? "Sending…" : "Send swap proposal"}
                    </Text>
                  </Pressable>
                </>
              )}
              <Pressable onPress={() => setSwapOpen(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={boostOpen} animationType="slide" transparent>
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Boost listing</Text>
              <Text style={styles.muted}>
                More visibility in discovery for a short window.
              </Text>
              <Text style={styles.label}>Duration</Text>
              <View style={styles.durationRow}>
                {BOOST_DURATIONS_HOURS.map((h) => (
                  <Pressable
                    key={h}
                    style={[
                      styles.durationChip,
                      boostHours === h && styles.durationChipActive,
                    ]}
                    onPress={() => setBoostHours(h)}
                  >
                    <Text
                      style={[
                        styles.durationChipText,
                        boostHours === h && styles.durationChipTextActive,
                      ]}
                    >
                      {h === 168 ? "7 days" : `${h}h`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.copy}>
                {quoteBusy
                  ? "Getting price…"
                  : boostQuote
                    ? `Price: ${formatNgnFromKobo(boostQuote.priceKobo)}`
                    : "Price unavailable"}
              </Text>
              <Pressable
                style={[
                  styles.primaryBtn,
                  (boostBusy || quoteBusy || !boostQuote) && styles.disabled,
                ]}
                disabled={boostBusy || quoteBusy || !boostQuote}
                onPress={() => void confirmBoost()}
              >
                <Text style={styles.primaryBtnText}>
                  {boostBusy ? "Paying…" : "Confirm & pay"}
                </Text>
              </Pressable>
              {featuredQuote ? (
                <Pressable
                  style={[
                    styles.secondarySheetBtn,
                    boostBusy && styles.disabled,
                  ]}
                  disabled={boostBusy}
                  onPress={() => void confirmFeatured()}
                >
                  <Text style={styles.secondarySheetBtnText}>
                    Feature instead · {formatNgnFromKobo(featuredQuote.priceKobo)}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setBoostOpen(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function EmptyCartMark() {
  return (
    <View style={cartMarkStyles.wrap} accessibilityElementsHidden>
      <View style={cartMarkStyles.handle} />
      <View style={cartMarkStyles.basket} />
      <View style={cartMarkStyles.wheels}>
        <View style={cartMarkStyles.wheel} />
        <View style={cartMarkStyles.wheel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  brand: { fontSize: 20, fontWeight: "700", color: colors.ink },
  close: { fontSize: 16, fontWeight: "600", color: colors.orange },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingBottom: 40 },
  hero: {
    height: 320,
    backgroundColor: colors.border,
  },
  heroEmpty: { alignItems: "center", justifyContent: "center" },
  counterChip: {
    position: "absolute",
    right: 16,
    bottom: 16,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 28,
    justifyContent: "center",
  },
  priceRow: {
    marginTop: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  negoChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  stickyPrimary: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  stickyPrimaryText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },
  stickyOutline: {
    minHeight: 48,
    minWidth: 56,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  stickyOutlineText: { fontWeight: "700", fontSize: 14 },
  stickyGhost: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  price: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.ink,
  },
  title: {
    marginTop: 8,
    paddingHorizontal: 20,
    fontSize: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  meta: { marginTop: 8, paddingHorizontal: 20, fontSize: 13, color: colors.muted },
  section: {
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 20,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  copy: {
    paddingHorizontal: 20,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  seller: {
    marginTop: 20,
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  protect: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  similarBlock: { marginTop: 8, paddingLeft: 20 },
  chip: {
    marginTop: 8,
    marginHorizontal: 20,
    alignSelf: "flex-start",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.beige,
    fontSize: 13,
    fontWeight: "600",
    color: colors.orange,
  },
  badgeRow: {
    marginTop: 10,
    marginHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  verticalBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.orangeWash,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
  },
  instantBuyBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.orangeWash,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.orange,
  },
  promoBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.goldWash,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.gold,
  },
  promoBadgeFeatured: {
    alignSelf: "flex-start",
    backgroundColor: colors.beige,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.navy,
  },
  verticalBadgeMuted: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  sellerName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  trustBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: colors.goldWash,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.gold,
  },
  profileLink: {
    marginTop: 8,
    marginHorizontal: 20,
    fontSize: 14,
    fontWeight: "600",
    color: colors.orange,
  },
  muted: { marginTop: 4, fontSize: 13, color: colors.muted },
  protectTitle: { fontSize: 14, fontWeight: "700", color: colors.orange },
  similarScroll: { marginTop: 10 },
  similarCard: { width: 132, marginRight: 10 },
  similarImg: {
    width: 132,
    height: 100,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  similarPh: { backgroundColor: colors.border },
  similarTitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  similarPrice: { marginTop: 2, fontSize: 13, fontWeight: "700", color: colors.ink },
  centerText: { textAlign: "center", marginTop: 16 },
  actions: {
    marginTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cartBlock: { marginTop: 20, gap: 12 },
  cartCue: { alignItems: "center", gap: 10 },
  cartOpenBtn: {
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  cartOpenBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  cartForm: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7E2",
    backgroundColor: "#FFFFFF",
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E7E2",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 18, fontWeight: "700", color: "#111315" },
  qtyValue: { minWidth: 20, textAlign: "center", fontSize: 16, fontWeight: "700" },
  orderHint: { fontSize: 14, color: "#5C636A" },
  orderBtn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  orderBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  cartLink: {
    textAlign: "center",
    color: colors.orange,
    fontWeight: "700",
    fontSize: 15,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  actionPrimary: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  actionText: { fontSize: 15, fontWeight: "700", color: colors.ink },
  actionTextPrimary: { color: colors.onAccent },
  toast: {
    marginTop: 16,
    textAlign: "center",
    color: colors.orange,
    fontWeight: "600",
  },
  error: { color: colors.error, fontSize: 15 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 16 },
  offerChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  offerChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.beige,
  },
  offerChipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  cancel: {
    marginTop: 14,
    textAlign: "center",
    color: colors.orange,
    fontWeight: "600",
  },
  disabled: { opacity: 0.55 },
  pickRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  pickRowActive: {
    borderColor: colors.orange,
    backgroundColor: colors.orangeWash,
  },
  pickTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  durationChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  durationChipActive: {
    borderColor: colors.orange,
    backgroundColor: colors.orangeWash,
  },
  durationChipText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  durationChipTextActive: { color: colors.orange },
  secondarySheetBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondarySheetBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
});

const cartMarkStyles = StyleSheet.create({
  wrap: { width: 84, height: 78, alignItems: "center" },
  handle: {
    width: 34,
    height: 14,
    marginLeft: 8,
    alignSelf: "flex-start",
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#5C636A",
    borderTopRightRadius: 10,
  },
  basket: {
    width: 64,
    height: 32,
    marginTop: 2,
    borderWidth: 3,
    borderColor: "#5C636A",
    borderRadius: 8,
  },
  wheels: { flexDirection: "row", gap: 18, marginTop: 6 },
  wheel: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#5C636A",
  },
});
