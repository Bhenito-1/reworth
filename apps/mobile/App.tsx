import { createElement, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScrollView } from "./components/BoundScroll";
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
  type HomeAreaFilter,
  FavouritesPanel,
  SearchPanel,
} from "./DiscoveryScreens";
import { CartPanel } from "./CartScreens";
import { UserProfileModal } from "./UserProfileModal";
import { PrivacySettings } from "./PrivacySettings";
import { disableNonEssentialNotifications } from "./lib/notifications";
import { NotificationsModal } from "./NotificationsScreens";
import { SellerListingsPanel, ListingFixModal } from "./SellerListings";
import {
  PlatformToolsModal,
  type PlatformTool,
} from "./PlatformTools";
import { OnboardingFlow } from "./OnboardingFlow";
import { LandingScreen } from "./LandingScreen";
import { apiFetch, ApiError } from "./lib/api";
import { clearHomeCache, type SearchFilters } from "./lib/discovery";
import { verifyNin } from "./lib/identity";
import { getPayoutSetup, payoutDisplayName, type PayoutAccountView } from "./lib/payout";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setUnauthorizedHandler,
} from "./lib/auth";
import {
  clearScreenLocation,
  readScreenLocation,
  writeScreenLocation,
  type ScreenView,
} from "./lib/screen-location";
import {
  getPushPromptChoice,
  isEssentialOnlyApplied,
  markEssentialOnlyApplied,
  registerDevicePushToken,
  setPushPromptChoice,
} from "./lib/push";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "./lib/areas";
import { getRegion, listRegions, type RegionCity } from "./lib/region";
import { type MeResponse } from "./lib/types";
import { colors } from "./theme/tokens";

if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "reworth-screen-bounds";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = `
    html, body, #root {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: hidden;
      scrollbar-width: none;
    }
    #root, #root * {
      scrollbar-width: none;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    #root::-webkit-scrollbar,
    #root *::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    #root input, #root textarea {
      min-width: 0;
      max-width: 100%;
    }
  `;
}

type Tab = "home" | "discover" | "sell" | "listings" | "chats" | "profile";
type ProfileSubtab =
  | "account"
  | "saved"
  | "orders"
  | "cart"
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
  { id: "account", label: "Account", tab: "profile", sub: "account" },
];

function viewFromNav(tab: Tab, sub: ProfileSubtab): ScreenView {
  if (tab === "profile") return sub;
  return tab;
}

