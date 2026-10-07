import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import { nairaToKobo } from "./lib/chat";
import { getListing, listMine, patchListing, publishListing, type MineListing } from "./lib/listings";

export function SellerListingsPanel({
  onFixRejected,
}: {
  onFixRejected?: (listingId: string) => void;
}) {
  const [items, setItems] = useState<MineListing[]>([]);
  const [filter, setFilter] = useState<"all" | "live" | "review" | "rejected" | "sold">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listMine(token);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load listings");
    } finally {
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

  if (loading && items.length === 0 && !error) {
    return <ActivityIndicator color="#0E9F6E" style={{ marginTop: 24 }} />;
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.pad}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Your listings</Text>
          <Text style={styles.copy}>
            Live listings, items still in review, and anything that was rejected.
          </Text>
          <View style={styles.filters}>
            {(
              [
                ["all", "All"],
                ["live", "Live"],
                ["review", "In review"],
                ["rejected", "Rejected"],
                ["sold", "Sold"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setFilter(id)}
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
        error ? null : (
          <Text style={styles.copy}>
            {items.length === 0
              ? "Nothing here yet. Publish a listing and its review status shows up on this page."
              : "Nothing in this status."}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text
              style={[
                styles.badge,
                item.reviewState === "rejected" && styles.badgeRejected,
                item.reviewState === "waiting" && styles.badgeWaiting,
                item.reviewState === "approved" && styles.badgeApproved,
              ]}
            >
              {item.reviewLabel}
            </Text>
          </View>
          {item.reviewNote ? (
            <Text style={styles.note}>{item.reviewNote}</Text>
          ) : null}
          {item.reviewState === "rejected" && onFixRejected ? (
            <Pressable
              onPress={() => onFixRejected(item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.refresh}>See why and fix it</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      refreshing={loading}
      onRefresh={() => void load()}
      ListFooterComponent={
        <Pressable onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.refresh}>Refresh</Text>
        </Pressable>
      }
    />
  );
}

function listingGroup(
  item: MineListing,
): "live" | "review" | "rejected" | "sold" {
  if (item.reviewState === "rejected" || item.status === "REJECTED") {
    return "rejected";
  }
  if (item.status === "SOLD") return "sold";
  if (item.status === "LIVE" || item.status === "RESERVED") return "live";
  return "review";
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
    color: "#5C636A",
    backgroundColor: "#F3F0EA",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeWaiting: { color: "#92400E", backgroundColor: "#FEF3C7" },
  badgeRejected: { color: "#991B1B", backgroundColor: "#FEE2E2" },
  badgeApproved: { color: "#065F46", backgroundColor: "#D1FAE5" },
  note: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#5C636A" },
  refresh: { color: "#0E9F6E", fontWeight: "600", marginTop: 8 },
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
        setResult(`Status: ${published.status}`);
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
