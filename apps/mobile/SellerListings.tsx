import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { screenBounds, ScrollView } from "./components/BoundScroll";
import { ApiError } from "./lib/api";
import { ensureAccessToken, getAccessToken } from "./lib/auth";
import { nairaToKobo } from "./lib/chat";
import { sentenceCaseLabel } from "./lib/discovery";
import {
  getListing,
  listMine,
  patchListing,
  publishListing,
  removeListing,
  type MineListing,
} from "./lib/listings";

type ListingFilter =
  | "all"
  | "live"
  | "review"
  | "rejected"
  | "sold"
  | "closed"
  | "removed";

const STATUS_BADGE: Record<string, { color: string; backgroundColor: string }> = {
  LIVE: { color: "#065F46", backgroundColor: "#D1FAE5" },
  RESERVED: { color: "#1E3A8A", backgroundColor: "#DBEAFE" },
  SOLD: { color: "#172A3A", backgroundColor: "#E7EEF4" },
  UNDER_REVIEW: { color: "#92400E", backgroundColor: "#FEF3C7" },
  REJECTED: { color: "#991B1B", backgroundColor: "#FEE2E2" },
  DRAFT: { color: "#3F3F46", backgroundColor: "#F4F4F5" },
  EXPIRED: { color: "#7C4A1E", backgroundColor: "#F8E6DC" },
  REMOVED: { color: "#9F1239", backgroundColor: "#FFE4E6" },
};

function badgeColors(status: string) {
  return (
    STATUS_BADGE[status] ?? { color: "#59636D", backgroundColor: "#F4F4F5" }
  );
}

function removalMessage(item: MineListing): string {
  const title = item.title || "this listing";
  if (item.status === "DRAFT") {
    return `Delete the draft “${title}”? This cannot be undone.`;
  }
  if (item.hasAcceptedOrder) {
    return `Remove “${title}” from the marketplace? An order for this listing is already accepted. You still have to fulfil that order. If you do not, your account can be sanctioned. The remaining units will leave the marketplace and this listing will be marked Removed.`;
  }
  return `Remove “${title}” from the marketplace? The remaining units will leave the marketplace and this listing will be marked Removed.`;
}

