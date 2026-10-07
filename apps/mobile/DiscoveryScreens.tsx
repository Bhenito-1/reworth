import { useCallback, useEffect, useState } from "react";
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
import {
  cacheHome,
  fetchHome,
  loadCachedHome,
  type HomeRail,
} from "./lib/discovery";
import { getAccessToken } from "./lib/auth";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type PublicListing,
} from "./lib/types";

type Props = {
  community?: string;
  cityLabel?: string;
  onOpenSearch: () => void;
  onOpenListing: (id: string) => void;
  onOpenTool?: (tool: "ask" | "worth" | "scan" | "consign" | "pickup") => void;
};

function sellerCatalogue(rails: HomeRail[]): HomeRail[] {
  return rails.filter((rail) => rail.id !== "my_listed_products");
}

export function DiscoveryHome({
  community,
  cityLabel = "Lagos",
  onOpenSearch,
  onOpenListing,
  onOpenTool,
}: Props) {
  const [rails, setRails] = useState<HomeRail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load home");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [community],
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

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load({ soft: true });
          }}
          tintColor="#0E9F6E"
        />
      }
    >
      <Text style={styles.brand} accessibilityRole="header">
        ReWorth
      </Text>
      <Text style={styles.hero}>Find something worth keeping.</Text>
      {fromCache ? (
        <Text style={styles.cacheHint}>Showing last home · refreshing…</Text>
      ) : null}

      <Pressable
        style={styles.searchBar}
        onPress={onOpenSearch}
        accessibilityRole="search"
        accessibilityLabel="Open search"
      >
        <Text style={styles.searchPlaceholder}>Search {cityLabel}…</Text>
      </Pressable>

      <View style={styles.toolsRow} accessibilityLabel="AI & platform tools">
        {(
          [
            ["ask", "Ask"],
            ["worth", "Worth"],
            ["scan", "Scan"],
            ["consign", "Consign"],
            ["pickup", "Pickup"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={styles.toolChip}
            onPress={() => onOpenTool?.(id)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={styles.toolChipText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && rails.length === 0 ? (
        <ActivityIndicator
          style={{ marginTop: 32 }}
          color="#0E9F6E"
          accessibilityLabel="Loading home"
        />
      ) : null}

      {error && rails.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {rails.map((rail) => (
        <View key={rail.id} style={styles.rail}>
          <Text style={styles.railTitle}>{rail.title}</Text>
          {rail.items.length === 0 ? (
            <Text style={styles.empty}>
              {rail.emptyMessage ?? "Nothing here yet."}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railRow}
            >
              {rail.items.map((item) => (
                <ListingTile
                  key={item.id}
                  listing={item}
                  onPress={() => onOpenListing(item.id)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function ListingTile({
  listing,
  onPress,
}: {
  listing: PublicListing;
  onPress: () => void;
}) {
  const price =
    listing.sellingMode === "GIVE_AWAY"
      ? "Free"
      : listing.sellingMode === "SWAP" || listing.sellingMode === "SWAP_CASH"
        ? "Swap"
        : formatNgnFromKobo(listing.priceKobo);

  const photo = listingCoverUrl(listing);

  return (
    <Pressable
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={listing.title || "Listing"}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={styles.tileImage}
          resizeMode="cover"
          accessibilityLabel=""
        />
      ) : (
        <View style={[styles.tileImage, styles.tileImageEmpty]} />
      )}
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {listing.title || "Untitled"}
        </Text>
        <Text style={styles.tilePrice}>{price}</Text>
        <Text style={styles.tileMeta} numberOfLines={1}>
          {listing.communityChip?.name || listing.community || "Lagos"}
          {listing.movingSale ? ` · Moving sale` : ""}
        </Text>
      </View>
    </Pressable>
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
}: {
  onOpenListing: (id: string) => void;
  onBack?: () => void;
}) {
  const [q, setQ] = useState("");
  const [community, setCommunity] = useState("");
  const [condition, setCondition] = useState("");
  const [items, setItems] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [total, setTotal] = useState(0);

  async function run(append = false) {
    setLoading(true);
    setError(null);
    try {
      const { searchListings } = await import("./lib/discovery");
      const res = await searchListings({
        q: q.trim() || undefined,
        community: community || undefined,
        condition: condition || undefined,
        cursor: append ? cursor : undefined,
        limit: 20,
        sort: "newest",
      });
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <View style={styles.searchHeader}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text style={styles.back}>← Home</Text>
          </Pressable>
        ) : null}
        <Text style={styles.brand} accessibilityRole="header">
          Search
        </Text>
      </View>

      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder="Keyword"
        placeholderTextColor="#5C636A"
        returnKeyType="search"
        onSubmitEditing={() => void run(false)}
        accessibilityLabel="Search query"
      />

      <Text style={styles.label}>Community (optional)</Text>
      <TextInput
        style={styles.input}
        value={community}
        onChangeText={setCommunity}
        placeholder="e.g. Lekki Ph1"
        placeholderTextColor="#5C636A"
      />

      <Text style={styles.label}>Condition (optional)</Text>
      <TextInput
        style={styles.input}
        value={condition}
        onChangeText={setCondition}
        placeholder="GOOD, LIKE_NEW…"
        placeholderTextColor="#5C636A"
        autoCapitalize="characters"
      />

      <Pressable
        style={styles.primaryBtn}
        onPress={() => void run(false)}
        disabled={loading}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>
          {loading ? "Searching…" : "Search"}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && items.length === 0 && !error ? (
        <Text style={styles.empty}>No results yet — try a search.</Text>
      ) : null}

      {items.length > 0 ? (
        <Text style={styles.metaCount}>{total} results</Text>
      ) : null}

      {items.map((item) => {
        const photo = listingCoverUrl(item);
        return (
          <Pressable
            key={item.id}
            style={styles.listingRow}
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
              <View style={[styles.rowThumb, styles.tileImageEmpty]} />
            )}
            <View style={styles.rowCopy}>
              <Text style={styles.tileTitle} numberOfLines={2}>
                {item.title || "Untitled"}
              </Text>
              <Text style={styles.tileMeta}>
                {item.sellingMode === "GIVE_AWAY"
                  ? "Free"
                  : formatNgnFromKobo(item.priceKobo)}
                {item.community ? ` · ${item.community}` : ""}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {cursor ? (
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => void run(true)}
          disabled={loading}
        >
          <Text style={styles.secondaryBtnText}>
            {loading ? "Loading…" : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function FavouritesPanel({
  onOpenListing,
}: {
  onOpenListing: (id: string) => void;
}) {
  const [items, setItems] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { getAccessToken } = await import("./lib/auth");
      const token = await getAccessToken();
      if (!token) {
        setError("Sign in to see saved items");
        setItems([]);
        return;
      }
      const { getMeFavourites } = await import("./lib/discovery");
      const res = await getMeFavourites(token);
      setItems(res.items.map((i) => i.listing));
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
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(id);
  }, [notice]);

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
      setNotice("Added to cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to cart");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.brand} accessibilityRole="header">
        Wishlist
      </Text>
      <Text style={styles.empty}>
        Items you want to look at later. Add one to the cart when you are ready to order.
      </Text>
      {notice ? <Text style={styles.toolsHint}>{notice}</Text> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#0E9F6E" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>
          Heart a listing to keep it here.
        </Text>
      ) : (
        items.map((item) => {
          const photo = listingCoverUrl(item);
          return (
            <View key={item.id} style={styles.wishCard}>
              <Pressable
                style={styles.listingRow}
                onPress={() => onOpenListing(item.id)}
              >
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={styles.rowThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.rowThumb, styles.tileImageEmpty]} />
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
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 32 },
  brand: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111315",
    letterSpacing: -0.5,
  },
  hero: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "600",
    color: "#111315",
  },
  cacheHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#5C636A",
  },
  searchBar: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  searchPlaceholder: { color: "#5C636A", fontSize: 16 },
  toolsRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toolChip: {
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  toolChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0E9F6E",
  },
  toolsHint: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0E9F6E",
  },
  toolsHintMuted: {
    fontSize: 12,
    color: "#5C636A",
  },
  searchHeader: { marginBottom: 8 },
  back: { color: "#0E9F6E", fontWeight: "600", marginBottom: 8 },
  rail: { marginTop: 28 },
  railTitle: { fontSize: 18, fontWeight: "700", color: "#111315" },
  railRow: { paddingTop: 12, gap: 10 },
  tile: {
    width: 168,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
    marginRight: 10,
    overflow: "hidden",
  },
  tileImage: {
    width: "100%",
    height: 112,
    backgroundColor: "#E5E2DC",
  },
  tileImageEmpty: { backgroundColor: "#E5E2DC" },
  tileBody: { padding: 12 },
  tileTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111315",
    lineHeight: 20,
    minHeight: 40,
  },
  tilePrice: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
    color: "#0E9F6E",
  },
  tileMeta: { marginTop: 4, fontSize: 13, color: "#5C636A" },
  empty: { marginTop: 10, fontSize: 14, color: "#5C636A" },
  error: { marginTop: 12, color: "#DC2626", fontSize: 14 },
  errorBox: { marginTop: 20 },
  retry: { marginTop: 8, color: "#0E9F6E", fontWeight: "700" },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111315",
    backgroundColor: "#FFFFFF",
  },
  label: {
    marginTop: 16,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#111315",
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: "#0E9F6E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: { color: "#111315", fontWeight: "600" },
  listingRow: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#E5E2DC",
  },
  rowCopy: { flex: 1 },
  wishCard: { marginTop: 4 },
  metaCount: { marginTop: 16, fontSize: 13, color: "#5C636A" },
});
