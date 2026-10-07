import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { EmptyState } from "./components/EmptyState";
import { ListingCard } from "./components/ListingCard";
import { HomeSkeleton } from "./components/Skeleton";
import { BottomSheet } from "./components/BottomSheet";
import { brandAssets, HOME_CATEGORIES } from "./lib/brandAssets";
import {
  cacheHome,
  fetchHome,
  loadCachedHome,
  type HomeRail,
  type SavedSearch,
  type SearchFilters,
} from "./lib/discovery";
import { fetchRecommendations } from "./lib/intelligence";
import { ensureAccessToken, getAccessToken } from "./lib/auth";
import {
  communityLabelsForCity,
  type RegionCity,
} from "./lib/region";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type PublicListing,
} from "./lib/types";
import { useColors } from "./theme/ThemeProvider";
import { hapticLight } from "./theme/haptics";
import { colors } from "./theme/tokens";
import { ApiError } from "./lib/api";

type Props = {
  community?: string;
  cityLabel?: string;
  cityKey?: string;
  cities?: RegionCity[];
  onChangeCity?: (city: RegionCity) => void;
  onOpenSearch: () => void;
  onOpenListing: (id: string) => void;
  onOpenTool?: (tool: "ask" | "worth" | "scan" | "consign" | "pickup") => void;
  onSell?: () => void;
  onOpenMovingSales?: (id?: string) => void;
  onOpenCommunities?: (slugOrId?: string) => void;
};

function sellerCatalogue(rails: HomeRail[]): HomeRail[] {
  return rails.filter((rail) => rail.id !== "my_listed_products");
}

