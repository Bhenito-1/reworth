import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "./components/AppButton";
import { EmptyState } from "./components/EmptyState";
import { ListingCard } from "./components/ListingCard";
import { ApiError } from "./lib/api";
import { ensureAccessToken } from "./lib/auth";
import { brandAssets } from "./lib/brandAssets";
import {
  browseMovingSales,
  createMovingSale,
  followMovingSale,
  getMovingSale,
  recordMovingSaleEvent,
  unfollowMovingSale,
  type MovingSaleDetail,
  type MovingSaleSummary,
} from "./lib/moving-sales";
import { myLiveListings } from "./lib/swap";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type PublicListing,
} from "./lib/types";
import {
  communityLabelsForCity,
  getPreferredCityKey,
} from "./lib/region";
import { hapticLight } from "./theme/haptics";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Mode = "browse" | "detail" | "create";

type Props = {
  visible: boolean;
  onClose: () => void;
  initialId?: string | null;
  onOpenListing?: (id: string) => void;
  onNeedAuth?: () => void;
  onSell?: () => void;
};

function deadlineIso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

function formatDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function MovingSalesModal({
  visible,
  onClose,
  initialId,
  onOpenListing,
  onNeedAuth,
  onSell,
}: Props) {
  const c = useColors();
  const [mode, setMode] = useState<Mode>("browse");
  const [items, setItems] = useState<MovingSaleSummary[]>([]);
  const [detail, setDetail] = useState<MovingSaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [community, setCommunity] = useState("");
  const [cityKey, setCityKey] = useState("lagos");
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [mine, setMine] = useState<PublicListing[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const res = await browseMovingSales(token);
      setItems(res.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load moving sales",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const d = await getMovingSale(id, token);
      setDetail(d);
      setMode("detail");
      void recordMovingSaleEvent(id, "VIEWED", undefined, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open sale");
    } finally {
      setBusy(false);
    }
  }, []);

  const startCreate = useCallback(async () => {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    setMode("create");
    setError(null);
    setTitle("");
    setBlurb("");
    setCommunity("");
    setDays(14);
    setSelected(new Set());
    setBusy(true);
    try {
      const res = await myLiveListings(token);
      setMine(res.items ?? []);
    } catch {
      setMine([]);
    } finally {
      setBusy(false);
    }
  }, [onNeedAuth]);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    void getPreferredCityKey().then((key) => {
      if (key) setCityKey(key);
    });
    if (initialId) {
      void openDetail(initialId);
      return;
    }
    setMode("browse");
    setDetail(null);
    void loadBrowse();
  }, [visible, initialId, loadBrowse, openDetail]);

  async function toggleFollow() {
    if (!detail) return;
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    setBusy(true);
    try {
      if (detail.followed) await unfollowMovingSale(token, detail.id);
      else await followMovingSale(token, detail.id);
      await openDetail(detail.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Follow failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleListing(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onCreate() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createMovingSale(token, {
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        deadline: deadlineIso(days),
        community: community || undefined,
        listingIds: [...selected],
      });
      await openDetail(created.id);
      void loadBrowse();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create sale");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          {mode !== "browse" ? (
            <Pressable
              onPress={() => {
                void hapticLight();
                setMode("browse");
                setDetail(null);
                void loadBrowse();
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.link, { color: c.orange }]}>Back</Text>
            </Pressable>
          ) : (
            <Text style={[styles.title, { color: c.ink }]}>Moving sales</Text>
          )}
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={[styles.link, { color: c.muted }]}>Close</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={[styles.error, { color: c.error }]}>{error}</Text>
        ) : null}

        {mode === "browse" ? (
          <>
            <View style={styles.browseActions}>
              <AppButton
                label="Start a Moving Sale"
                onPress={() => void startCreate()}
                style={{ flex: 1 }}
              />
            </View>
            <Image
              source={brandAssets.movingSale}
              style={styles.banner}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            {loading ? (
              <ActivityIndicator color={c.orange} style={{ marginTop: 24 }} />
            ) : items.length === 0 ? (
              <EmptyState
                title="No moving sales nearby"
                body="Clear a room this weekend — list with photos & AI draft."
                ctaLabel="Create one"
                onCta={() => void startCreate()}
                illustration="listings"
              />
            ) : (
              <ScrollView contentContainerStyle={styles.pad}>
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      void hapticLight();
                      void openDetail(item.id);
                    }}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: pressed ? c.surfaceWarm : c.surface,
                        borderColor: c.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                  >
                    <Text style={[styles.cardTitle, { color: c.ink }]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.meta, { color: c.muted }]}>
                      {item.community || "Lagos"} · {item.itemCount} items · ends{" "}
                      {formatDeadline(item.deadline)}
                    </Text>
                    <Text style={[styles.price, { color: c.orange }]}>
                      {formatNgnFromKobo(item.combinedAskingPriceKobo)} combined
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        ) : null}

        {mode === "detail" && detail ? (
          <ScrollView contentContainerStyle={styles.pad}>
            <Text style={[styles.detailTitle, { color: c.ink }]}>
              {detail.title}
            </Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {detail.community || "Lagos"} · ends {formatDeadline(detail.deadline)}
              {" · "}
              {detail.seller.displayName}
            </Text>
            {detail.blurb ? (
              <Text style={[styles.blurb, { color: c.ink }]}>{detail.blurb}</Text>
            ) : null}
            <Text style={[styles.price, { color: c.orange }]}>
              {formatNgnFromKobo(detail.combinedAskingPriceKobo)} ·{" "}
              {detail.itemCount} items
            </Text>
            <AppButton
              label={
                detail.followed
                  ? busy
                    ? "Updating…"
                    : "Following — tap to unfollow"
                  : busy
                    ? "Saving…"
                    : "Follow this sale"
              }
              onPress={() => void toggleFollow()}
              variant={detail.followed ? "soft" : "primary"}
              loading={busy}
              style={styles.action}
            />
            <Text style={[styles.section, { color: c.ink }]}>Items</Text>
            {detail.items.length === 0 ? (
              <Text style={[styles.meta, { color: c.muted }]}>
                No listings attached yet.
              </Text>
            ) : (
              detail.items.map((item) => (
                <ListingCard
                  key={item.id}
                  title={item.title || "Untitled"}
                  priceLabel={
                    item.sellingMode === "GIVE_AWAY"
                      ? "Free"
                      : formatNgnFromKobo(item.priceKobo)
                  }
                  community={item.community || undefined}
                  imageUri={listingImageUrl(item.images?.[0]) ?? undefined}
                  onPress={() => onOpenListing?.(item.id)}
                  style={styles.listingCard}
                />
              ))
            )}
          </ScrollView>
        ) : null}

        {mode === "create" ? (
          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            <Text style={[styles.section, { color: c.ink }]}>Sale details</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Lekki Phase 1 moving sale"
              placeholderTextColor={c.muted}
              style={[
                styles.input,
                { color: c.ink, borderColor: c.border, backgroundColor: c.surface },
              ]}
            />
            <TextInput
              value={blurb}
              onChangeText={setBlurb}
              placeholder="Short note for buyers (optional)"
              placeholderTextColor={c.muted}
              multiline
              style={[
                styles.input,
                styles.multiline,
                { color: c.ink, borderColor: c.border, backgroundColor: c.surface },
              ]}
            />
            <Text style={[styles.meta, { color: c.muted }]}>Deadline</Text>
            <View style={styles.chipRow}>
              {([7, 14, 30] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDays(d)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: days === d ? c.beige : c.surface,
                      borderColor: c.border,
                    },
                  ]}
                >
                  <Text style={{ color: c.ink, fontWeight: "600" }}>{d} days</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.meta, { color: c.muted }]}>Community</Text>
            <View style={styles.chipRow}>
              {communityLabelsForCity(cityKey).map((name) => (
                <Pressable
                  key={name}
                  onPress={() => setCommunity(name)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: community === name ? c.beige : c.surface,
                      borderColor: c.border,
                    },
                  ]}
                >
                  <Text style={{ color: c.ink, fontSize: type.meta }}>{name}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.section, { color: c.ink }]}>Attach live listings</Text>
            {mine.length === 0 ? (
              <View style={{ gap: space.sm }}>
                <Text style={[styles.meta, { color: c.muted }]}>
                  No live listings yet — you can create the sale empty and add later.
                </Text>
                <AppButton
                  label="List an item first"
                  variant="ghost"
                  onPress={() => {
                    onClose();
                    onSell?.();
                  }}
                />
              </View>
            ) : (
              mine.map((item) => {
                const on = selected.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleListing(item.id)}
                    style={[
                      styles.pickRow,
                      {
                        borderColor: c.border,
                        backgroundColor: on ? c.surfaceWarm : c.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: c.ink, flex: 1 }} numberOfLines={1}>
                      {on ? "✓ " : ""}
                      {item.title || "Untitled"}
                    </Text>
                    <Text style={{ color: c.muted }}>
                      {formatNgnFromKobo(item.priceKobo)}
                    </Text>
                  </Pressable>
                );
              })
            )}
            <AppButton
              label={busy ? "Creating…" : "Publish Moving Sale"}
              onPress={() => void onCreate()}
              loading={busy}
              style={styles.action}
            />
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  title: { fontSize: type.title, fontWeight: "700" },
  link: { fontSize: type.bodySm, fontWeight: "600" },
  error: { paddingHorizontal: space.lg, marginBottom: 4, fontSize: type.meta },
  browseActions: { paddingHorizontal: space.lg, marginBottom: space.sm },
  banner: {
    width: "100%",
    height: 120,
    marginBottom: space.sm,
  },
  pad: { padding: space.lg, paddingBottom: 48, gap: space.sm },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 4,
  },
  cardTitle: { fontSize: type.body, fontWeight: "700" },
  meta: { fontSize: type.meta },
  price: { fontSize: type.bodySm, fontWeight: "700", marginTop: 2 },
  detailTitle: { fontSize: type.title, fontWeight: "700" },
  blurb: { fontSize: type.bodySm, lineHeight: 22, marginVertical: space.sm },
  section: {
    fontSize: type.titleSm,
    fontWeight: "700",
    marginTop: space.md,
    marginBottom: space.xs,
  },
  action: { marginTop: space.md },
  listingCard: { marginBottom: space.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.bodySm,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
