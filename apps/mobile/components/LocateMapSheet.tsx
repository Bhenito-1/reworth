/**
 * ADR-011 Phase B — map of “you” + snapped community (browse stays privacy-safe).
 */

import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useColors } from "../theme/ThemeProvider";
import { radius, space, type as typeScale } from "../theme/tokens";

export type LocateMapPayload = {
  userLat: number;
  userLng: number;
  communityLat: number;
  communityLng: number;
  communityLabel: string;
  cityLabel: string;
  distanceKm: number;
};

type Props = {
  visible: boolean;
  payload: LocateMapPayload | null;
  onClose: () => void;
};

export function LocateMapSheet({ visible, payload, onClose }: Props) {
  const c = useColors();
  if (!payload) return null;

  const midLat = (payload.userLat + payload.communityLat) / 2;
  const midLng = (payload.userLng + payload.communityLng) / 2;
  const latDelta = Math.max(
    0.02,
    Math.abs(payload.userLat - payload.communityLat) * 2.4,
  );
  const lngDelta = Math.max(
    0.02,
    Math.abs(payload.userLng - payload.communityLng) * 2.4,
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.ink }]}>Your area</Text>
            <Text style={[styles.sub, { color: c.muted }]}>
              {payload.communityLabel} · {payload.cityLabel}
              {payload.distanceKm
                ? ` · ~${payload.distanceKm.toFixed(1)} km from pin`
                : ""}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close map"
            hitSlop={12}
          >
            <Text style={{ color: c.orange, fontWeight: "700" }}>Done</Text>
          </Pressable>
        </View>

        {Platform.OS === "web" ? (
          <View
            style={[
              styles.fallback,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text style={{ color: c.ink, fontWeight: "600", marginBottom: 8 }}>
              Map preview is on iOS / Android
            </Text>
            <Text style={{ color: c.muted, lineHeight: 20 }}>
              You: {payload.userLat.toFixed(4)}, {payload.userLng.toFixed(4)}
              {"\n"}
              Community pin: {payload.communityLat.toFixed(4)},{" "}
              {payload.communityLng.toFixed(4)}
              {"\n\n"}
              Exact home is never shown on public browse — only this community
              snap.
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
            showsUserLocation
            showsMyLocationButton
            accessibilityLabel="Map of your location and nearest community"
          >
            <Marker
              coordinate={{
                latitude: payload.userLat,
                longitude: payload.userLng,
              }}
              title="You"
              description="Current location (private)"
              pinColor="#172A3A"
            />
            <Marker
              coordinate={{
                latitude: payload.communityLat,
                longitude: payload.communityLng,
              }}
              title={payload.communityLabel}
              description={`${payload.cityLabel} · ReWorth community`}
              pinColor="#D96A32"
            />
          </MapView>
        )}

        <Text style={[styles.footer, { color: c.muted }]}>
          Blue / navy = you · Orange = community used for discovery. Meetup pins
          for orders come next.
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: space.lg },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  title: { fontSize: typeScale.title, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  map: { flex: 1, marginHorizontal: space.md, borderRadius: radius.md },
  fallback: {
    flex: 1,
    marginHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 12,
    lineHeight: 16,
  },
});