export function SellerListingsPanel({
  onFixRejected,
  onOpenListing,
}: {
  onFixRejected?: (listingId: string) => void;
  onOpenListing?: (listingId: string) => void;
}) {
  const [items, setItems] = useState<MineListing[]>([]);
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<MineListing | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        setError("Sign in to see your listings");
        return;
      }
      const res = await listMine(token);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load listings");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = items.filter((item) => {
    if (filter === "all") return true;
    return listingGroup(item) === filter;
  });
  const shown = expanded ? visible : visible.slice(0, 10);

  async function confirmRemove(item: MineListing) {
    const token = await getAccessToken();
    if (!token) return;
    setRemovingId(item.id);
    setError(null);
    try {
      await removeListing(token, item.id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : item.status === "DRAFT"
            ? "Could not delete this draft"
            : "Could not remove this listing",
      );
    } finally {
      setRemovingId(null);
    }
  }

  function askRemove(item: MineListing) {
    setPendingRemove(item);
  }

  return (
    <>
    <FlatList
      data={loading ? [] : shown}
      keyExtractor={(item) => item.id}
      style={screenBounds}
      contentContainerStyle={styles.pad}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Your listings</Text>
          <Text style={styles.copy}>
            Every listing you have made, including live, in review, rejected, sold, closed, and removed.
          </Text>
          <View style={styles.filters}>
            {(
              [
                ["all", "All"],
                ["live", "Live"],
                ["review", "In review"],
                ["rejected", "Rejected"],
                ["sold", "Sold"],
                ["closed", "Closed"],
                ["removed", "Removed"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => {
                  setFilter(id);
                  setExpanded(false);
                }}
                style={[styles.filter, filter === id && styles.filterOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === id }}
              >
                <Text style={[styles.filterText, filter === id && styles.filterTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#0E9F6E" />
        ) : error ? null : (
          <Text style={styles.copy}>
            {items.length === 0
              ? "Nothing here yet. Publish a listing and its review status shows up on this page."
              : "Nothing in this status."}
          </Text>
        )
      }
      renderItem={({ item }) => {
        return (
        <View style={styles.card}>
          <Pressable
            onPress={() => onOpenListing?.(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title || "listing"}`}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={[styles.badge, badgeColors(item.status)]}>
                {item.reviewLabel}
              </Text>
            </View>
            {item.reviewNote ? (
              <Text style={styles.note}>{item.reviewNote}</Text>
            ) : null}
          </Pressable>
          {item.reviewState === "rejected" && onFixRejected ? (
            <Pressable
              onPress={() => onFixRejected(item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.refresh}>See why and fix it</Text>
            </Pressable>
          ) : null}
          {item.status === "DRAFT" || item.canRemove ? (
            <Pressable
              onPress={() => askRemove(item)}
              disabled={removingId === item.id}
              accessibilityRole="button"
            >
              <Text style={styles.remove}>
                {removingId === item.id
                  ? item.status === "DRAFT"
                    ? "Deleting…"
                    : "Removing…"
                  : item.status === "DRAFT"
                    ? "Delete draft"
                    : "Remove from marketplace"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        );
      }}
      refreshing={refreshing}
      onRefresh={() => void load()}
      ListFooterComponent={
        <View>
          {visible.length > 10 && !expanded ? (
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
            >
              <Text style={styles.refresh}>See more</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void load()}
            disabled={refreshing}
            accessibilityRole="button"
          >
            <Text style={styles.refresh}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Text>
          </Pressable>
        </View>
      }
    />
    <Modal
      visible={pendingRemove != null}
      transparent
      animationType="fade"
      onRequestClose={() => setPendingRemove(null)}
    >
      <View style={styles.confirmBackdrop}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>
            {pendingRemove?.status === "DRAFT"
              ? "Delete draft"
              : "Remove from marketplace"}
          </Text>
          <Text style={styles.confirmCopy}>
            {pendingRemove ? removalMessage(pendingRemove) : ""}
          </Text>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => setPendingRemove(null)}
              accessibilityRole="button"
              style={styles.confirmCancel}
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const item = pendingRemove;
                setPendingRemove(null);
                if (item) void confirmRemove(item);
              }}
              accessibilityRole="button"
              style={styles.confirmRemove}
            >
              <Text style={styles.confirmRemoveText}>
                {pendingRemove?.status === "DRAFT" ? "Delete" : "Remove"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

function listingGroup(
  item: MineListing,
): Exclude<ListingFilter, "all"> | "draft" {
  if (item.reviewState === "rejected" || item.status === "REJECTED") {
    return "rejected";
  }
  if (item.status === "SOLD") return "sold";
  if (item.status === "REMOVED" || item.reviewState === "removed") return "removed";
  if (item.status === "EXPIRED" || item.reviewState === "closed") return "closed";
  if (item.status === "LIVE" || item.status === "RESERVED") return "live";
  if (item.status === "UNDER_REVIEW" || item.reviewState === "waiting") return "review";
  if (item.status === "DRAFT") return "draft";
  return "closed";
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  filterOn: { backgroundColor: "#0E9F6E", borderColor: "#0E9F6E" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#111315" },
  filterTextOn: { color: "#FFFFFF" },
  title: { fontSize: 22, fontWeight: "700", color: "#111315" },
  copy: { marginTop: 8, marginBottom: 12, fontSize: 15, color: "#5C636A" },
  error: { color: "#B42318", marginBottom: 8 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E4E7E2",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#1A1D21" },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  note: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#5C636A" },
  refresh: { color: "#0E9F6E", fontWeight: "600", marginTop: 8 },
  remove: { color: "#B42318", fontWeight: "600", marginTop: 8 },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,19,21,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },
  confirmTitle: { fontSize: 18, fontWeight: "700", color: "#111315" },
  confirmCopy: { marginTop: 10, fontSize: 15, lineHeight: 22, color: "#5C636A" },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  confirmCancel: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmCancelText: { fontWeight: "600", color: "#111315" },
  confirmRemove: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#B42318",
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmRemoveText: { fontWeight: "700", color: "#FFFFFF" },
});

export function ListingFixModal({
  listingId,
  onClose,
}: {
  listingId: string | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const row = await getListing(listingId, token);
        if (cancelled) return;
        setTitle(row.title);
        setDescription(row.description);
        setPriceNaira(String(Math.round(row.priceKobo / 100)));
        setReason(
          row.rejectionReason ||
            row.moderationReasons?.filter(Boolean).join(" ") ||
            null,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load listing");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function publishAgain() {
    if (!listingId) return;
    const token = await getAccessToken();
    if (!token) return;
    const price = Number(priceNaira);
    if (!title.trim() || title.trim().length < 3) {
      setError("Add a title of at least a few characters.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price in naira.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await patchListing(listingId, token, {
        title: title.trim(),
        description: description.trim(),
        priceKobo: nairaToKobo(price),
      });
      const published = await publishListing(listingId, token);
      if (published.status === "LIVE") {
        setResult("Your listing is live.");
      } else if (published.status === "UNDER_REVIEW") {
        setResult(
          "Submitted again. We are checking the photos and details before it goes live.",
        );
      } else if (published.status === "REJECTED") {
        setReason(
          published.rejectionReason ||
            published.moderationReasons?.join(" ") ||
            reason,
        );
        setError("It was rejected again. Adjust the details and try once more.");
      } else {
        setResult(`Status: ${sentenceCaseLabel(published.status)}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={Boolean(listingId)} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={fixStyles.pad}>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={fixStyles.link}>Close</Text>
        </Pressable>
        <Text style={fixStyles.title}>Fix this listing</Text>
        {loading ? (
          <ActivityIndicator color="#0E9F6E" style={{ marginTop: 24 }} />
        ) : (
          <View>
            <View style={fixStyles.reason}>
              <Text style={fixStyles.reasonTitle}>Why it was rejected</Text>
              <Text style={fixStyles.reasonBody}>
                {reason ?? "No reason was recorded."}
              </Text>
            </View>
            <Text style={fixStyles.label}>Title</Text>
            <TextInput
              style={fixStyles.input}
              value={title}
              onChangeText={setTitle}
              accessibilityLabel="Title"
            />
            <Text style={fixStyles.label}>Description</Text>
            <TextInput
              style={[fixStyles.input, { minHeight: 96 }]}
              value={description}
              onChangeText={setDescription}
              multiline
              accessibilityLabel="Description"
            />
            <Text style={fixStyles.label}>Price (₦)</Text>
            <TextInput
              style={fixStyles.input}
              value={priceNaira}
              onChangeText={setPriceNaira}
              keyboardType="decimal-pad"
              accessibilityLabel="Price in naira"
            />
            {error ? <Text style={fixStyles.error}>{error}</Text> : null}
            {result ? <Text style={fixStyles.result}>{result}</Text> : null}
            <Text style={fixStyles.hint}>
              Publishing runs the photo and details checks again.
            </Text>
            <Pressable
              style={[fixStyles.button, busy && { opacity: 0.6 }]}
              onPress={() => void publishAgain()}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={fixStyles.buttonText}>
                {busy ? "Publishing…" : "Publish again"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const fixStyles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 48, backgroundColor: "#F7F8F6" },
  link: { color: "#0E9F6E", fontWeight: "600", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#111315", marginBottom: 12 },
  reason: {
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  reasonTitle: { fontWeight: "700", color: "#991B1B" },
  reasonBody: { marginTop: 4, color: "#7F1D1D", lineHeight: 20 },
  label: { marginTop: 10, marginBottom: 4, fontWeight: "600", color: "#1A1D21" },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E4E7E2",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  error: { color: "#B42318", marginTop: 12 },
  result: { color: "#065F46", marginTop: 12 },
  hint: { marginTop: 12, color: "#5C636A" },
  button: {
    marginTop: 16,
    backgroundColor: "#0E9F6E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#FFF", fontWeight: "700" },
});