export function DiscoveryHome({
  community,
  cityLabel = "Lagos",
  cityKey = "lagos",
  cities = [],
  onChangeCity,
  onOpenSearch,
  onOpenListing,
  onOpenTool,
  onSell,
  onOpenMovingSales,
  onOpenCommunities,
}: Props) {
  const [rails, setRails] = useState<HomeRail[]>([]);
  const [forYou, setForYou] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!opts?.soft) setLoading(true);
      setError(null);
      try {
        const data = await fetchHome(
          {
            community: community || undefined,
          },
          await getAccessToken(),
        );
        const rails = sellerCatalogue(data.rails ?? []);
        setRails(rails);
        setFromCache(false);
        await cacheHome({ ...data, rails });
        try {
          const token = await ensureAccessToken();
          const recs = await fetchRecommendations(
            {
              surface: "home",
              city: cityLabel || "Lagos",
              limit: 8,
            },
            token,
          );
          setForYou(recs.items ?? []);
        } catch {
          setForYou([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load home");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [community, cityLabel],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadCachedHome();
      if (!cancelled && cached?.rails?.length) {
        setRails(sellerCatalogue(cached.rails));
        setFromCache(true);
        setLoading(false);
      }
      if (!cancelled) await load({ soft: Boolean(cached?.rails?.length) });
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const c = useColors();

  return (
    <>
    <ScrollView
      contentContainerStyle={[styles.pad, { backgroundColor: c.canvas }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load({ soft: true });
          }}
          tintColor={c.orange}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.homeHeader}>
        <Image
          source={brandAssets.logo}
          style={styles.homeLogo}
          resizeMode="contain"
          accessibilityLabel="ReWorth"
        />
        <Pressable
          onPress={() => {
            void hapticLight();
            onSell?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sell an item"
          hitSlop={6}
          style={({ pressed }) => [
            styles.headerSell,
            {
              backgroundColor: pressed ? c.orangePressed : c.orange,
            },
          ]}
        >
          <Text style={styles.headerSellText}>Sell</Text>
        </Pressable>
      </View>

      <Text style={[styles.homeTagline, { color: c.muted }]}>
        {cityLabel}, your unused things are worth something.
      </Text>

      <View
        style={[styles.brandHero, { backgroundColor: c.navy }]}
        accessibilityRole="summary"
      >
        <Image
          source={brandAssets.landingPage}
          style={styles.brandHeroImg}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.brandHeroVeil} />
        <View style={styles.brandHeroCopy}>
          <Text style={styles.brandHeroEyebrow}>Lagos recommerce</Text>
          <Text style={styles.brandHeroTitle}>
            Good things find new homes.
          </Text>
          <Text style={styles.brandHeroBody}>
            Photograph an item and list it in about 60 seconds.
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.locationPill,
          {
            backgroundColor: pressed ? c.surfaceWarm : c.surface,
            borderColor: c.border,
          },
        ]}
        onPress={() => {
          void hapticLight();
          if (cities.length > 1 && onChangeCity) setCitySheetOpen(true);
          else onOpenSearch();
        }}
        accessibilityRole="button"
        accessibilityLabel={`City ${cityLabel}. Change pilot city or open search.`}
      >
        <Image
          source={brandAssets.actionLocation}
          style={styles.locIcon}
          resizeMode="contain"
        />
        <Text style={[styles.locationText, { color: c.ink }]} numberOfLines={1}>
          {community || cityLabel} · All {cityLabel} ▾
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.searchBar,
          {
            backgroundColor: pressed ? c.surfaceWarm : c.surface,
            borderColor: c.border,
          },
        ]}
        onPress={() => {
          void hapticLight();
          onOpenSearch();
        }}
        accessibilityRole="search"
        accessibilityLabel="Open search"
      >
        <Text style={[styles.searchPlaceholder, { color: c.muted }]}>
          Search {cityLabel}…
        </Text>
      </Pressable>
      <Text style={[styles.nlHint, { color: c.muted }]}>
        Try: sofas under ₦500k in Lekki
      </Text>

      <Pressable
        onPress={() => {
          void hapticLight();
          if (onOpenMovingSales) onOpenMovingSales();
          else onSell?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="Browse Moving Sales"
        style={({ pressed }) => [
          styles.promoCard,
          {
            opacity: pressed ? 0.92 : 1,
            borderColor: c.border,
            backgroundColor: c.surfaceWarm,
          },
        ]}
      >
        <View style={[styles.promoImageWrap, { backgroundColor: c.surfaceWarm }]}>
          <Image
            source={brandAssets.movingSale}
            style={styles.promoImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={[styles.promoCopy, { backgroundColor: c.surfaceWarm }]}>
          <Text style={[styles.promoBody, { color: c.muted }]}>
            Clear a room in one weekend — follow sales or start yours.
          </Text>
          <Text style={[styles.promoCta, { color: c.orange }]}>
            Moving sales →
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => {
          void hapticLight();
          onOpenCommunities?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="Browse communities"
        style={({ pressed }) => [
          styles.communityBanner,
          {
            opacity: pressed ? 0.92 : 1,
            borderColor: c.border,
            backgroundColor: c.surface,
          },
        ]}
      >
        <Image
          source={brandAssets.communityNeighbourhood}
          style={styles.communityBannerIcon}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.communityBannerTitle, { color: c.ink }]}>
            Estate & alumni communities
          </Text>
          <Text style={[styles.promoBody, { color: c.muted }]}>
            Join trusted groups · redeem invites
          </Text>
        </View>
        <Text style={[styles.promoCta, { color: c.orange }]}>Open</Text>
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}
        decelerationRate="fast"
      >
        {HOME_CATEGORIES.map(({ label, icon }) => (
          <Pressable
            key={label}
            style={({ pressed }) => [
              styles.catChip,
              {
                backgroundColor: pressed ? c.beige : c.surfaceWarm,
                borderColor: c.border,
              },
            ]}
            onPress={() => {
              void hapticLight();
              onOpenSearch();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Category ${label}`}
          >
            <Image
              source={brandAssets[icon]}
              style={styles.catIcon}
              resizeMode="contain"
            />
            <Text style={[styles.catChipText, { color: c.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.trustRow} accessibilityLabel="Trust signals">
        {(
          [
            ["Buyer protection", brandAssets.trustBuyerProtection],
            ["Secure payment", brandAssets.trustSecurePayment],
            ["Safe meetup", brandAssets.trustSafeMeetup],
            ["Verified sellers", brandAssets.verifiedSeller],
          ] as const
        ).map(([label, icon]) => (
          <View key={label} style={[styles.trustChip, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Image source={icon} style={styles.trustIcon} resizeMode="contain" />
            <Text style={[styles.trustLabel, { color: c.muted }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.toolsRow} accessibilityLabel="AI & platform tools">
        {(
          [
            ["ask", "Ask", brandAssets.actionChat],
            ["worth", "Worth", brandAssets.actionOffer],
            ["scan", "Scan", brandAssets.actionBuy],
            ["consign", "Consign", brandAssets.actionDelivery],
            ["pickup", "Pickup", brandAssets.actionLocation],
          ] as const
        ).map(([id, label, icon]) => (
          <Pressable
            key={id}
            style={({ pressed }) => [
              styles.toolChip,
              {
                borderColor: c.border,
                backgroundColor: pressed ? c.surfaceWarm : c.surface,
              },
            ]}
            onPress={() => {
              void hapticLight();
              onOpenTool?.(id);
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Image source={icon} style={styles.toolIcon} resizeMode="contain" />
            <Text style={[styles.toolChipText, { color: c.orange }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {fromCache ? (
        <Text style={[styles.cacheHint, { color: c.muted }]}>
          Showing last home · refreshing…
        </Text>
      ) : null}

      {loading && rails.length === 0 ? <HomeSkeleton /> : null}

      {error && rails.length === 0 ? (
        <EmptyState
          title="Couldn’t load home"
          body={error}
          ctaLabel="Retry"
          onCta={() => void load()}
          illustration="listings"
        />
      ) : null}

      {forYou.length > 0 ? (
        <View style={styles.rail}>
          <View style={styles.railHeader}>
            <Text style={[styles.railTitle, { color: c.ink }]}>For you</Text>
            <Pressable
              onPress={() => {
                void hapticLight();
                onOpenSearch();
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.seeAll, { color: c.orange }]}>See all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railRow}
          >
            {forYou.map((item) => {
              const price =
                item.sellingMode === "GIVE_AWAY"
                  ? "Free"
                  : item.sellingMode === "SWAP" ||
                      item.sellingMode === "SWAP_CASH"
                    ? "Swap"
                    : formatNgnFromKobo(item.priceKobo);
              return (
                <ListingCard
                  key={`fy-${item.id}`}
                  title={item.title || "Untitled"}
                  priceLabel={price}
                  community={
                    item.communityChip?.name || item.community || undefined
                  }
                  verified={Boolean(item.seller?.verificationBadge)}
                  onPress={() => onOpenListing(item.id)}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {rails.map((rail) => (
        <View key={rail.id} style={styles.rail}>
          <View style={styles.railHeader}>
            <Text style={[styles.railTitle, { color: c.ink }]}>{rail.title}</Text>
            <Pressable
              onPress={() => {
                void hapticLight();
                if (rail.id === "moving_sales" && onOpenMovingSales) {
                  onOpenMovingSales();
                } else {
                  onOpenSearch();
                }
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.seeAll, { color: c.orange }]}>See all</Text>
            </Pressable>
          </View>
          {rail.id === "moving_sales" ? (
            (rail.movingSales?.length ?? 0) === 0 ? (
              <Text style={[styles.empty, { color: c.muted }]}>
                {rail.emptyMessage ?? "No active moving sales nearby"}
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railRow}
              >
                {rail.movingSales!.map((sale) => (
                  <Pressable
                    key={sale.id}
                    onPress={() => {
                      void hapticLight();
                      onOpenMovingSales?.(sale.id);
                    }}
                    style={({ pressed }) => [
                      styles.movingCard,
                      {
                        backgroundColor: pressed ? c.surfaceWarm : c.surface,
                        borderColor: c.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={sale.title}
                  >
                    <Image
                      source={brandAssets.movingSale}
                      style={styles.movingCardImage}
                      resizeMode="contain"
                    />
                    <Text
                      style={[styles.movingCardTitle, { color: c.ink }]}
                      numberOfLines={2}
                    >
                      {sale.title}
                    </Text>
                    <Text style={[styles.empty, { color: c.muted }]} numberOfLines={1}>
                      {sale.community} · {sale.itemCount} items
                    </Text>
                    <Text style={[styles.seeAll, { color: c.orange }]}>
                      {formatNgnFromKobo(sale.combinedPriceKobo)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )
          ) : rail.items.length === 0 ? (
            <Text style={[styles.empty, { color: c.muted }]}>
              {rail.emptyMessage ?? "Nothing here yet."}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railRow}
            >
              {rail.items.map((item, index) => {
                const price =
                  item.sellingMode === "GIVE_AWAY"
                    ? "Free"
                    : item.sellingMode === "SWAP" ||
                        item.sellingMode === "SWAP_CASH"
                      ? "Swap"
                      : formatNgnFromKobo(item.priceKobo);
                return (
                  <ListingCard
                    key={item.id}
                    title={item.title || "Untitled"}
                    priceLabel={price}
                    community={
                      item.communityChip?.name || item.community || undefined
                    }
                    verified={Boolean(item.seller?.verificationBadge)}
                    onPress={() => onOpenListing(item.id)}
                    testID={
                      rail === rails[0] && index === 0
                        ? "listing-card-0"
                        : undefined
                    }
                  />
                );
              })}
            </ScrollView>
          )}
        </View>
      ))}
    </ScrollView>

    <BottomSheet
      visible={citySheetOpen}
      title="Choose your city"
      onClose={() => setCitySheetOpen(false)}
    >
      <Text style={[styles.nlHint, { color: c.muted, marginBottom: 8 }]}>
        ReWorth pilot · Lagos and Abuja. Switch city to see local communities
        and radius.
      </Text>
      {(cities.length
        ? cities
        : [
            { city: "lagos", key: "lagos", displayName: "Lagos" },
            { city: "abuja", key: "abuja", displayName: "Abuja" },
          ]
      ).map((city) => {
        const selected =
          city.city === cityKey || city.displayName === cityLabel;
        const areas = communityLabelsForCity(city.city)
          .filter((a) => !a.startsWith("Other"))
          .slice(0, 5);
        return (
          <Pressable
            key={city.city}
            onPress={() => {
              void hapticLight();
              onChangeCity?.(city);
              setCitySheetOpen(false);
            }}
            style={({ pressed }) => [
              styles.cityCard,
              {
                backgroundColor: pressed
                  ? c.surfaceWarm
                  : selected
                    ? c.surfaceWarm
                    : c.surface,
                borderColor: selected ? c.orange : c.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${city.displayName}. ${areas.join(", ")}`}
          >
            <View style={styles.cityCardHeader}>
              <Text style={[styles.railTitle, { color: c.ink }]}>
                {city.displayName}
              </Text>
              <Text
                style={{
                  color: selected ? c.orange : c.muted,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {selected ? "Current" : "Select"}
              </Text>
            </View>
            <Text style={[styles.cityAreas, { color: c.muted }]}>
              {areas.join(" · ")}
            </Text>
            <Text style={[styles.cityMeta, { color: c.muted }]}>
              City-wide browse · community chips on Profile
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => {
          setCitySheetOpen(false);
          onOpenSearch();
        }}
        style={{ marginTop: 8, paddingVertical: 10 }}
        accessibilityRole="button"
      >
        <Text style={{ color: c.orange, fontWeight: "600" }}>
          Open search & radius →
        </Text>
      </Pressable>
    </BottomSheet>
    </>
  );
}

function listingCoverUrl(listing: PublicListing): string | null {
  const images = [...(listing.images ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  return listingImageUrl(images[0]);
}

/** Lightweight search panel used from Discover tab */
export function SearchPanel({
  onOpenListing,
  onBack,
  initialFilters,
  onNeedAuth,
}: {
  onOpenListing: (id: string) => void;
  onBack?: () => void;
  initialFilters?: SearchFilters | null;
  onNeedAuth?: () => void;
}) {
  const c = useColors();
  const [q, setQ] = useState("");
  const [community, setCommunity] = useState("");
  const [condition, setCondition] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">(
    "newest",
  );
  const [items, setItems] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [total, setTotal] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const seededRef = useRef<string | null>(null);

  function applySeed(seed: SearchFilters) {
    setQ(seed.q ?? "");
    setCommunity(seed.community ?? "");
    setCondition(seed.condition ?? "");
    setVerifiedOnly(Boolean(seed.verifiedOnly));
    setPriceMin(
      seed.priceMinKobo != null
        ? String(Math.round(seed.priceMinKobo / 100))
        : "",
    );
    setPriceMax(
      seed.priceMaxKobo != null
        ? String(Math.round(seed.priceMaxKobo / 100))
        : "",
    );
    if (
      seed.sort === "newest" ||
      seed.sort === "price_asc" ||
      seed.sort === "price_desc"
    ) {
      setSort(seed.sort);
    }
  }

  function currentFilters(): SearchFilters {
    const minKobo = priceMin
      ? Math.round(Number(priceMin.replace(/,/g, "")) * 100)
      : undefined;
    const maxKobo = priceMax
      ? Math.round(Number(priceMax.replace(/,/g, "")) * 100)
      : undefined;
    return {
      q: q.trim() || undefined,
      community: community || undefined,
      condition: condition || undefined,
      priceMinKobo: Number.isFinite(minKobo) ? minKobo : undefined,
      priceMaxKobo: Number.isFinite(maxKobo) ? maxKobo : undefined,
      verifiedOnly: verifiedOnly || undefined,
      sort,
    };
  }

  async function run(append = false, override?: SearchFilters) {
    setLoading(true);
    setError(null);
    try {
      const { searchListings } = await import("./lib/discovery");
      const base = override ?? currentFilters();
      const res = await searchListings({
        ...base,
        cursor: append ? cursor : undefined,
        limit: 20,
      });
      let next = res.items;
      if (base.verifiedOnly) {
        next = next.filter((i) => i.seller?.verificationBadge);
      }
      setItems((prev) => (append ? [...prev, ...next] : next));
      setCursor(res.nextCursor);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialFilters) return;
    const key = JSON.stringify(initialFilters);
    if (seededRef.current === key) return;
    seededRef.current = key;
    applySeed(initialFilters);
    void run(false, initialFilters);
    // intentionally seed once per payload
  }, [initialFilters]);

  async function saveAlert() {
    setError(null);
    setToast(null);
    setSaving(true);
    void hapticLight();
    try {
      const { ensureAccessToken } = await import("./lib/auth");
      const token = await ensureAccessToken();
      if (!token) {
        onNeedAuth?.();
        return;
      }
      const { compactSearchFilters, createSavedSearch } = await import(
        "./lib/discovery",
      );
      const filters = compactSearchFilters(currentFilters());
      const name =
        filters.q?.slice(0, 40) ||
        filters.community ||
        filters.condition ||
        "Saved search";
      await createSavedSearch(token, name, filters as Record<string, unknown>);
      setToast("Alert saved — we'll notify you of new matches");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save search alert",
      );
    } finally {
      setSaving(false);
    }
  }

  const conditions = ["", "LIKE_NEW", "GOOD", "FAIR"];

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.pad, { backgroundColor: c.canvas }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchHeader}>
          {onBack ? (
            <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.back, { color: c.orange }]}>← Home</Text>
            </Pressable>
          ) : null}
          <Text
            style={[styles.brand, { color: c.ink }]}
            accessibilityRole="header"
          >
            Search
          </Text>
        </View>

        <TextInput
          style={[
            styles.input,
            { borderColor: c.border, color: c.ink, backgroundColor: c.surface },
          ]}
          value={q}
          onChangeText={setQ}
          placeholder="Try: sofas under ₦500k in Lekki"
          placeholderTextColor={c.muted}
          returnKeyType="search"
          onSubmitEditing={() => void run(false)}
          accessibilityLabel="Search query"
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable
            style={[
              styles.secondaryBtn,
              { flex: 1, marginTop: 0, borderColor: c.border },
            ]}
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
          >
            <Text style={[styles.secondaryBtnText, { color: c.ink }]}>
              Filters
              {condition || community || verifiedOnly || priceMin || priceMax
                ? " · on"
                : ""}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryBtn,
              { flex: 1, marginTop: 0, backgroundColor: c.orange },
            ]}
            onPress={() => void run(false)}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>
              {loading ? "…" : "Search"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.secondaryBtn,
            { borderColor: c.border, opacity: saving ? 0.5 : 1 },
          ]}
          onPress={() => void saveAlert()}
          disabled={saving || loading}
          accessibilityRole="button"
          accessibilityLabel="Save search alert"
        >
          <Text style={[styles.secondaryBtnText, { color: c.ink }]}>
            {saving ? "Saving…" : "Save alert"}
          </Text>
        </Pressable>

        {toast ? (
          <Text style={[styles.metaCount, { color: c.orange }]}>{toast}</Text>
        ) : null}

        {error ? (
          <Text style={[styles.error, { color: c.error }]}>{error}</Text>
        ) : null}

        {!loading && items.length === 0 && !error ? (
          <EmptyState
            title="No search results"
            body="Try a keyword or open Filters."
            ctaLabel="Search Lagos"
            onCta={() => void run(false)}
            illustration="search"
          />
        ) : null}

        {items.length > 0 ? (
          <Text style={[styles.metaCount, { color: c.muted }]}>
            {total} results
          </Text>
        ) : null}

        <View style={styles.masonry}>
          {items.map((item) => {
            const price =
              item.sellingMode === "GIVE_AWAY"
                ? "Free"
                : formatNgnFromKobo(item.priceKobo);
            return (
              <ListingCard
                key={item.id}
                title={item.title || "Untitled"}
                priceLabel={price}
                community={item.community || undefined}
                verified={Boolean(item.seller?.verificationBadge)}
                onPress={() => onOpenListing(item.id)}
                style={{ width: "48%", marginBottom: 12 }}
              />
            );
          })}
        </View>

        {cursor ? (
          <Pressable
            style={[styles.secondaryBtn, { borderColor: c.border }]}
            onPress={() => void run(true)}
            disabled={loading}
          >
            <Text style={[styles.secondaryBtnText, { color: c.ink }]}>
              {loading ? "Loading…" : "Load more"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
      >
        <Text style={[styles.label, { color: c.muted }]}>Community</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: c.border, color: c.ink, backgroundColor: c.surface },
          ]}
          value={community}
          onChangeText={setCommunity}
          placeholder="e.g. Lekki Ph1"
          placeholderTextColor={c.muted}
        />
        <Text style={[styles.label, { color: c.muted }]}>Condition</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {conditions.map((cond) => {
            const selected = condition === cond;
            const label = cond || "Any";
            return (
              <Pressable
                key={label}
                onPress={() => setCondition(cond)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: selected ? c.orange : c.border,
                  backgroundColor: selected ? c.surfaceWarm : c.surface,
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={{
                    color: c.ink,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setVerifiedOnly((v) => !v)}
          style={{
            marginTop: 16,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: verifiedOnly }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.border,
              backgroundColor: verifiedOnly ? c.orange : c.surface,
            }}
          />
          <Text style={{ color: c.ink, fontSize: 15 }}>Verified sellers</Text>
        </Pressable>
        <Text style={[styles.label, { color: c.muted }]}>Price (₦)</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                borderColor: c.border,
                color: c.ink,
                backgroundColor: c.surface,
              },
            ]}
            value={priceMin}
            onChangeText={setPriceMin}
            placeholder="Min"
            placeholderTextColor={c.muted}
            keyboardType="numeric"
          />
          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                borderColor: c.border,
                color: c.ink,
                backgroundColor: c.surface,
              },
            ]}
            value={priceMax}
            onChangeText={setPriceMax}
            placeholder="Max"
            placeholderTextColor={c.muted}
            keyboardType="numeric"
          />
        </View>
        <Text style={[styles.label, { color: c.muted }]}>Sort</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              ["newest", "Newest"],
              ["price_asc", "Price ↑"],
              ["price_desc", "Price ↓"],
            ] as const
          ).map(([id, label]) => {
            const selected = sort === id;
            return (
              <Pressable
                key={id}
                onPress={() => setSort(id)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: selected ? c.orange : c.border,
                  backgroundColor: selected ? c.surfaceWarm : c.surface,
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={{ color: c.ink, fontWeight: "600", fontSize: 13 }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={[styles.secondaryBtn, { borderColor: c.border }]}
          onPress={() => {
            setCommunity("");
            setCondition("");
            setVerifiedOnly(false);
            setPriceMin("");
            setPriceMax("");
            setSort("newest");
          }}
        >
          <Text style={[styles.secondaryBtnText, { color: c.ink }]}>
            Clear all
          </Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: c.orange }]}
          onPress={() => {
            setFiltersOpen(false);
            void run(false);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Apply</Text>
        </Pressable>
      </BottomSheet>
    </>
  );
}

export function FavouritesPanel({
  onOpenListing,
  onBrowse,
  onOpenSearch,
}: {
  onOpenListing: (id: string) => void;
  onBrowse?: () => void;
  onOpenSearch?: (filters?: SearchFilters) => void;
}) {
  const c = useColors();
  const [tab, setTab] = useState<"items" | "searches">("items");
  const [items, setItems] = useState<PublicListing[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ensureAccessToken } = await import("./lib/auth");
      const token = await ensureAccessToken();
      if (!token) {
        setError("Sign in to see saved items and alerts");
        setItems([]);
        setSearches([]);
        return;
      }
      const { getMeFavourites } = await import("./lib/discovery");
      const res = await getMeFavourites(token);
      setItems(res.items.map((i) => i.listing));
      setSearches(res.searches ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  async function addListingToCart(listingId: string) {
    setBusyId(listingId);
    setError(null);
    try {
      const { getAccessToken } = await import("./lib/auth");
      const token = await getAccessToken();
      if (!token) {
        setError("Sign in to use the cart");
        return;
      }
      const { addToCart } = await import("./lib/cart");
      await addToCart(token, listingId);
      setToast("Added to cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to cart");
    } finally {
      setBusyId(null);
    }
  }

  async function patchSearch(
    search: SavedSearch,
    patch: { paused?: boolean; digestEnabled?: boolean },
  ) {
    try {
      const { ensureAccessToken } = await import("./lib/auth");
      const token = await ensureAccessToken();
      if (!token) return;
      const { updateSavedSearch } = await import("./lib/discovery");
      const updated = await updateSavedSearch(token, search.id, patch);
      setSearches((prev) =>
        prev.map((s) => (s.id === search.id ? { ...s, ...updated } : s)),
      );
      setToast(
        patch.paused != null
          ? patch.paused
            ? "Alerts paused"
            : "Alerts resumed"
          : patch.digestEnabled
            ? "Daily digest on"
            : "Daily digest off",
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update alert",
      );
    }
  }

  async function removeSearch(search: SavedSearch) {
    try {
      const { ensureAccessToken } = await import("./lib/auth");
      const token = await ensureAccessToken();
      if (!token) return;
      const { deleteSavedSearch } = await import("./lib/discovery");
      await deleteSavedSearch(token, search.id);
      setSearches((prev) => prev.filter((s) => s.id !== search.id));
      setToast("Alert deleted");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete alert",
      );
    }
  }

  async function openSearch(search: SavedSearch) {
    const { filtersFromSaved } = await import("./lib/discovery");
    const filters = filtersFromSaved(search.filters);
    try {
      const { ensureAccessToken } = await import("./lib/auth");
      const token = await ensureAccessToken();
      if (token && search.newMatchesCount > 0) {
        const { updateSavedSearch } = await import("./lib/discovery");
        const updated = await updateSavedSearch(token, search.id, {
          newMatchesCount: 0,
        });
        setSearches((prev) =>
          prev.map((s) => (s.id === search.id ? { ...s, ...updated } : s)),
        );
      }
    } catch {
      /* non-blocking */
    }
    onOpenSearch?.(filters);
  }

  const matchBadge = searches.reduce(
    (n, s) => n + (s.paused ? 0 : s.newMatchesCount || 0),
    0,
  );

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.brand} accessibilityRole="header">
        Saved
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(
          [
            ["items", "Items"],
            ["searches", "Alerts"],
          ] as const
        ).map(([id, label]) => {
          const selected = tab === id;
          return (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              style={{
                minHeight: 40,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: selected ? c.orange : c.border,
                backgroundColor: selected ? c.surfaceWarm : c.surface,
                justifyContent: "center",
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={{ color: c.ink, fontWeight: "600", fontSize: 13 }}>
                {label}
                {id === "searches" && matchBadge > 0 ? ` · ${matchBadge}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {toast ? (
        <Text style={[styles.metaCount, { color: c.orange }]}>{toast}</Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.orange} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : tab === "items" ? (
        items.length === 0 ? (
          <EmptyState
            title="No saved items"
            body="Heart a listing to keep it here."
            ctaLabel="Browse Lagos"
            onCta={() => onBrowse?.()}
            illustration="saved"
          />
        ) : (
          items.map((item) => {
            const photo = listingCoverUrl(item);
            return (
              <View key={item.id}>
                <Pressable
                  style={[
                    styles.listingRow,
                    { flexDirection: "row", alignItems: "center", gap: 12 },
                  ]}
                  onPress={() => onOpenListing(item.id)}
                  accessibilityRole="button"
                >
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={styles.rowThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.rowThumb} />
                  )}
                  <View style={styles.rowCopy}>
                    <Text style={styles.tileTitle}>{item.title || "Untitled"}</Text>
                    <Text style={styles.tileMeta}>
                      {formatNgnFromKobo(item.priceKobo)}
                      {item.community ? ` · ${item.community}` : ""}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  disabled={busyId === item.id}
                  onPress={() => void addListingToCart(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.title || "listing"} to cart`}
                >
                  <Text style={styles.secondaryBtnText}>
                    {busyId === item.id ? "Adding…" : "Add to cart"}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )
      ) : searches.length === 0 ? (
        <EmptyState
          title="No saved alerts"
          body="Save filters from Search to get notified when new Lagos matches go live."
          ctaLabel="Open search"
          onCta={() => onOpenSearch?.()}
          illustration="search"
        />
      ) : (
        searches.map((s) => {
          const paused = Boolean(s.paused);
          const digest = Boolean(s.digestEnabled);
          return (
            <View
              key={s.id}
              style={[
                styles.listingRow,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                  gap: 8,
                },
              ]}
            >
              <Pressable onPress={() => void openSearch(s)}>
                <Text style={styles.tileTitle}>
                  {s.name}
                  {paused ? " · Paused" : ""}
                  {!paused && s.newMatchesCount > 0
                    ? ` · ${s.newMatchesCount} new`
                    : ""}
                </Text>
                <Text style={styles.tileMeta}>
                  {summarizeSavedFiltersInline(s.filters)}
                  {digest ? " · Daily digest" : ""}
                </Text>
              </Pressable>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Pressable
                  style={[styles.chipBtn, { borderColor: c.border }]}
                  onPress={() => void patchSearch(s, { paused: !paused })}
                >
                  <Text style={{ color: c.ink, fontWeight: "600", fontSize: 12 }}>
                    {paused ? "Resume" : "Pause"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chipBtn, { borderColor: c.border }]}
                  onPress={() =>
                    void patchSearch(s, { digestEnabled: !digest })
                  }
                >
                  <Text style={{ color: c.ink, fontWeight: "600", fontSize: 12 }}>
                    {digest ? "Digest on" : "Digest"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chipBtn, { borderColor: c.border }]}
                  onPress={() => void removeSearch(s)}
                >
                  <Text style={{ color: c.error, fontWeight: "600", fontSize: 12 }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function summarizeSavedFiltersInline(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof filters.q === "string" && filters.q) parts.push(`"${filters.q}"`);
  if (typeof filters.community === "string" && filters.community)
    parts.push(filters.community);
  if (filters.radiusKm != null) parts.push(`${filters.radiusKm} km`);
  if (typeof filters.condition === "string" && filters.condition)
    parts.push(String(filters.condition).replace(/_/g, " "));
  if (filters.verifiedOnly) parts.push("Verified");
  return parts.join(" · ") || "Custom filters";
}

const styles = StyleSheet.create({
  chipBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  pad: { paddingBottom: 32, paddingHorizontal: 16, paddingTop: 8 },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  homeLogo: { width: 132, height: 36 },
  homeTagline: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  brandHero: {
    borderRadius: 18,
    overflow: "hidden",
    minHeight: 148,
    marginBottom: 14,
    justifyContent: "flex-end",
  },
  brandHeroImg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  brandHeroVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(23,42,58,0.55)",
  },
  brandHeroCopy: {
    position: "relative",
    zIndex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 4,
  },
  brandHeroEyebrow: {
    color: "#D96A32",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  brandHeroTitle: {
    color: "#FCFAF6",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  brandHeroBody: {
    color: "rgba(252,250,246,0.78)",
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 280,
  },
  headerSell: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSellText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: "700",
  },
  locationPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  cityCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cityAreas: { fontSize: 13, lineHeight: 18 },
  cityMeta: { fontSize: 12, marginTop: 2 },
  locIcon: { width: 18, height: 18 },
  locationText: { fontSize: 15, fontWeight: "600", maxWidth: 240 },
  searchBar: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
  },
  searchPlaceholder: { fontSize: 17 },
  nlHint: { marginTop: 8, fontSize: 13 },
  promoCard: {
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  promoImageWrap: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
  },
  promoImage: {
    width: "100%",
    height: "100%",
  },
  promoCopy: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 4,
  },
  promoTitle: { fontSize: 18, fontWeight: "700" },
  promoBody: { fontSize: 14, lineHeight: 20 },
  promoCta: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  communityBanner: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  communityBannerIcon: { width: 44, height: 44 },
  communityBannerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  catRow: { gap: 8, paddingVertical: 16 },
  movingCard: {
    width: 168,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 4,
  },
  movingCardImage: { width: "100%", height: 72, marginBottom: 4 },
  movingCardTitle: { fontSize: 14, fontWeight: "700", minHeight: 36 },
  catChip: {
    width: 88,
    height: 96,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 6,
    overflow: "hidden",
  },
  catIcon: { width: 40, height: 40 },
  catChipText: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  trustRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  trustChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
  },
  trustIcon: { width: 18, height: 18 },
  trustLabel: { fontSize: 11, fontWeight: "600", maxWidth: 110 },
  brand: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  hero: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "600",
    color: colors.ink,
  },
  cacheHint: {
    marginTop: 6,
    fontSize: 13,
  },
  toolsRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toolChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolIcon: { width: 18, height: 18 },
  toolChipText: { fontSize: 13, fontWeight: "600" },
  rail: { marginTop: 28 },
  railHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  railTitle: { fontSize: 20, fontWeight: "600" },
  seeAll: { fontSize: 13, fontWeight: "600" },
  railRow: { gap: 12, paddingRight: 8 },
  empty: { fontSize: 15, lineHeight: 22 },
  errorBox: { marginTop: 24, gap: 8 },
  error: { color: colors.error, fontSize: 15 },
  retry: { color: colors.orange, fontWeight: "600", fontSize: 15 },
  searchHeader: { gap: 8, marginBottom: 8 },
  back: { color: colors.orange, fontWeight: "600", fontSize: 15 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    backgroundColor: colors.surface,
    color: colors.ink,
    marginTop: 8,
  },
  label: { marginTop: 16, fontSize: 13, color: colors.muted, fontWeight: "500" },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 52,
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 17, fontWeight: "600" },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  metaCount: { marginTop: 16, fontSize: 13, color: colors.muted },
  listingRow: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  rowCopy: { flex: 1 },
  tileTitle: { fontSize: 15, fontWeight: "500", color: colors.ink },
  tileMeta: { marginTop: 4, fontSize: 13, color: colors.muted },
  tile: {},
  tilePrice: {},
  masonry: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
});
