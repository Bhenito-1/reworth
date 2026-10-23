/**
 * Delivery journey D4 — exception guidance on the order.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DeliveryExceptionCopy } from "../lib/deliveryExceptions";
import { colors, radius, space, type as typeScale } from "../theme/tokens";

type Props = {
  exception: DeliveryExceptionCopy;
  role: "buyer" | "seller";
  onDispute?: () => void;
  onDismissSoft?: () => void;
};

export function DeliveryExceptionBanner({
  exception,
  role,
  onDispute,
  onDismissSoft,
}: Props) {
  const actions =
    role === "buyer" ? exception.buyerActions : exception.sellerActions;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={exception.title}
      testID="delivery-exception-banner"
    >
      <Text style={styles.kicker}>Needs a decision</Text>
      <Text style={styles.title}>{exception.title}</Text>
      <Text style={styles.body}>{exception.body}</Text>
      <View style={styles.list}>
        {actions.map((a) => (
          <Text key={a} style={styles.bullet}>
            · {a}
          </Text>
        ))}
      </View>
      <View style={styles.row}>
        {onDispute && role === "buyer" ? (
          <Pressable
            style={styles.primary}
            onPress={onDispute}
            accessibilityRole="button"
            accessibilityLabel="Open a dispute"
            testID="delivery-exception-dispute"
          >
            <Text style={styles.primaryText}>Open a dispute</Text>
          </Pressable>
        ) : null}
        {onDismissSoft && exception.kind === "item_issue" ? (
          <Pressable
            style={styles.secondary}
            onPress={onDismissSoft}
            accessibilityRole="button"
            accessibilityLabel="I'll confirm receipt"
          >
            <Text style={styles.secondaryText}>I will confirm</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.foot}>
        Payment stays protected until you confirm or a dispute is resolved.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.goldWash,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  kicker: {
    fontSize: typeScale.meta,
    fontWeight: "700",
    color: colors.warning,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    fontSize: typeScale.body,
    fontWeight: "700",
    color: colors.ink,
  },
  body: {
    fontSize: typeScale.bodySm,
    color: colors.ink,
    lineHeight: 20,
  },
  list: { gap: 4 },
  bullet: {
    fontSize: typeScale.bodySm,
    color: colors.muted,
    lineHeight: 18,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 4 },
  primary: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: colors.onAccent,
    fontWeight: "700",
    fontSize: typeScale.bodySm,
  },
  secondary: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: colors.ink,
    fontWeight: "600",
    fontSize: typeScale.bodySm,
  },
  foot: {
    marginTop: 2,
    fontSize: typeScale.meta,
    color: colors.muted,
    lineHeight: 16,
  },
});
