import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { useColors } from "../theme/ThemeProvider";
import { radius } from "../theme/tokens";

type Props = {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
  circle?: boolean;
};

/** Content placeholder — no spinners on content screens. */
export function Skeleton({ width = "100%", height = 16, style, circle }: Props) {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[
        {
          width,
          height: circle ? (typeof width === "number" ? width : height) : height,
          borderRadius: circle ? 999 : radius.md,
          backgroundColor: c.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function ListingCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={200} style={{ borderRadius: radius.lg }} />
      <View style={{ gap: 8, marginTop: 12 }}>
        <Skeleton height={20} width="50%" />
        <Skeleton height={15} width="80%" />
        <Skeleton height={13} width="40%" />
      </View>
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <View style={styles.home} accessibilityLabel="Loading home">
      <Skeleton height={28} width="40%" />
      <Skeleton height={48} style={{ marginTop: 16 }} />
      <View style={styles.row}>
        {[0, 1, 2].map((i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 160 },
  home: { paddingTop: 8 },
  row: { flexDirection: "row", gap: 12, marginTop: 24 },
});
