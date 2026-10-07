import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  emptyIllustrationSource,
  type EmptyIllustration,
} from "../lib/brandAssets";
import { useColors } from "../theme/ThemeProvider";
import { colors, radius, space, tap, type } from "../theme/tokens";
import { hapticLight } from "../theme/haptics";

type Props = {
  title: string;
  body?: string;
  ctaLabel: string;
  onCta: () => void;
  illustration?: EmptyIllustration;
};

export function EmptyState({
  title,
  body,
  ctaLabel,
  onCta,
  illustration = "generic",
}: Props) {
  const c = useColors();
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={[styles.illusWrap, { backgroundColor: c.surfaceWarm }]}>
        <Image
          source={emptyIllustrationSource(illustration)}
          style={styles.illus}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
      <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      {body ? (
        <Text style={[styles.body, { color: c.muted }]}>{body}</Text>
      ) : null}
      <Pressable
        onPress={() => {
          void hapticLight();
          onCta();
        }}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        hitSlop={6}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: pressed ? c.orangePressed : c.orange,
          },
        ]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  illusWrap: {
    width: 168,
    height: 168,
    borderRadius: radius.lg,
    marginBottom: space.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  illus: {
    width: 148,
    height: 148,
  },
  title: {
    fontSize: type.titleSm,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: type.bodySm,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  cta: {
    marginTop: space.md,
    minHeight: tap.min,
    paddingHorizontal: space.xl,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: colors.onAccent,
    fontSize: type.body,
    fontWeight: "600",
  },
});
