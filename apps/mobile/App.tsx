import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { subscribeChat } from "./lib/chat-socket";
import { parseDeepLink, unreadNotificationCount } from "./lib/notifications";
import { ChatsPanel } from "./ChatScreens";
import { ListingDetailModal } from "./ListingDetailModal";
import {
  CheckoutModal,
  DisputeModal,
  OrderDetailModal,
  OrdersPanel,
} from "./OrdersScreens";
import { SellFlow } from "./SellFlow";
import {
  DiscoveryHome,
  FavouritesPanel,
  SearchPanel,
} from "./DiscoveryScreens";
import { CartPanel, InventoryPanel } from "./CartScreens";
import { UserProfileModal } from "./UserProfileModal";
import { PrivacySettings } from "./PrivacySettings";
import { NotificationsModal } from "./NotificationsScreens";
import { SellerListingsPanel, ListingFixModal } from "./SellerListings";
import {
  PlatformToolsModal,
  type PlatformTool,
} from "./PlatformTools";
import { OnboardingFlow } from "./OnboardingFlow";
import { LandingScreen } from "./LandingScreen";
import { apiFetch, ApiError } from "./lib/api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setUnauthorizedHandler,
} from "./lib/auth";
import { registerDevicePushToken } from "./lib/push";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "./lib/areas";
import { getRegion, listRegions, type RegionCity } from "./lib/region";
import { type MeResponse } from "./lib/types";
import { colors } from "./theme/tokens";

type Tab = "home" | "discover" | "sell" | "listings" | "chats" | "profile";
type ProfileSubtab =
  | "account"
  | "saved"
  | "orders"
  | "cart"
  | "inventory"
  | "updates";

