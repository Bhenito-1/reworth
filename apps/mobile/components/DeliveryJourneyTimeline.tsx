/**
 * Customer-centric delivery journey (sprint D2 + D3 entry).
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  DELIVERY_JOURNEY_STEPS,
  formatDeliveryEta,
  journeyStepIndex,
  type DeliveryShipment,
} from "../lib/delivery";
import { colors, radius, space, type as typeScale } from "../theme/tokens";

type Props = {
  shipment: DeliveryShipment;
  role: "buyer" | "seller";
  onOpenTracking?: () => void;
};

export function DeliveryJourneyTimeline({
  shipment,
  role,
  onOpenTracking,
}: Props) {
  const current = journeyStepIndex(shipment.status);
  const failed = shipment.status === "FAILED";
  const eta = formatDeliveryEta(shipment.etaFrom, shipment.etaTo);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={`Delivery journey · ${shipment.status}`}
    >
      <Text style={styles.title}>Your delivery</Text>
      <Text style={styles.eta}>{eta}</Text>
      {onOpenTracking ? (
        <Pressable
          onPress={onOpenTracking}
          accessibilityRole="button"
          accessibilityLabel="Open map and help"
          testID="delivery-open-tracking"
          style={styles.trackBtn}
        >
          <Text style={styles.trackBtnText}>Map & help</Text>
        </Pressable>
      ) : null}
      {failed ? (
        <Text style={styles.fail} accessibilityRole="alert">
          {shipment.failureReason?.trim() ||
            "Something went wrong with delivery. Chat support or open a dispute from this order."}
        </Text>
      ) : null}

      <View style={styles.steps}>
        {DELIVERY_JOURNEY_STEPS.map((step, index) => {
          const done = !failed && index < current;
          const active = !failed && index === current;
          const upcoming = failed || index > current;
          return (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.rail}>
                <View
                  style={[
                    styles.dot,
                    done && styles.dotDone,
                    active && styles.dotActive,
                    upcoming && styles.dotUpcoming,
                  ]}
                />
                {index < DELIVERY_JOURNEY_STEPS.length - 1 ? (
                  <View
                    style={[styles.line, done && styles.lineDone]}
                  />
                ) : null}
              </View>
              <View style={styles.stepCopy}>
                <Text
                  style={[
                    styles.stepTitle,
                    active && styles.stepTitleActive,
                    upcoming && styles.stepTitleMuted,
                  ]}
                >
                  {step.title}
                </Text>
                <Text style={styles.stepHint}>
                  {role === "buyer" ? step.buyerHint : step.sellerHint}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {shipment.events?.length ? (
        <View style={styles.events}>
          <Text style={styles.eventsLabel}>Updates</Text>
          {shipment.events
            .slice()
            .reverse()
            .slice(0, 4)
            .map((e) => (
              <Text key={e.id} style={styles.eventLine}>
                {new Date(e.createdAt).toLocaleString("en-NG")} ·{" "}
                {e.status.replace(/_/g, " ")}
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  title: {
    fontSize: typeScale.body,
    fontWeight: "700",
    color: colors.ink,
  },
  eta: {
    fontSize: typeScale.bodySm,
    fontWeight: "600",
    color: colors.orange,
  },
  trackBtn: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    backgroundColor: colors.navy,
  },
  trackBtnText: {
    color: colors.onAccent,
    fontWeight: "700",
    fontSize: typeScale.meta,
  },
  fail: {
    fontSize: typeScale.bodySm,
    color: colors.error,
    lineHeight: 20,
  },
  steps: {
    marginTop: space.sm,
  },
  stepRow: {
    flexDirection: "row",
    gap: space.md,
    minHeight: 56,
  },
  rail: {
    width: 16,
    alignItems: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dotDone: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  dotActive: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
    transform: [{ scale: 1.15 }],
  },
  dotUpcoming: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: 2,
    marginBottom: 2,
    backgroundColor: colors.border,
  },
  lineDone: {
    backgroundColor: colors.orange,
  },
  stepCopy: {
    flex: 1,
    paddingBottom: space.md,
  },
  stepTitle: {
    fontSize: typeScale.bodySm,
    fontWeight: "600",
    color: colors.ink,
  },
  stepTitleActive: {
    color: colors.navy,
  },
  stepTitleMuted: {
    color: colors.muted,
    fontWeight: "500",
  },
  stepHint: {
    marginTop: 2,
    fontSize: typeScale.meta,
    color: colors.muted,
    lineHeight: 18,
  },
  events: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    gap: 4,
  },
  eventsLabel: {
    fontSize: typeScale.meta,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 2,
  },
  eventLine: {
    fontSize: typeScale.meta,
    color: colors.muted,
  },
});