function BellMark() {
  if (Platform.OS === "web") {
    return createElement(
      "svg",
      {
        width: 22,
        height: 22,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "#172A3A",
        strokeWidth: 1.75,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
      createElement("path", {
        d: "M6 9a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
      }),
      createElement("path", { d: "M10.3 21a1.7 1.7 0 0 0 3.4 0" }),
    );
  }
  return (
    <View style={styles.bellMark} accessibilityElementsHidden>
      <View style={styles.bellKnob} />
      <View style={styles.bellBody} />
      <View style={styles.bellLip} />
      <View style={styles.bellClapper} />
    </View>
  );
}

const restoredScreen = readScreenLocation();

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  /** Guest entry: landing first; onboarding only for register. */
  const [guestMode, setGuestMode] = useState<"landing" | "login" | "register">(
    "landing",
  );
  const [active, setActive] = useState<Tab>(
    restoredScreen
      ? restoredScreen.view === "saved" ||
        restoredScreen.view === "orders" ||
        restoredScreen.view === "cart" ||
        restoredScreen.view === "updates" ||
        restoredScreen.view === "account"
        ? "profile"
        : restoredScreen.view
      : "home",
  );
  const [navOpen, setNavOpen] = useState(false);
  const [discoverSeed, setDiscoverSeed] = useState<SearchFilters | null>(null);
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
  const [payout, setPayout] = useState<PayoutAccountView | null>(null);
  const [nin, setNin] = useState("");
  const [ninBusy, setNinBusy] = useState(false);
  const [ninError, setNinError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(
    restoredScreen?.listingId ?? null,
  );
  const [homeSearchOpen, setHomeSearchOpen] = useState(
    Boolean(restoredScreen?.search && restoredScreen.view === "home"),
  );
  const [cartSearch, setCartSearch] = useState(
    Boolean(restoredScreen?.search && restoredScreen.view === "cart"),
  );
  const [platformTool, setPlatformTool] = useState<PlatformTool>(null);
  const [cityLabel, setCityLabel] = useState("Lagos");
  const [homeArea, setHomeArea] = useState<HomeAreaFilter | null>(null);
  const [profileSubtab, setProfileSubtab] = useState<ProfileSubtab>(
    restoredScreen &&
      (restoredScreen.view === "saved" ||
        restoredScreen.view === "orders" ||
        restoredScreen.view === "cart" ||
        restoredScreen.view === "updates" ||
        restoredScreen.view === "account")
      ? restoredScreen.view
      : "account",
  );
  const [checkoutParams, setCheckoutParams] = useState<{
    listingId: string;
    offerId?: string;
    orderIntentId?: string;
    payOrderId?: string;
    quantity?: number;
  } | null>(
    restoredScreen?.checkoutListingId
      ? { listingId: restoredScreen.checkoutListingId }
      : null,
  );
  const [openChatId, setOpenChatId] = useState<string | null>(
    restoredScreen?.chatId ?? null,
  );
  const [screenChatId, setScreenChatId] = useState<string | null>(
    restoredScreen?.chatId ?? null,
  );
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(
    restoredScreen?.orderId ?? null,
  );
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [fixListingId, setFixListingId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [resumeListingId, setResumeListingId] = useState<string | null>(null);
  const [sellerReturnListingId, setSellerReturnListingId] = useState<
    string | null
  >(null);
  const [listingReturnSellerId, setListingReturnSellerId] = useState<
    string | null
  >(null);
  const [savedSync, setSavedSync] = useState<{
    id: string;
    saved: boolean;
    token: number;
  } | null>(null);

  useEffect(() => {
    function handleUrl(url: string | null) {
      if (!url) return;
      const parsed = parseDeepLink(url);
      if (parsed?.kind === "order" && parsed.id) setOrderId(parsed.id);
      else if (parsed?.kind === "dispute" && parsed.id) setDisputeId(parsed.id);
      else if (parsed?.kind === "chat" && parsed.id) {
        setOpenChatId(parsed.id);
        setScreenChatId(parsed.id);
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
      setHomeArea(null);
      void clearHomeCache();
      clearScreenLocation();
      return;
    }
    try {
      const profile = await apiFetch<MeResponse>("/me", { token });
      setMe(profile);
      setAuthed(true);
      setDisplayName(profile.profile?.displayName ?? "");
      setBio(profile.profile?.bio ?? "");
      setCommunity(profile.profile?.preferredCommunity?.trim() ?? "");
      const setup = await getPayoutSetup().catch(() => null);
      setPayout(setup?.account ?? null);
    } catch (err) {
      const expired =
        err instanceof ApiError && (err.status === 401 || err.status === 403);
      if (!expired) {
        setAuthed(true);
        return;
      }
      await clearTokens();
      setAuthed(false);
      setMe(null);
      setGuestMode("landing");
      setHomeArea(null);
      void clearHomeCache();
      clearScreenLocation();
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthed(false);
      setMe(null);
      setGuestMode("landing");
      setError(null);
      setHomeArea(null);
      void clearHomeCache();
      clearScreenLocation();
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

  const [pushPromptOpen, setPushPromptOpen] = useState(false);

  useEffect(() => {
    if (!authed) {
      setPushPromptOpen(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      try {
        const choice = await getPushPromptChoice();
        if (cancelled) return;
        if (choice === "allow") {
          await registerDevicePushToken(token, { requestPermission: true });
          return;
        }
        if (choice === "deny" || choice === "later") {
          if (choice === "deny" && !(await isEssentialOnlyApplied())) {
            await disableNonEssentialNotifications(token);
            await markEssentialOnlyApplied();
          }
          return;
        }
        setPushPromptOpen(true);
      } catch {
        /* push optional until store credentials exist */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  async function choosePushPrompt(choice: "allow" | "deny") {
    setPushPromptOpen(false);
    await setPushPromptChoice(choice);
    const token = await getAccessToken();
    if (!token) return;
    try {
      if (choice === "allow") {
        await registerDevicePushToken(token, { requestPermission: true });
        return;
      }
      await disableNonEssentialNotifications(token);
      await markEssentialOnlyApplied();
    } catch {
      /* the choice is saved, so the prompt stays closed */
    }
  }

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

  async function submitNin() {
    setNinError(null);
    if (me?.verificationLevels.L3_IDENTITY) return;
    const digits = nin.replace(/\D/g, "");
    if (!/^\d{11}$/.test(digits)) {
      setNinError("Enter your 11-digit NIN.");
      return;
    }
    setNinBusy(true);
    try {
      const result = await verifyNin(digits);
      setNin("");
      if (!result.identityVerifiedBadge) {
        setNinError("Identity check was not approved.");
        return;
      }
      setMe((current) =>
        current
          ? {
              ...current,
              identityVerifiedBadge: true,
              verificationLevels: {
                ...current.verificationLevels,
                L3_IDENTITY: true,
              },
            }
          : current,
      );
    } catch (err) {
      setNin("");
      setNinError(err instanceof ApiError ? err.message : "Identity check failed.");
    } finally {
      setNinBusy(false);
    }
  }

  const savedName = (me?.profile?.displayName ?? "").trim();
  const savedBio = (me?.profile?.bio ?? "").trim();
  const savedCommunity = (me?.profile?.preferredCommunity ?? "").trim();
  const areaChanged =
    community.trim().length > 0 && community.trim() !== savedCommunity;
  const profileDirty =
    displayName.trim() !== savedName ||
    bio.trim() !== savedBio ||
    areaChanged;

  async function saveProfile() {
    setError(null);
    if (!profileDirty) return;
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required");
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
          bio: bio.trim() || null,
          ...(community.trim()
            ? { preferredCommunity: community.trim() }
            : {}),
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
    setHomeArea(null);
    void clearHomeCache();
    clearScreenLocation();
  }

  const onChatActive = useCallback((id: string | null) => {
    setScreenChatId(id);
  }, []);

  useEffect(() => {
    if (!authed || booting) return;
    writeScreenLocation({
      view: viewFromNav(active, profileSubtab),
      listingId: detailId ?? undefined,
      chatId: active === "chats" ? screenChatId ?? undefined : undefined,
      orderId: orderId ?? undefined,
      search:
        active === "home" && homeSearchOpen
          ? true
          : active === "profile" && profileSubtab === "cart" && cartSearch
            ? true
            : undefined,
      checkoutListingId: checkoutParams?.listingId,
    });
  }, [
    authed,
    booting,
    active,
    profileSubtab,
    detailId,
    screenChatId,
    orderId,
    homeSearchOpen,
    cartSearch,
    checkoutParams,
  ]);

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
              <BellMark />
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
              <FavouritesPanel
                onOpenListing={(id) => setDetailId(id)}
                savedSync={savedSync}
                onBrowse={() => {
                  setDiscoverSeed(null);
                  setActive("discover");
                }}
                onOpenSearch={(filters) => {
                  setDiscoverSeed(filters ?? null);
                  setActive("discover");
                }}
              />
            ) : profileSubtab === "orders" ? (
              <OrdersPanel
                meId={me?.id ?? null}
                refreshKey={ordersRefresh}
                onOpenOrder={(id) => setOrderId(id)}
              />
            ) : profileSubtab === "cart" ? (
              cartSearch ? (
                <SearchPanel
                  onOpenListing={(id) => setDetailId(id)}
                  onBack={() => setCartSearch(false)}
                  backLabel="← Cart"
                  meId={me?.id}
                />
              ) : (
                <CartPanel
                  onOpenListing={(id) => setDetailId(id)}
                  onCheckedOut={() => {
                    setProfileSubtab("orders");
                  }}
                  onSearch={() => setCartSearch(true)}
                />
              )
            ) : profileSubtab === "updates" ? (
              <NotificationsModal
                embedded
                visible
                onClose={() => setProfileSubtab("account")}
                onOpenOrder={(id) => setOrderId(id)}
                onOpenDispute={(id) => setDisputeId(id)}
                onOpenChat={(id) => {
                  setOpenChatId(id);
                  setScreenChatId(id);
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
                  style={[
                    styles.primaryBtn,
                    (loading || !profileDirty) && styles.btnDisabled,
                  ]}
                  onPress={() => void saveProfile()}
                  disabled={loading || !profileDirty}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading || !profileDirty }}
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
                {me?.verificationLevels.L3_IDENTITY ? (
                  <Text style={styles.copy}>
                    Your NIN is verified. You are an L3 member.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.label}>National Identification Number (NIN)</Text>
                    <TextInput
                      style={styles.input}
                      value={nin}
                      onChangeText={(value) =>
                        setNin(value.replace(/\D/g, "").slice(0, 11))
                      }
                      keyboardType="number-pad"
                      maxLength={11}
                      editable={!ninBusy}
                      autoComplete="off"
                      textContentType="none"
                      secureTextEntry
                      accessibilityLabel="National Identification Number"
                    />
                    <Text style={styles.hint}>
                      11 digits. ReWorth keeps a hash of this number, not the number itself.
                    </Text>
                    {ninError ? (
                      <Text style={styles.error} accessibilityRole="alert">
                        {ninError}
                      </Text>
                    ) : null}
                    <Pressable
                      style={[
                        styles.primaryBtn,
                        (ninBusy || nin.length !== 11) && styles.btnDisabled,
                      ]}
                      onPress={() => void submitNin()}
                      disabled={ninBusy || nin.length !== 11}
                      accessibilityRole="button"
                    >
                      <Text style={styles.primaryBtnText}>
                        {ninBusy ? "Checking…" : "Verify identity"}
                      </Text>
                    </Pressable>
                  </>
                )}

                <Text style={styles.sectionLabel}>Bank details</Text>
                {payout ? (
                  <View style={styles.panel}>
                    <Text style={styles.copy}>{payoutDisplayName(payout)}</Text>
                    <Text style={styles.copy}>
                      {payout.bankName} · {payout.accountNumberMasked}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.copy}>
                    Bank details appear here after you save a payout account while selling.
                  </Text>
                )}

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
            resumeId={resumeListingId}
            onOpenListing={(id) => setDetailId(id)}
            onPublished={() => {
              setResumeListingId(null);
              setActive("listings");
            }}
          />
        ) : active === "home" ? (
          homeSearchOpen ? (
            <SearchPanel
              onOpenListing={(id) => setDetailId(id)}
              onBack={() => setHomeSearchOpen(false)}
              meId={me?.id}
            />
          ) : (
            <DiscoveryHome
              meId={me?.id}
              areaFilter={homeArea}
              onApplyAreaFilter={setHomeArea}
              onClearAreaFilter={() => setHomeArea(null)}
              cityLabel={cityLabel}
              cityKey={cityKey}
              cities={cities}
              onChangeCity={(city, opts) => {
                setCityKey(city.city);
                setCityLabel(city.displayName);
                void setPreferredCityKey(city.city);
                const label = opts?.communityLabel;
                if (
                  label &&
                  communityLabelsForCity(city.city).includes(label)
                ) {
                  setCommunity(label as Community);
                } else if (
                  community &&
                  !communityLabelsForCity(city.city).includes(community)
                ) {
                  setCommunity("");
                }
              }}
              onOpenSearch={() => setHomeSearchOpen(true)}
              onOpenListing={(id) => setDetailId(id)}
              onOpenTool={(tool) => setPlatformTool(tool)}
              onSell={() => {
                setResumeListingId(null);
                setHomeSearchOpen(false);
                setActive("sell");
              }}
            />
          )
        ) : active === "discover" ? (
          <SearchPanel
            key={discoverSeed ? JSON.stringify(discoverSeed) : "discover"}
            onOpenListing={(id) => setDetailId(id)}
            initialFilters={discoverSeed}
            meId={me?.id}
          />
        ) : active === "chats" ? (
          <ChatsPanel
            meId={me?.id ?? ""}
            openConversationId={openChatId}
            onConversationOpened={() => setOpenChatId(null)}
            onActiveChange={onChatActive}
            onCheckout={(params) => setCheckoutParams(params)}
            onOpenOrder={(id) => setOrderId(id)}
          />
        ) : (
          <SellerListingsPanel
            onFixRejected={(id) => setFixListingId(id)}
            onOpenListing={(id) => setDetailId(id)}
          />
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
            <ScrollView
              style={styles.drawerScroll}
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator
            >
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
                      if (item.tab === "sell") setResumeListingId(null);
                      if (item.tab === "discover") setDiscoverSeed(null);
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
            </ScrollView>
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
          setScreenChatId(conversationId);
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
        onContinueDraft={(id) => {
          setDetailId(null);
          setResumeListingId(id);
          setActive("sell");
        }}
        onDraftDeleted={() => setDetailId(null)}
        onSavedChange={(id, saved) =>
          setSavedSync({ id, saved, token: Date.now() })
        }
        onOpenListing={(id) => setDetailId(id)}
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
        onClose={() => {
          setOrderId(null);
          setOrdersRefresh((n) => n + 1);
        }}
        onChanged={() => setOrdersRefresh((n) => n + 1)}
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

      <Modal
        visible={pushPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => void choosePushPrompt("deny")}
      >
        <View style={styles.pushBackdrop}>
          <View style={styles.pushCard}>
            <Text style={styles.pushTitle}>Notifications</Text>
            <Text style={styles.pushBody}>
              Allow messages, offers, and price drops. Orders, payments, and
              delivery stay on either way. You can change this anytime from
              the notification bell.
            </Text>
            <Pressable
              style={styles.pushAllow}
              onPress={() => void choosePushPrompt("allow")}
              accessibilityRole="button"
            >
              <Text style={styles.pushAllowText}>Allow</Text>
            </Pressable>
            <Pressable
              style={styles.pushLater}
              onPress={() => void choosePushPrompt("deny")}
              accessibilityRole="button"
            >
              <Text style={styles.pushLaterText}>No</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
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
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
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
  bellMark: {
    width: 22,
    height: 22,
    alignItems: "center",
  },
  bellKnob: {
    width: 4,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderColor: "#172A3A",
  },
  bellBody: {
    width: 16,
    height: 12,
    marginTop: -1,
    borderWidth: 1.6,
    borderColor: "#172A3A",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: "transparent",
  },
  bellLip: {
    width: 18,
    height: 1.6,
    marginTop: -1,
    borderRadius: 1,
    backgroundColor: "#172A3A",
  },
  bellClapper: {
    width: 6,
    height: 3.5,
    marginTop: 1,
    borderWidth: 1.6,
    borderTopWidth: 0,
    borderColor: "#172A3A",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
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
    height: "100%",
    flexDirection: "row",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,19,21,0.4)",
  },
  drawer: {
    width: 280,
    maxWidth: "85%",
    height: "100%",
    backgroundColor: "#FFFFFF",
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingBottom: 32,
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
  hint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: "#5C636A",
  },
  panel: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  pushBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23, 42, 58, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pushCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
  },
  pushTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  pushBody: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  pushAllow: {
    marginTop: 20,
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  pushAllowText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  pushLater: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  pushLaterText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
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