const SIDE_NAV: {
  id: string;
  label: string;
  tab: Tab;
  sub?: ProfileSubtab;
}[] = [
  { id: "home", label: "Home", tab: "home" },
  { id: "discover", label: "Discover", tab: "discover" },
  { id: "sell", label: "Sell", tab: "sell" },
  { id: "listings", label: "My listings", tab: "listings" },
  { id: "chats", label: "Chats", tab: "chats" },
  { id: "saved", label: "Wishlist", tab: "profile", sub: "saved" },
  { id: "cart", label: "Cart", tab: "profile", sub: "cart" },
  { id: "orders", label: "Orders", tab: "profile", sub: "orders" },
  { id: "inventory", label: "Stock", tab: "profile", sub: "inventory" },
  { id: "account", label: "Account", tab: "profile", sub: "account" },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  /** Guest entry: landing first; onboarding only for register. */
  const [guestMode, setGuestMode] = useState<"landing" | "login" | "register">(
    "landing",
  );
  const [active, setActive] = useState<Tab>("home");
  const [navOpen, setNavOpen] = useState(false);
  const [unreadNotes, setUnreadNotes] = useState(0);

  const [displayName, setDisplayName] = useState("");
  const [community, setCommunity] = useState("");
  const [profileRegions, setProfileRegions] = useState<RegionCity[]>([
    ...FALLBACK_STATES,
  ]);
  const [profileStateKey, setProfileStateKey] = useState("");
  const [profileAreas, setProfileAreas] = useState<AreaChoice[]>([]);
  const [bio, setBio] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [homeSearchOpen, setHomeSearchOpen] = useState(false);
  const [platformTool, setPlatformTool] = useState<PlatformTool>(null);
  const [cityLabel, setCityLabel] = useState("Lagos");
  const [profileSubtab, setProfileSubtab] = useState<ProfileSubtab>("account");
  const [checkoutParams, setCheckoutParams] = useState<{
    listingId: string;
    offerId?: string;
    orderIntentId?: string;
    quantity?: number;
  } | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [fixListingId, setFixListingId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [sellerReturnListingId, setSellerReturnListingId] = useState<
    string | null
  >(null);
  const [listingReturnSellerId, setListingReturnSellerId] = useState<
    string | null
  >(null);

  useEffect(() => {
    function handleUrl(url: string | null) {
      if (!url) return;
      const parsed = parseDeepLink(url);
      if (parsed?.kind === "order" && parsed.id) setOrderId(parsed.id);
      else if (parsed?.kind === "dispute" && parsed.id) setDisputeId(parsed.id);
      else if (parsed?.kind === "chat" && parsed.id) {
        setOpenChatId(parsed.id);
        setActive("chats");
      } else if (parsed?.kind === "listing" && parsed.id) setDetailId(parsed.id);
      else if (parsed?.kind === "selling") {
        setActive("listings");
        if (parsed.id) setFixListingId(parsed.id);
      }
    }
    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  const refreshMe = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setAuthed(false);
      setMe(null);
      setGuestMode("landing");
      return;
    }
    try {
      const profile = await apiFetch<MeResponse>("/me", { token });
      setMe(profile);
      setAuthed(true);
      if (profile.profile?.displayName) {
        setDisplayName(profile.profile.displayName);
      }
      if (profile.profile?.bio) setBio(profile.profile.bio);
      const pref = profile.profile?.preferredCommunity?.trim() ?? "";
      if (pref) setCommunity(pref);
    } catch {
      await clearTokens();
      setAuthed(false);
      setMe(null);
      setGuestMode("landing");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthed(false);
      setMe(null);
      setGuestMode("landing");
      setError(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (token) {
        await refreshMe();
      } else {
        setGuestMode("landing");
      }
      setBooting(false);
    })();
  }, [refreshMe]);

  useEffect(() => {
    void listRegions()
      .then((items) => {
        const list = items.length > 0 ? items : [...FALLBACK_STATES];
        setProfileRegions(list);
        const lagos = list.find((c) => c.city === "lagos");
        if (lagos) setCityLabel(lagos.displayName);
        else if (list[0]) setCityLabel(list[0].displayName);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!profileStateKey) {
      setProfileAreas([]);
      return;
    }
    let cancelled = false;
    void getRegion(profileStateKey)
      .then((detail) => {
        if (cancelled) return;
        const source =
          detail?.areas && detail.areas.length > 0
            ? detail.areas
            : (FALLBACK_AREAS[profileStateKey] ?? []);
        setProfileAreas(areaChoices(profileStateKey, source));
      })
      .catch(() => {
        if (!cancelled) {
          setProfileAreas(
            areaChoices(profileStateKey, FALLBACK_AREAS[profileStateKey] ?? []),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileStateKey]);

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        await registerDevicePushToken(token);
      } catch {
        /* push optional until store credentials exist */
      }
    })();
  }, [authed]);

  useEffect(() => {
    if (active !== "home") setHomeSearchOpen(false);
  }, [active]);

  useEffect(() => {
    if (!authed) {
      setUnreadNotes(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      void (async () => {
        const token = await getAccessToken();
        if (!token || cancelled) return;
        try {
          const res = await unreadNotificationCount(token);
          if (!cancelled) setUnreadNotes(res.count);
        } catch {
          /* badge is optional */
        }
      })();
    };
    load();
    const id = setInterval(load, 60_000);
    let stop = () => {};
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const release = subscribeChat(token, {
        onInbox: () => load(),
        onRead: () => load(),
      });
      if (cancelled) {
        release();
        return;
      }
      stop = release;
    })();
    return () => {
      cancelled = true;
      clearInterval(id);
      stop();
    };
  }, [authed, active, profileSubtab]);

  async function saveProfile() {
    setError(null);
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required");
      return;
    }
    if (!profileStateKey) {
      setError("Select your state");
      return;
    }
    if (!community || !profileAreas.some((area) => area.value === community)) {
      setError("Select a preferred area in that state");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      await apiFetch("/me", {
        method: "PATCH",
        token,
        body: {
          displayName: name,
          preferredCommunity: community,
          bio: bio.trim() || null,
        },
      });
      await refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const refreshToken = await getRefreshToken();
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: refreshToken ? { refreshToken } : {},
      });
    } catch {
      /* clear local */
    }
    await clearTokens();
    setAuthed(false);
    setMe(null);
    setError(null);
    setGuestMode("landing");
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator
            color={colors.emerald}
            accessibilityLabel="Loading"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!authed) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}>
        <StatusBar style="dark" />
        {guestMode === "landing" ? (
          <LandingScreen
            onLogin={() => setGuestMode("login")}
            onRegister={() => setGuestMode("register")}
          />
        ) : (
          <OnboardingFlow
            intent={guestMode === "login" ? "login" : "register"}
            onBack={() => setGuestMode("landing")}
            onComplete={(profile) => {
              setMe(profile);
              if (profile.profile?.displayName) {
                setDisplayName(profile.profile.displayName);
              }
              if (profile.profile?.bio) setBio(profile.profile.bio);
              const pref = profile.profile?.preferredCommunity?.trim();
              if (pref) setCommunity(pref);
              setAuthed(true);
              setActive("home");
              setGuestMode("landing");
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.screen} accessibilityRole="summary">
        <View style={styles.topBar}>
          <Pressable
            onPress={() => setNavOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            style={styles.menuBtn}
          >
            <View style={styles.menuBar} />
            <View style={styles.menuBar} />
            <View style={styles.menuBar} />
          </Pressable>
          {active === "home" ? (
            <Pressable
              onPress={() => {
                setActive("profile");
                setProfileSubtab("updates");
              }}
              accessibilityRole="button"
              accessibilityLabel={
                unreadNotes > 0
                  ? `Notifications, ${unreadNotes} unread`
                  : "Notifications"
              }
              style={styles.bellBtn}
            >
              <Text style={styles.bellGlyph}>{"\u{1F514}"}</Text>
              {unreadNotes > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotes > 99 ? "99+" : unreadNotes}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
        {active === "profile" ? (
          <>
            {profileSubtab === "saved" ? (
              <FavouritesPanel onOpenListing={(id) => setDetailId(id)} />
            ) : profileSubtab === "orders" ? (
              <OrdersPanel
                meId={me?.id ?? null}
                onOpenOrder={(id) => setOrderId(id)}
              />
            ) : profileSubtab === "cart" ? (
              <CartPanel
                onOpenListing={(id) => setDetailId(id)}
                onCheckedOut={() => {
                  setProfileSubtab("orders");
                }}
              />
            ) : profileSubtab === "inventory" ? (
              <InventoryPanel onOpenListing={(id) => setDetailId(id)} />
            ) : profileSubtab === "updates" ? (
              <NotificationsModal
                embedded
                visible
                onClose={() => setProfileSubtab("account")}
                onOpenOrder={(id) => setOrderId(id)}
                onOpenDispute={(id) => setDisputeId(id)}
                onOpenChat={(id) => {
                  setOpenChatId(id);
                  setActive("chats");
                }}
                onOpenListing={(id) => setDetailId(id)}
                onOpenSelling={(listingId) => {
                  setActive("listings");
                  if (listingId) setFixListingId(listingId);
                }}
              />
            ) : (
              <ScrollView contentContainerStyle={styles.profilePad}>
                <Text style={styles.brand} accessibilityRole="header">
                  Profile
                </Text>
                <Text style={styles.copy}>
                  {me?.profile?.displayName ?? "Member"}
                  {me?.profile?.preferredCommunity
                    ? ` · ${me.profile.preferredCommunity}`
                    : ""}
                </Text>

                <Text style={styles.label}>Display name</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  accessibilityLabel="Display name"
                />
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[styles.input, { minHeight: 72 }]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  accessibilityLabel="Bio"
                />
                <Text style={styles.label}>State</Text>
                <View style={styles.chips}>
                  {profileRegions.map((item) => (
                    <Pressable
                      key={item.city}
                      onPress={() => {
                        setProfileStateKey(item.city);
                        setCommunity("");
                      }}
                      style={[
                        styles.chip,
                        profileStateKey === item.city && styles.chipSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: profileStateKey === item.city }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          profileStateKey === item.city && styles.chipTextSelected,
                        ]}
                      >
                        {item.displayName}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {profileStateKey ? (
                  <>
                    <Text style={styles.label}>Preferred area</Text>
                    <View style={styles.chips}>
                      {profileAreas.map((area) => (
                        <Pressable
                          key={area.value}
                          onPress={() => setCommunity(area.value)}
                          style={[
                            styles.chip,
                            community === area.value && styles.chipSelected,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: community === area.value }}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              community === area.value && styles.chipTextSelected,
                            ]}
                          >
                            {area.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.copy}>Select a state to see its areas.</Text>
                )}
                {error ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}
                <Pressable
                  style={[styles.primaryBtn, loading && styles.btnDisabled]}
                  onPress={() => void saveProfile()}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryBtnText}>
                    {loading ? "Saving…" : "Save profile"}
                  </Text>
                </Pressable>

                <Text style={styles.sectionLabel}>Verification</Text>
                <View style={styles.badges}>
                  <Badge
                    label="L1 Phone"
                    ok={Boolean(me?.verificationLevels.L1_PHONE)}
                  />
                  <Badge
                    label="L2 Email"
                    ok={Boolean(me?.verificationLevels.L2_EMAIL)}
                  />
                  <Badge
                    label={
                      me?.identityVerifiedBadge
                        ? "L3 Identity Verified ✓"
                        : "L3 Identity"
                    }
                    ok={Boolean(me?.verificationLevels.L3_IDENTITY)}
                  />
                </View>

                <PrivacySettings
                  onDeleted={() => {
                    void signOut();
                  }}
                />

                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => void signOut()}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                >
                  <Text style={styles.secondaryBtnText}>Sign out</Text>
                </Pressable>
              </ScrollView>
            )}
          </>
        ) : active === "sell" ? (
          <SellFlow
            onOpenListing={(id) => setDetailId(id)}
            onPublished={() => setActive("listings")}
          />
        ) : active === "home" ? (
          homeSearchOpen ? (
            <SearchPanel
              onOpenListing={(id) => setDetailId(id)}
              onBack={() => setHomeSearchOpen(false)}
            />
          ) : (
            <DiscoveryHome
              community={
                me?.profile?.preferredCommunity || community || undefined
              }
              cityLabel={cityLabel}
              onOpenSearch={() => setHomeSearchOpen(true)}
              onOpenListing={(id) => setDetailId(id)}
              onOpenTool={(tool) => setPlatformTool(tool)}
            />
          )
        ) : active === "discover" ? (
          <SearchPanel onOpenListing={(id) => setDetailId(id)} />
        ) : active === "chats" ? (
          <ChatsPanel
            meId={me?.id ?? ""}
            openConversationId={openChatId}
            onConversationOpened={() => setOpenChatId(null)}
            onCheckout={(params) => setCheckoutParams(params)}
          />
        ) : (
          <SellerListingsPanel onFixRejected={(id) => setFixListingId(id)} />
        )}
      </View>

      <Modal
        visible={navOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setNavOpen(false)}
      >
        <View style={styles.drawerRoot}>
          <View style={styles.drawer} accessibilityRole="menu">
            <View style={styles.drawerHead}>
              <Text style={styles.drawerBrand}>ReWorth</Text>
              <Pressable
                onPress={() => setNavOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                style={styles.drawerClose}
              >
                <View style={[styles.drawerCloseBar, styles.drawerCloseBarA]} />
                <View style={[styles.drawerCloseBar, styles.drawerCloseBarB]} />
              </Pressable>
            </View>
            {SIDE_NAV.map((item) => {
              const selected =
                item.tab === "profile"
                  ? active === "profile" && profileSubtab === item.sub
                  : active === item.tab;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setActive(item.tab);
                    if (item.sub) setProfileSubtab(item.sub);
                    setNavOpen(false);
                  }}
                  style={[styles.drawerItem, selected && styles.drawerItemOn]}
                >
                  <Text
                    style={[
                      styles.drawerItemText,
                      selected && styles.drawerItemTextOn,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                setNavOpen(false);
                void signOut();
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={styles.drawerItem}
            >
              <Text style={styles.drawerSignOut}>Sign out</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setNavOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </View>
      </Modal>

      <ListingDetailModal
        listingId={detailId}
        dismissLabel={listingReturnSellerId ? "Back" : "Close"}
        onClose={() => {
          if (listingReturnSellerId) {
            const sellerId = listingReturnSellerId;
            setListingReturnSellerId(null);
            setDetailId(sellerReturnListingId);
            setProfileUserId(sellerId);
            return;
          }
          setDetailId(null);
          setSellerReturnListingId(null);
        }}
        onOpenChat={(conversationId) => {
          setDetailId(null);
          setOpenChatId(conversationId);
          setActive("chats");
        }}
        onBuyNow={(listingId, quantity) => {
          setDetailId(null);
          setCheckoutParams({ listingId, quantity });
        }}
        onOpenSeller={(sellerId) => {
          if (detailId) setSellerReturnListingId(detailId);
          setProfileUserId(sellerId);
        }}
        onOpenCart={() => {
          setDetailId(null);
          setSellerReturnListingId(null);
          setListingReturnSellerId(null);
          setActive("profile");
          setProfileSubtab("cart");
        }}
      />

      <PlatformToolsModal
        tool={platformTool}
        city={cityLabel}
        onClose={() => setPlatformTool(null)}
        onOpenListing={(id) => {
          setPlatformTool(null);
          setDetailId(id);
        }}
      />

      <ListingFixModal
        listingId={fixListingId}
        onClose={() => setFixListingId(null)}
      />

      <UserProfileModal
        userId={profileUserId}
        meId={me?.id ?? null}
        dismissLabel={sellerReturnListingId ? "Back" : "Close"}
        onClose={() => {
          setProfileUserId(null);
          setSellerReturnListingId(null);
        }}
        onOpenListing={(listingId) => {
          setListingReturnSellerId(profileUserId);
          setProfileUserId(null);
          setDetailId(listingId);
        }}
      />

      <CheckoutModal
        params={checkoutParams}
        onClose={() => setCheckoutParams(null)}
        onPaid={(id) => {
          setCheckoutParams(null);
          setOrderId(id);
          setActive("profile");
          setProfileSubtab("orders");
        }}
      />

      <OrderDetailModal
        orderId={orderId}
        meId={me?.id ?? null}
        onClose={() => setOrderId(null)}
        onOpenDispute={(id) => {
          setOrderId(null);
          setDisputeId(id);
        }}
      />

      <DisputeModal
        disputeId={disputeId}
        meId={me?.id ?? null}
        onClose={() => setDisputeId(null)}
      />
    </SafeAreaView>
  );
}

function Badge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.badge, ok ? styles.badgeOk : styles.badgeMuted]}>
      <Text style={[styles.badgeText, ok && styles.badgeTextOk]}>
        {label}
        {ok && !label.includes("✓") ? " ✓" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FAF9F7",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  onboarding: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  menuBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    gap: 5,
  },
  bellBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bellGlyph: { fontSize: 20 },
  bellBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#0E9F6E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  menuBar: {
    height: 2,
    width: 20,
    backgroundColor: "#111315",
    borderRadius: 1,
  },
  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,19,21,0.4)",
  },
  drawer: {
    width: 280,
    maxWidth: "85%",
    backgroundColor: "#FFFFFF",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  drawerBrand: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111315",
  },
  drawerClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerCloseBar: {
    position: "absolute",
    width: 16,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "#5C636A",
  },
  drawerCloseBarA: { transform: [{ rotate: "45deg" }] },
  drawerCloseBarB: { transform: [{ rotate: "-45deg" }] },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  drawerItemOn: {
    backgroundColor: "#E7F6F0",
  },
  drawerItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#5C636A",
  },
  drawerItemTextOn: {
    color: "#0E9F6E",
  },
  drawerSignOut: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DC2626",
    marginTop: 12,
  },
  profilePad: {
    paddingBottom: 24,
  },
  brand: {
    fontSize: 40,
    fontWeight: "700",
    color: "#111315",
    letterSpacing: -0.5,
  },
  title: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: "700",
    color: "#111315",
    letterSpacing: -0.3,
  },
  copy: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 24,
    color: "#5C636A",
  },
  subtabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  subtab: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  subtabActive: {
    backgroundColor: "#0E9F6E",
    borderColor: "#0E9F6E",
  },
  subtabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111315",
  },
  subtabTextActive: {
    color: "#FFFFFF",
  },
  label: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#111315",
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: "600",
    color: "#111315",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111315",
    backgroundColor: "#FFFFFF",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: "#0E9F6E",
    borderColor: "#0E9F6E",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111315",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  primaryBtn: {
    marginTop: 28,
    backgroundColor: "#0E9F6E",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: {
    color: "#111315",
    fontSize: 15,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.55,
  },
  link: {
    marginTop: 16,
    textAlign: "center",
    color: "#0E9F6E",
    fontWeight: "600",
  },
  error: {
    marginTop: 10,
    color: "#DC2626",
    fontSize: 14,
  },
  hint: {
    marginTop: 10,
    color: "#0E9F6E",
    fontSize: 14,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeOk: {
    backgroundColor: "#D1FAE5",
  },
  badgeMuted: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2DC",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5C636A",
  },
  badgeTextOk: {
    color: "#0E9F6E",
  },
  nav: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  tabActive: {},
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5C636A",
  },
  tabLabelActive: {
    color: "#0E9F6E",
  },
  sellTab: {
    marginTop: -22,
    width: 56,
    height: 56,
    flex: 0,
    borderRadius: 28,
    backgroundColor: "#0E9F6E",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0E9F6E",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sellLabel: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "500",
    lineHeight: 30,
  },
  sellCaption: {
    position: "absolute",
    bottom: -18,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#0E9F6E",
  },
  listingRow: {
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111315",
  },
  listingMeta: {
    marginTop: 6,
    fontSize: 14,
    color: "#5C636A",
  },
});
