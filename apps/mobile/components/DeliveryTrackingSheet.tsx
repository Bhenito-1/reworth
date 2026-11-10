/**
 * Delivery journey D3 — corridor map + help (no live rider GPS).
 */
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import {
  formatDeliveryEta,
  shipmentStatusLabel,
  type DeliveryShipment,
} from "../lib/delivery";
import { colors, radius, space, type as typeScale } from "../theme/tokens";

export type DeliveryCorridor = {
  sellerLat: number;
  sellerLng: number;
  sellerLabel: string;
  buyerLat: number;
  buyerLng: number;
  buyerLabel: string;
};

type Props = {
  visible: boolean;
  shipment: DeliveryShipment | null;
  corridor: DeliveryCorridor | null;
  role: "buyer" | "seller";
  onClose: () => void;
  onOpenDispute?: () => void;
};

export function DeliveryTrackingSheet({
  visible,
  shipment,
  corridor,
  role,
  onClose,
  onOpenDispute,
}: Props) {
  if (!shipment) return null;

  const eta = formatDeliveryEta(shipment.etaFrom, shipment.etaTo);
  const failed = shipment.status === "FAILED";
  const midLat = corridor
    ? (corridor.sellerLat + corridor.buyerLat) / 2
    : 6.45;
  const midLng = corridor
    ? (corridor.sellerLng + corridor.buyerLng) / 2
    : 3.4;
  const latDelta = corridor
    ? Math.max(0.04, Math.abs(corridor.sellerLat - corridor.buyerLat) * 2.6)
    : 0.12;
  const lngDelta = corridor
    ? Math.max(0.04, Math.abs(corridor.sellerLng - corridor.buyerLng) * 2.6)
    : 0.12;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root} testID="delivery-tracking-sheet">
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Track delivery</Text>
            <Text style={styles.sub}>
              {shipmentStatusLabel(shipment.status)} · {eta}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close tracking"
            hitSlop={12}
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        {Platform.OS === "web" || !corridor ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>Corridor view</Text>
            <Text style={styles.fallbackBody}>
              {corridor
                ? `Seller area: ${corridor.sellerLabel}\nYour area: ${corridor.buyerLabel}`
                : "Map opens on iOS / Android with community pins only — exact home addresses stay private."}
              {"\n\n"}
              Live rider GPS comes later. You still get status updates on the
              order timeline.
            </Text>
          </View>
        ) : (
          <MapView
            style={styles.map}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            initialRegion={{
              latitude: midLat,
              longitude: midLng,
              latitudeDelta: latDelta,
              longitudeDelta: lngDelta,
            }}
            accessibilityLabel="Delivery corridor map"
          >
            <Marker
              coordinate={{
                latitude: corridor.sellerLat,
                longitude: corridor.sellerLng,
              }}
              title="Seller area"
              description={corridor.sellerLabel}
              pinColor="#172A3A"
            />
            <Marker
              coordinate={{
                latitude: corridor.buyerLat,
                longitude: corridor.buyerLng,
              }}
              title={role === "buyer" ? "Your area" : "Buyer area"}
              description={corridor.buyerLabel}
              pinColor="#D96A32"
            />
          </MapView>
        )}

        <Text style={styles.privacy}>
          Navy = seller corridor · Orange = buyer corridor. Exact addresses are
          never shown on this map.
        </Text>

        <View style={styles.help}>
          <Text style={styles.helpTitle}>
            {failed ? "Delivery needs attention" : "Item not moving?"}
          </Text>
          <Text style={styles.helpBody}>
            {failed
              ? shipment.failureReason?.trim() ||
                "We hit a snag. You can open a dispute from this order — payment stays protected until it’s resolved."
              : "Statuses update when the rider collects and is out for delivery. If nothing changes for a full day after “Rider assigned”, open a dispute or message support from the order."}
          </Text>
          {onOpenDispute ? (
            <Pressable
              style={styles.helpBtn}
              onPress={onOpenDispute}
              accessibilityRole="button"
              accessibilityLabel="Open a dispute"
              testID="delivery-tracking-dispute"
            >
              <Text style={styles.helpBtnText}>Open a dispute</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: space.lg,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "700",
    color: colors.ink,
  },
  sub: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
    color: colors.muted,
  },
  done: { color: colors.orange, fontWeight: "700" },
  map: {
    flex: 1,
    marginHorizontal: space.md,
    borderRadius: radius.md,
  },
  fallback: {
    flex: 1,
    marginHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
  },
  fallbackTitle: {
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 8,
    fontSize: typeScale.body,
  },
  fallbackBody: {
    color: colors.muted,
    lineHeight: 20,
    fontSize: typeScale.bodySm,
  },
  privacy: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  help: {
    margin: space.md,
    marginBottom: space.xl,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: space.sm,
  },
  helpTitle: {
    fontSize: typeScale.body,
    fontWeight: "700",
    color: colors.ink,
  },
  helpBody: {
    fontSize: typeScale.bodySm,
    color: colors.muted,
    lineHeight: 20,
  },
  helpBtn: {
    marginTop: space.xs,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  helpBtnText: {
    color: colors.onAccent,
    fontWeight: "700",
    fontSize: typeScale.bodySm,
  },
});
