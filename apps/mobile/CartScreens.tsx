import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ApiError } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import { formatNgnFromKobo } from "./lib/types";
import {
  checkoutCart,
  listCart,
  listInventory,
  removeFromCart,
  removeListing,
  updateCartQuantity,
  type CartItem,
  type InventoryRow,
} from "./lib/cart";

export function CartPanel({
  onOpenListing,
  onCheckedOut,
}: {
  onOpenListing: (id: string) => void;
  onCheckedOut: () => void;
}) {
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      setItems(await listCart(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load cart");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkout() {
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      await checkoutCart(token, "PICKUP");
      onCheckedOut();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!items && !error) {
    return <ActivityIndicator style={{ marginTop: 24 }} color="#0E9F6E" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.title}>Cart</Text>
      <Text style={styles.copy}>
        Adding an item does not place an order. Checkout reserves units and asks
        the seller to confirm before you pay.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items && items.length === 0 ? (
        <Text style={styles.copy}>Your cart is empty.</Text>
      ) : null}
      {items?.map((item) => (
        <View key={item.id} style={styles.card}>
          <Pressable onPress={() => onOpenListing(item.listing.id)}>
            <Text style={styles.itemTitle}>{item.listing.title || "Untitled"}</Text>
          </Pressable>
          <Text style={styles.copy}>
            {formatNgnFromKobo(item.listing.priceKobo)} per unit
            {item.unavailable
              ? " · Unavailable"
              : ` · ${item.listing.quantityAvailable} available`}
          </Text>
          <View style={styles.row}>
            <Pressable
              style={styles.step}
              disabled={item.quantity <= 1}
              onPress={() =>
                void (async () => {
                  const token = await getAccessToken();
                  if (!token) return;
                  await updateCartQuantity(token, item.listing.id, item.quantity - 1);
                  await load();
                })()
              }
            >
              <Text>−</Text>
            </Pressable>
            <Text style={styles.qty}>{item.quantity}</Text>
            <Pressable
              style={styles.step}
              disabled={item.quantity >= item.listing.quantityAvailable}
              onPress={() =>
                void (async () => {
                  const token = await getAccessToken();
                  if (!token) return;
                  await updateCartQuantity(token, item.listing.id, item.quantity + 1);
                  await load();
                })()
              }
            >
              <Text>+</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                void (async () => {
                  const token = await getAccessToken();
                  if (!token) return;
                  await removeFromCart(token, item.listing.id);
                  await load();
                })()
              }
            >
              <Text style={styles.cartRemove}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {items && items.some((item) => !item.unavailable) ? (
        <Pressable style={styles.primary} disabled={busy} onPress={() => void checkout()}>
          <Text style={styles.primaryText}>{busy ? "Placing orders…" : "Place orders"}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function InventoryPanel({
  onOpenListing,
}: {
  onOpenListing: (id: string) => void;
}) {
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      setRows(await listInventory(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load inventory");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onRemove(row: InventoryRow) {
    Alert.alert(
      "Remove listing",
      `Remove “${row.title || "this listing"}” from the marketplace? It stays in your inventory.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const token = await getAccessToken();
              if (!token) return;
              setRemovingId(row.id);
              setError(null);
              try {
                await removeListing(token, row.id);
                await load();
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : "Could not remove this listing",
                );
              } finally {
                setRemovingId(null);
              }
            })();
          },
        },
      ],
    );
  }

  if (!rows && !error) {
    return <ActivityIndicator style={{ marginTop: 24 }} color="#0E9F6E" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.title}>Inventory</Text>
      <Text style={styles.copy}>
        All of your listings, including sold items that are off the marketplace.
        You can take a listing down when nothing is in progress. A sold-out listing stays here.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows && rows.length === 0 ? (
        <Text style={styles.copy}>You have not listed anything yet.</Text>
      ) : null}
      {rows?.map((row) => (
        <Pressable key={row.id} style={styles.card} onPress={() => onOpenListing(row.id)}>
          <Text style={styles.itemTitle}>{row.title || "Untitled"}</Text>
          <Text style={styles.copy}>
            {formatNgnFromKobo(row.priceKobo)} per unit ·{" "}
            {row.onMarketplace ? "On marketplace" : row.status}
          </Text>
          <Text style={styles.copy}>
            Listed {row.quantityTotal} · Available {row.quantityAvailable} · Reserved{" "}
            {row.quantityReserved} · Sold {row.quantitySold}
          </Text>
          {row.canRemove ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onRemove(row);
              }}
              disabled={removingId === row.id}
              hitSlop={8}
            >
              <Text style={styles.remove}>
                {removingId === row.id ? "Removing…" : "Remove from marketplace"}
              </Text>
            </Pressable>
          ) : row.status !== "REMOVED" && row.removeBlockedReason ? (
            <Text style={styles.copy}>{row.removeBlockedReason}</Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  copy: { color: "#5C574E", fontSize: 14, lineHeight: 20 },
  error: { color: "#9B2C2C" },
  remove: { color: "#9B2C2C", fontSize: 14, fontWeight: "600", marginTop: 4 },
  card: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
    gap: 6,
  },
  itemTitle: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { minWidth: 20, textAlign: "center", fontWeight: "600" },
  cartRemove: { color: "#9B2C2C", fontSize: 14, fontWeight: "600", marginLeft: 8 },
  primary: {
    backgroundColor: "#0E9F6E",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "600" },
});
