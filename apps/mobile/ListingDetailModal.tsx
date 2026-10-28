import { createElement, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import * as Clipboard from "./lib/clipboard";
import { ScrollView } from "./components/BoundScroll";
import { BottomSheet } from "./components/BottomSheet";
import { brandAssets } from "./lib/brandAssets";
import { ListingReviews } from "./components/ListingReviews";
import { Skeleton } from "./components/Skeleton";
import { ApiError, apiFetch } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import {
  createConversation,
  createOffer,
  nairaToKobo,
} from "./lib/chat";
import {
  conditionLabel,
  favouriteListing,
  getMeFavourites,
  unfavouriteListing,
} from "./lib/discovery";
import {
  getListing,
  listingShareLinks,
  removeListing,
  uploadListingPhotoDirect,
} from "./lib/listings";
import { addToCart, listCart } from "./lib/cart";
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
import { createSwapProposal, startSwapOffer } from "./lib/swap";
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


type Props = {
  listingId: string | null;
  onClose: () => void;
  dismissLabel?: string;
  onOpenChat?: (conversationId: string) => void;
  onBuyNow?: (listingId: string, quantity?: number) => void;
  onOpenSeller?: (sellerId: string) => void;
  onOpenCart?: () => void;
  onContinueDraft?: (listingId: string) => void;
  onDraftDeleted?: () => void;
  onSavedChange?: (listingId: string, saved: boolean) => void;
  onOpenListing?: (listingId: string) => void;
};

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function ListingDetailModal({
  listingId,
  onClose,
  dismissLabel = "Close",
  onOpenChat,
  onBuyNow,
  onOpenSeller,
  onOpenCart,
  onContinueDraft,
  onDraftDeleted,
  onSavedChange,
  onOpenListing,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(windowHeight * 0.5);
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [qty, setQty] = useState(1);
  const [inCart, setInCart] = useState(0);
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
  const [shareOpen, setShareOpen] = useState(false);
  const [swapPhotos, setSwapPhotos] = useState<
    { uri: string; name: string; type: string; file?: Blob }[]
  >([]);
  const [swapTitle, setSwapTitle] = useState("");
  const [swapDescription, setSwapDescription] = useState("");
  const [swapDate, setSwapDate] = useState("");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [similar, setSimilar] = useState<PublicListing[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [boostOpen, setBoostOpen] = useState(false);
  const [boostHours, setBoostHours] = useState<(typeof BOOST_DURATIONS_HOURS)[number]>(24);
  const [boostQuote, setBoostQuote] = useState<BoostQuote | null>(null);
  const [featuredQuote, setFeaturedQuote] = useState<FeaturedQuote | null>(null);
  const [boostBusy, setBoostBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectSlot, setInspectSlot] = useState<string>(INSPECTION_SLOTS[0]);
  const c = useColors();
  const similarInCategory = useMemo(
    () =>
      similar.filter((item) => {
        if (!listing?.category?.id) return false;
        return item.category?.id === listing.category.id;
      }),
    [similar, listing?.category?.id],
  );

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
      setInCart(0);
      setQty(1);
      setBoostOpen(false);
      setGalleryIndex(0);
      setDescExpanded(false);
      setSwapOpen(false);
      setShareOpen(false);
      return;
    }
    setGalleryIndex(0);
    setSwapOpen(false);
    setShareOpen(false);
    setDescExpanded(false);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const data = await getListing(listingId, token);
        if (!cancelled) setListing(data);
        if (data.status === "DRAFT") {
          if (!cancelled) {
            setSimilar([]);
            setInCart(0);
            setSaved(false);
          }
          if (token && !cancelled) {
            try {
              const me = await apiFetch<MeResponse>("/me", { token });
              if (!cancelled) setMeId(me.id);
            } catch {
              if (!cancelled) setMeId(null);
            }
          }
          return;
        }
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
            const cart = await listCart(token);
            if (!cancelled) {
              setInCart(
                cart.find((item) => item.listing.id === listingId)?.quantity ??
                  0,
              );
            }
          } catch {
            if (!cancelled) setInCart(0);
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
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load this listing",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const stock = listing?.quantityAvailable ?? 1;
  const remaining = Math.max(0, stock - inCart);

  useEffect(() => {
    if (remaining < 1) return;
    setQty((current) => Math.min(Math.max(1, current), remaining));
  }, [remaining]);

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
      onSavedChange?.(listingId, next);
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
    setSwapOpen(true);
  }

  async function addSwapPhotos() {
    try {
      const ImagePicker = require("expo-image-picker") as {
        requestMediaLibraryPermissionsAsync: () => Promise<{ status: string }>;
        launchImageLibraryAsync: (opts: object) => Promise<{
          canceled: boolean;
          assets?: Array<{
            uri: string;
            fileName?: string | null;
            mimeType?: string | null;
            file?: Blob | null;
          }>;
        }>;
      };
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setToast("Allow photo access to propose a swap");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 6,
      });
      if (result.canceled || !result.assets?.length) return;
      setSwapPhotos((prev) =>
        [
          ...prev,
          ...result.assets!.map((asset) => ({
            uri: asset.uri,
            name: asset.fileName || "photo.jpg",
            type: asset.mimeType || "image/jpeg",
            file: asset.file ?? undefined,
          })),
        ].slice(0, 6),
      );
    } catch {
      setToast("Could not open your photos");
    }
  }

  async function submitSwap() {
    if (!listingId) return;
    const title = swapTitle.trim();
    const description = swapDescription.trim();
    if (swapPhotos.length === 0) {
      setSwapError("Add at least one photo of the item you want to swap");
      return;
    }
    if (title.length < 2) {
      setSwapError("Add a title for the item you want to swap");
      return;
    }
    if (description.length < 10) {
      setSwapError("Describe the item you want to swap");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(swapDate) || swapDate < todayIso()) {
      setSwapError("Choose a delivery day that is today or later");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setSwapError("Sign in to propose a swap");
      return;
    }
    setSwapBusy(true);
    setSwapError(null);
    try {
      const offer = await startSwapOffer(token, listingId);
      for (let i = 0; i < swapPhotos.length; i += 1) {
        const photo = swapPhotos[i];
        await uploadListingPhotoDirect(
          token,
          offer.listingId,
          photo,
          i,
        );
      }
      const proposal = await createSwapProposal(token, listingId, {
        offeredListingId: offer.listingId,
        title,
        description,
        deliveryOn: swapDate,
      });
      if (proposal.conversationId) onOpenChat?.(proposal.conversationId);
      setSwapOpen(false);
      setSwapPhotos([]);
      setSwapTitle("");
      setSwapDescription("");
      setSwapDate("");
    } catch (err) {
      setSwapError(err instanceof ApiError ? err.message : "Proposal failed");
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

  function claimGiveaway() {
    if (!listingId) return;
    onBuyNow?.(listingId);
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

  const isSwap = listing?.sellingMode === "SWAP";
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
            {listingId && listing?.status === "LIVE" ? (
              <Pressable
                onPress={() => setShareOpen(true)}
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
            key={listingId ?? "listing"}
            style={styles.pageScroll}
            contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
          >
            <View
              style={[styles.heroWrap, { height: heroHeight }]}
              accessibilityLabel="Listing photo gallery"
            >
              {gallery[galleryIndex] ? (
                <Image
                  source={{ uri: gallery[galleryIndex] }}
                  style={[styles.hero, { height: heroHeight }]}
                  resizeMode="cover"
                  accessibilityLabel={`Photo of ${listing.title || "listing"}, ${galleryIndex + 1} of ${gallery.length}`}
                />
              ) : (
                <View
                  style={[
                    styles.hero,
                    styles.heroEmpty,
                    { height: heroHeight, backgroundColor: c.emeraldWash },
                  ]}
                >
                  <Text style={{ color: c.muted }}>No photo</Text>
                </View>
              )}
              {galleryIndex > 0 ? (
                <Pressable
                  onPress={() => setGalleryIndex((i) => Math.max(0, i - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Previous photo"
                  style={[styles.arrow, styles.arrowLeft]}
                >
                  <Text style={styles.arrowText}>‹</Text>
                </Pressable>
              ) : null}
              {galleryIndex < gallery.length - 1 ? (
                <Pressable
                  onPress={() =>
                    setGalleryIndex((i) => Math.min(gallery.length - 1, i + 1))
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Next photo"
                  style={[styles.arrow, styles.arrowRight]}
                >
                  <Text style={styles.arrowText}>›</Text>
                </Pressable>
              ) : null}
              {gallery.length > 1 ? (
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
                {!isGiveAway && !isSwap && listing.status === "SOLD"
                  ? " · Sold"
                  : ""}
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
              {conditionLabel(listing.condition)} · {listing.community || "Lagos"}
            </Text>
            {!isOwner && !isSwap && !isGiveAway && listing.status !== "SOLD" ? (
              <View style={styles.cartBlock}>
                <View style={styles.cartIconFrame}>
                  <Image
                    source={brandAssets.actionBuy}
                    style={styles.cartIcon}
                    resizeMode="contain"
                    accessibilityElementsHidden
                  />
                </View>
                <View style={styles.cartActions}>
                  <Pressable
                    style={[
                      styles.cartOpenBtn,
                      (stock < 1 || remaining < 1) && styles.disabled,
                    ]}
                    disabled={stock < 1 || remaining < 1}
                    onPress={() => {
                      setQty(1);
                      setCartFormOpen(true);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cartOpenBtnText}>
                      {remaining < 1 && inCart > 0 ? "In your cart" : "Add to cart"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.cartOfferBtn}
                    onPress={() => setOfferOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Make offer"
                  >
                    <Text style={styles.cartOfferBtnText}>Make offer</Text>
                  </Pressable>
                </View>
                {stock < 1 ? (
                  <Text style={styles.orderHint}>No units left</Text>
                ) : null}
                {inCart > 0 ? (
                  <Text style={styles.orderHint}>
                    {inCart} already in your cart
                    {remaining > 0 ? ` · ${remaining} still available` : ""}
                  </Text>
                ) : null}
                {cartFormOpen && remaining > 0 ? (
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
                          qty >= remaining && styles.disabled,
                        ]}
                        disabled={qty >= remaining}
                        onPress={() =>
                          setQty((n) => Math.min(remaining, n + 1))
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Increase quantity"
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </Pressable>
                      <Text style={styles.orderHint}>
                        {remaining} available
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
                          const adding = Math.min(qty, remaining);
                          if (adding < 1) return;
                          try {
                            const saved = await addToCart(
                              token,
                              listingId,
                              inCart + adding,
                            );
                            setInCart(saved.quantity);
                            setQty(1);
                            setCartReady(true);
                            setToast(
                              adding === 1
                                ? "Added to cart. Open your cart to place the order."
                                : `Added ${adding} to cart. Open your cart to place the order.`,
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
                      <Text style={styles.orderBtnText}>
                        Add {Math.min(qty, remaining)} to cart
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {inCart > 0 || cartReady ? (
                  <Pressable
                    onPress={() => onOpenCart?.()}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cartLink}>Go to cart</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
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

            <ListingReviews listingId={listing.id} />

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

            <Text style={styles.section}>Delivery</Text>
            <Text style={styles.copy}>
              ReWorth delivery. The courier is simulated for now, and the fee is
              quoted at checkout.
            </Text>

            {listing.buyerProtection ? (
              <View style={styles.protect}>
                <Text style={styles.protectTitle}>Buyer protection</Text>
                <Text style={styles.muted}>
                  Pay on ReWorth when available — funds held until you confirm.
                </Text>
              </View>
            ) : null}

            {similarInCategory.length > 0 ? (
              <View style={styles.similarBlock}>
                <Text style={styles.section}>Similar items</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.similarScroll}
                >
                  {similarInCategory.map((item) => {
                    const imgs = [...item.images].sort(
                      (a, b) => a.sortOrder - b.sortOrder,
                    );
                    const src = listingImageUrl(imgs[0]);
                    return (
                      <Pressable
                        key={item.id}
                        style={styles.similarCard}
                        onPress={() => {
                          void hapticLight();
                          onOpenListing?.(item.id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={item.title || "Untitled"}
                      >
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
                      </Pressable>
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

          {isOwner && listing.status !== "DRAFT" && listing.status !== "LIVE" ? null : (
          <View style={[styles.stickyBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            {isOwner && listing.status === "DRAFT" ? (
              <>
                <Pressable
                  style={[styles.stickyOutline, { borderColor: c.border }]}
                  onPress={() => setDeleteOpen(true)}
                  disabled={deleting}
                  accessibilityRole="button"
                  accessibilityLabel="Delete draft"
                >
                  <Text style={[styles.stickyOutlineText, { color: c.ink }]}>
                    {deleting ? "Deleting…" : "Delete draft"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.stickyPrimary, { backgroundColor: c.orange, flex: 1 }]}
                  onPress={() => onContinueDraft?.(listing.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Continue draft"
                >
                  <Text style={styles.stickyPrimaryText}>Continue</Text>
                </Pressable>
              </>
            ) : isOwner ? (
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
                onPress={claimGiveaway}
                accessibilityRole="button"
              >
                <Text style={styles.stickyPrimaryText}>Get this gift</Text>
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
                {listing.status === "SOLD" ? (
                  <View style={[styles.stickyPrimary, { backgroundColor: c.surface, flex: 1.2 }]}>
                    <Text style={{ color: c.muted, fontWeight: "700" }}>Sold</Text>
                  </View>
                ) : (
                  <>
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
              </>
            )}
          </View>
          )}
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

        {shareOpen && listingId ? (
          <View style={styles.swapOverlay}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setShareOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close share"
            />
            <View
              style={[
                styles.sheet,
                { backgroundColor: c.surface, padding: 20, gap: 10 },
              ]}
            >
              <Text style={styles.sheetTitle}>Share this listing</Text>
              {(
                [
                  ["WhatsApp", "whatsapp"],
                  ["Facebook", "facebook"],
                  ["X", "x"],
                ] as const
              ).map(([label, key]) => {
                const links = listingShareLinks(
                  listingId,
                  listing?.title || "ReWorth listing",
                );
                return (
                  <Pressable
                    key={key}
                    style={styles.shareBtn}
                    onPress={() => {
                      void Linking.openURL(links[key]);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Share on ${label}`}
                  >
                    <Text style={styles.primaryBtnText}>{label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={styles.shareBtnAlt}
                onPress={() => {
                  const links = listingShareLinks(
                    listingId,
                    listing?.title || "ReWorth listing",
                  );
                  void (async () => {
                    try {
                      if (
                        Platform.OS === "web" &&
                        typeof navigator !== "undefined" &&
                        navigator.clipboard
                      ) {
                        await navigator.clipboard.writeText(links.message);
                      } else {
                        await Clipboard.setString(links.message);
                      }
                      setShareOpen(false);
                      setToast("Link copied");
                    } catch {
                      setToast("Could not copy link");
                    }
                  })();
                }}
                accessibilityRole="button"
                accessibilityLabel="Copy link"
              >
                <Text style={styles.shareBtnAltText}>Copy link</Text>
              </Pressable>
              {Platform.OS !== "web" ? (
                <Pressable
                  style={styles.shareBtnAlt}
                  onPress={() => {
                    const links = listingShareLinks(
                      listingId,
                      listing?.title || "ReWorth listing",
                    );
                    void Share.share({
                      message: links.message,
                      title: listing?.title || "ReWorth listing",
                      url: links.url,
                    }).catch(() => setToast("Could not open share"));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="More share options"
                >
                  <Text style={styles.shareBtnAltText}>More</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setShareOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={[styles.close, { color: c.orange, textAlign: "center" }]}>
                  Close
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {swapOpen ? (
          <View style={styles.swapOverlay}>
            <ScrollView
              style={[styles.sheet, { maxHeight: "92%" }]}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.swapSheetContent}
            >
              <Text style={styles.sheetTitle}>Propose a swap</Text>
              <Text style={styles.muted}>
                Add photos, a title, a description, and the day you want the
                items delivered. We check that the photos match before the
                other person can accept or reject.
              </Text>
              <Text style={styles.label}>Title</Text>
              <TextInput
                value={swapTitle}
                onChangeText={setSwapTitle}
                placeholder="What are you offering?"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxLength={140}
              />
              <Text style={styles.label}>Description</Text>
              <TextInput
                value={swapDescription}
                onChangeText={setSwapDescription}
                placeholder="Condition, brand, and anything they should know"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.swapDescription]}
                multiline
                maxLength={4000}
              />
              <View style={styles.swapPhotoRow}>
                {swapPhotos.map((photo) => (
                  <Pressable
                    key={photo.uri}
                    onPress={() =>
                      setSwapPhotos((prev) =>
                        prev.filter((item) => item.uri !== photo.uri),
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Remove this photo"
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.swapPhoto}
                      resizeMode="cover"
                      pointerEvents="none"
                    />
                  </Pressable>
                ))}
              </View>
              <Text style={styles.muted}>Tap a photo to remove it.</Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void addSwapPhotos()}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Add photos</Text>
              </Pressable>
              <Text style={styles.label}>Delivery day</Text>
              {Platform.OS === "web" ? (
                createElement("input", {
                  type: "date",
                  value: swapDate,
                  min: todayIso(),
                  onChange: (event: { target: { value: string } }) =>
                    setSwapDate(event.target.value),
                  "aria-label": "Delivery day",
                  style: {
                    marginTop: 0,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontSize: 16,
                    color: colors.ink,
                    backgroundColor: colors.surface,
                    width: "100%",
                  },
                })
              ) : (
                <TextInput
                  value={swapDate}
                  onChangeText={setSwapDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  autoCapitalize="none"
                />
              )}
              {swapError ? (
                <View style={styles.swapNotice} accessibilityRole="alert">
                  <Text style={styles.swapNoticeText}>{swapError}</Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.primaryBtn, swapBusy && styles.disabled]}
                disabled={swapBusy}
                onPress={() => void submitSwap()}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>
                  {swapBusy ? "Checking photos…" : "Send swap proposal"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!swapBusy) setSwapOpen(false);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}

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
        {deleteOpen ? (
          <View style={styles.confirmBackdrop}>
            <View style={[styles.confirmCard, { backgroundColor: c.surface }]}>
              <Text style={[styles.confirmTitle, { color: c.ink }]}>Delete draft</Text>
              <Text style={[styles.confirmCopy, { color: c.muted }]}>
                Delete “{listing?.title || "this draft"}”? This cannot be undone.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setDeleteOpen(false)}
                  accessibilityRole="button"
                  style={styles.confirmCancel}
                >
                  <Text style={{ color: c.ink, fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void (async () => {
                      if (!listingId) return;
                      const token = await getAccessToken();
                      if (!token) return;
                      setDeleting(true);
                      try {
                        await removeListing(token, listingId);
                        setDeleteOpen(false);
                        onDraftDeleted?.();
                      } catch (err) {
                        setDeleteOpen(false);
                        setToast(
                          err instanceof ApiError
                            ? err.message
                            : "Could not delete this draft",
                        );
                      } finally {
                        setDeleting(false);
                      }
                    })();
                  }}
                  disabled={deleting}
                  accessibilityRole="button"
                  style={styles.confirmDelete}
                >
                  <Text style={styles.confirmDeleteText}>
                    {deleting ? "Deleting…" : "Delete"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
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
  pageScroll: { flex: 1 },
  body: { paddingBottom: 40 },
  heroWrap: { position: "relative", overflow: "hidden", width: "100%" },
  hero: {
    width: "100%",
    backgroundColor: colors.border,
  },
  arrow: {
    position: "absolute",
    top: "50%",
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },
  arrowText: { fontSize: 28, fontWeight: "600", lineHeight: 32, color: "#111315" },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,19,21,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 30,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: "700" },
  confirmCopy: { fontSize: 15, lineHeight: 22 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  confirmCancel: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  confirmDelete: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#DC2626",
  },
  confirmDeleteText: { color: "#FFFFFF", fontWeight: "700" },
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
  similarCard: { width: 120, marginRight: 10 },
  similarImg: {
    width: 120,
    height: 160,
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
  cartIconFrame: {
    width: 72,
    height: 66,
    overflow: "hidden",
    alignSelf: "center",
  },
  cartIcon: { width: 112, height: 112, marginTop: -12, marginLeft: -20 },
  cartBlock: {
    marginTop: 16,
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E7E2",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  cartActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  cartOpenBtn: {
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cartOpenBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  cartOfferBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4E7E2",
    backgroundColor: "#F7F6F3",
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cartOfferBtnText: { color: "#111315", fontWeight: "700", fontSize: 14 },
  cartForm: {
    width: "100%",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7E2",
    backgroundColor: "#FAF9F6",
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
  swapOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  swapSheetContent: { paddingBottom: 28 },
  swapDescription: { minHeight: 96, textAlignVertical: "top" },
  swapPhotoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  swapPhoto: { width: 88, height: 88, borderRadius: 12 },
  swapNotice: {
    backgroundColor: colors.orangeWash,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  swapNoticeText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
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
  shareBtn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  shareBtnAlt: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  shareBtnAltText: { color: colors.ink, fontWeight: "700", fontSize: 16 },
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
