import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { listListingReviews, type ListingReviewsResponse } from "../lib/trust";
import { useColors } from "../theme/ThemeProvider";

function stars(overall: number): string {
  const full = Math.max(0, Math.min(5, Math.round(overall)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export function ListingReviews({ listingId }: { listingId: string }) {
  const [data, setData] = useState<ListingReviewsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    listListingReviews(listingId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const c = useColors();
  if (!data) return null;

  const seller = data.seller ?? {
    average: data.average,
    count: data.count,
    items: data.items,
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: c.ink }]}>Seller rating</Text>
      {seller.count === 0 || seller.average == null ? (
        <Text style={[styles.muted, { color: c.muted }]}>No buyer ratings yet.</Text>
      ) : (
        <Text style={[styles.aggregate, { color: c.ink }]}>
          <Text style={[styles.stars, { color: c.orange }]}>{stars(seller.average)} </Text>
          {seller.average.toFixed(1)}
          <Text style={[styles.muted, { color: c.muted }]}>
            {"  "}
            {seller.count} {seller.count === 1 ? "buyer" : "buyers"}
          </Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  heading: { fontSize: 18, fontWeight: "700" },
  aggregate: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "700",
  },
  stars: { fontWeight: "700" },
  muted: { marginTop: 4, fontSize: 14, fontWeight: "500" },
});
