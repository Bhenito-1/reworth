/**
 * Public pro storefront — GET /storefronts/:handle
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EmptyState } from "./components/EmptyState";
import { ListingCard } from "./components/ListingCard";
import { ApiError } from "./lib/api";
import {
  getStorefront,
  storefrontShareUrl,
  type ProStorefront,
  type StorefrontListing,
} from "./lib/pro";
import { formatNgnFromKobo } from "./lib/types";
import { useColors } from "./theme/ThemeProvider";
import { space, type } from "./theme/tokens";

type Props = {
  handle: string | null;
  onClose: () => void;
  onOpenListing?: (id: string) => void;
};

function coverUrl(listing: StorefrontListing): string | undefined {
  const img = listing.images?.[0];
  if (!img) return undefined;
  const variants = img.variants as Record<string, string> | undefined;
  if (variants?.card) return variants.card;
  if (variants?.thumb) return variants.thumb;
  if (typeof img.url === "string") return img.url;
  return undefined;
}

export function StorefrontModal({ handle, onClose, onOpenListing }: Props) {
  const c = useColors();
  const [storefront, setStorefront] = useState<ProStorefront | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!handle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStorefront(handle);
      setStorefront(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Storefront not found",
      );
      setStorefront(null);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    if (handle) void load();
    else {
      setStorefront(null);
      setError(null);
    }
  }, [handle, load]);

  async function shareStorefront() {
    if (!storefront?.handle) return;
    const url = storefrontShareUrl(storefront.handle);
    const name =
      storefront.businessName ||
      storefront.displayName ||
      `@${storefront.handle}`;
    await Share.share({
      message: `Shop ${name} on ReWorth: ${url}`,
      title: name,
      url,
    });
  }

  if (!handle) return null;

  const listings = storefront?.listings ?? storefront?.items ?? [];
  const name =
    storefront?.businessName ||
    storefront?.displayName ||
    `@${storefront?.handle || handle}`;

  return (
    <Modal
      visible={Boolean(handle)}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.close, { color: c.orange }]}>Close</Text>
          </Pressable>
          <Text style={[styles.brand, { color: c.ink }]}>Storefront</Text>
          <Pressable
            onPress={() => void shareStorefront()}
            disabled={!storefront?.handle}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text
              style={[
                styles.close,
                { color: storefront?.handle ? c.orange : c.muted },
              ]}
            >
              Share
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={c.orange} style={{ marginTop: 40 }} />
        ) : error || !storefront ? (
          <View style={styles.pad}>
            <EmptyState
              title="Storefront unavailable"
              body={error ?? "This seller handle was not found."}
              ctaLabel="Retry"
              onCta={() => void load()}
              illustration="search"
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            <Text style={[styles.handle, { color: c.muted }]}>
              @{storefront.handle || handle}
            </Text>
            <Text style={[styles.name, { color: c.ink }]}>{name}</Text>
            {storefront.proBadge || storefront.verificationBadge ? (
              <Text style={[styles.badge, { color: c.orange }]}>
                {storefront.proBadge || "Identity Verified ✓"}
              </Text>
            ) : null}
            {storefront.about || storefront.bio ? (
              <Text style={[styles.bio, { color: c.muted }]}>
                {storefront.about || storefront.bio}
              </Text>
            ) : null}
            {storefront.rating != null ? (
              <Text style={[styles.meta, { color: c.muted }]}>
                ★ {storefront.rating.toFixed(1)}
                {storefront.reviewCount != null
                  ? ` · ${storefront.reviewCount} reviews`
                  : ""}
              </Text>
            ) : null}

            <Text style={[styles.section, { color: c.ink }]}>Listings</Text>
            {!listings.length ? (
              <Text style={{ color: c.muted, fontSize: type.meta }}>
                No live listings yet.
              </Text>
            ) : (
              <View style={styles.grid}>
                {listings.map((item) => (
                  <ListingCard
                    key={item.id}
                    title={item.title || "Untitled"}
                    priceLabel={formatNgnFromKobo(item.priceKobo)}
                    community={item.community || undefined}
                    imageUri={coverUrl(item)}
                    onPress={() => onOpenListing?.(item.id)}
                    style={{ width: "48%", marginBottom: 12 }}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}
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
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { fontSize: type.bodySm, fontWeight: "600", minWidth: 52 },
  brand: { fontSize: type.body, fontWeight: "700" },
  pad: { padding: space.md, paddingBottom: 48 },
  handle: { fontSize: type.meta, fontWeight: "600" },
  name: {
    marginTop: space.xs,
    fontSize: type.titleSm,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  badge: { marginTop: space.sm, fontSize: type.meta, fontWeight: "600" },
  bio: { marginTop: space.md, fontSize: type.bodySm, lineHeight: 22 },
  meta: { marginTop: space.sm, fontSize: type.meta },
  section: {
    marginTop: space.xl,
    marginBottom: space.md,
    fontSize: type.body,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
});
