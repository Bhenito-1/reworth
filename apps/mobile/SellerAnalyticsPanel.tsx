import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EmptyState } from "./components/EmptyState";
import { ApiError } from "./lib/api";
import { ensureAccessToken } from "./lib/auth";
import {
  fetchSellerAnalytics,
  type SellerAnalytics,
  type SellerListingMetrics,
} from "./lib/intelligence";
import { formatNgnFromKobo } from "./lib/types";
import { hapticLight } from "./theme/haptics";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Props = {
  city?: string;
  onOpenListing?: (id: string) => void;
  onSell?: () => void;
};

function pct(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

function hoursLabel(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function SellerAnalyticsPanel({ city, onOpenListing, onSell }: Props) {
  const c = useColors();
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (soft?: boolean) => {
      if (!soft) setLoading(true);
      setError(null);
      try {
        const token = await ensureAccessToken();
        if (!token) {
          setError("Sign in to see seller analytics");
          setData(null);
          return;
        }
        const res = await fetchSellerAnalytics(token, { city });
        setData(res);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not load analytics",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [city],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.orange} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        title="Analytics unavailable"
        body={error}
        ctaLabel="Retry"
        onCta={() => void load()}
        illustration="listings"
      />
    );
  }

  const agg = data?.aggregate;
  const listings = data?.listings ?? [];

  if (!agg || (listings.length === 0 && agg.views === 0)) {
    return (
      <EmptyState
        title="No seller stats yet"
        body="Publish a listing to see views, saves, offers, and conversion."
        ctaLabel="Sell something"
        onCta={() => onSell?.()}
        illustration="listings"
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.pad, { backgroundColor: c.canvas }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={c.orange}
        />
      }
    >
      <Text style={[styles.title, { color: c.ink }]}>Seller analytics</Text>
      <Text style={[styles.meta, { color: c.muted }]}>
        {data?.city || city || "Lagos"} · last 30–90 days
      </Text>

      <View style={styles.grid}>
        <Metric
          label="Views"
          value={String(agg.views)}
          ink={c.ink}
          muted={c.muted}
          surface={c.surface}
          border={c.border}
        />
        <Metric
          label="Saves"
          value={String(agg.saves)}
          ink={c.ink}
          muted={c.muted}
          surface={c.surface}
          border={c.border}
        />
        <Metric
          label="Offers"
          value={String(agg.offers)}
          ink={c.ink}
          muted={c.muted}
          surface={c.surface}
          border={c.border}
        />
        <Metric
          label="Offer→sale"
          value={pct(agg.offerToSaleConversion)}
          ink={c.ink}
          muted={c.muted}
          surface={c.surface}
          border={c.border}
        />
        <Metric
          label="Median TTS"
          value={hoursLabel(agg.medianTimeToSaleHours)}
          ink={c.ink}
          muted={c.muted}
          surface={c.surface}
          border={c.border}
        />
        <Metric
          label="Revenue 30d"
          value={formatNgnFromKobo(agg.revenue30dKobo)}
          ink={c.ink}
          muted={c.muted}
          surface={c.surface}
          border={c.border}
        />
      </View>

      <ListingBlock
        title="Your listings"
        rows={listings.slice(0, 12)}
        onOpenListing={onOpenListing}
        ink={c.ink}
        muted={c.muted}
        surface={c.surface}
        border={c.border}
        orange={c.orange}
      />
      <ListingBlock
        title="Best performers"
        rows={data?.bestPerformers ?? []}
        onOpenListing={onOpenListing}
        ink={c.ink}
        muted={c.muted}
        surface={c.surface}
        border={c.border}
        orange={c.orange}
      />
      <ListingBlock
        title="Needs attention"
        rows={data?.worstPerformers ?? []}
        onOpenListing={onOpenListing}
        ink={c.ink}
        muted={c.muted}
        surface={c.surface}
        border={c.border}
        orange={c.orange}
      />
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  ink,
  muted,
  surface,
  border,
}: {
  label: string;
  value: string;
  ink: string;
  muted: string;
  surface: string;
  border: string;
}) {
  return (
    <View style={[styles.metric, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.metricLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: ink }]}>{value}</Text>
    </View>
  );
}

function ListingBlock({
  title,
  rows,
  onOpenListing,
  ink,
  muted,
  surface,
  border,
  orange,
}: {
  title: string;
  rows: SellerListingMetrics[];
  onOpenListing?: (id: string) => void;
  ink: string;
  muted: string;
  surface: string;
  border: string;
  orange: string;
}) {
  if (!rows.length) return null;
  return (
    <View style={styles.block}>
      <Text style={[styles.section, { color: ink }]}>{title}</Text>
      {rows.map((row) => (
        <Pressable
          key={row.listingId}
          onPress={() => {
            void hapticLight();
            onOpenListing?.(row.listingId);
          }}
          style={[styles.row, { backgroundColor: surface, borderColor: border }]}
          accessibilityRole="button"
          accessibilityLabel={row.title || "Listing"}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: ink }]} numberOfLines={1}>
              {row.title || "Untitled"}
            </Text>
            <Text style={[styles.meta, { color: muted }]}>
              {row.views} views · {row.saves} saves · {row.offers} offers ·{" "}
              {pct(row.offerToSaleConversion)}
            </Text>
          </View>
          <Text style={{ color: orange, fontWeight: "700", fontSize: type.meta }}>
            {formatNgnFromKobo(row.askingKobo)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.lg, paddingBottom: 48, gap: space.sm },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  title: { fontSize: type.titleSm, fontWeight: "700" },
  meta: { fontSize: type.meta },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  metric: {
    width: "48%",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: { fontSize: type.titleSm, fontWeight: "700", marginTop: 4 },
  block: { marginTop: space.lg, gap: space.sm },
  section: { fontSize: type.body, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  rowTitle: { fontSize: type.bodySm, fontWeight: "600", marginBottom: 2 },
});
