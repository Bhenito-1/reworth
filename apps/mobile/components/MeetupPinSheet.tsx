/**
 * ADR-011 Phase C — pick / share a private meetup pin in chat.
 */

import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { getDeviceCoords } from "../lib/locate";
import { useColors } from "../theme/ThemeProvider";
import { radius, space, type as typeScale } from "../theme/tokens";

type Props = {
  visible: boolean;
  initialLat?: number;
  initialLng?: number;
  onClose: () => void;
  onShare: (pin: { lat: number; lng: number; label: string }) => void;
};

export function MeetupPinSheet({
  visible,
  initialLat = 6.4474,
  initialLng = 3.4721,
  onClose,
  onShare,
}: Props) {
  const c = useColors();
  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);
  const [label, setLabel] = useState("Meetup point");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLat(initialLat);
    setLng(initialLng);
    setLabel("Meetup point");
    setHint(null);
  }, [visible, initialLat, initialLng]);

  async function useMyGps() {
    setBusy(true);
    setHint(null);
    try {
      const coords = await getDeviceCoords();
      if (!coords) {
        setHint("Location permission needed to drop your pin.");
        return;
      }
      setLat(coords.lat);
      setLng(coords.lng);
      setHint("Pin set to your current location");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Could not get GPS");
    } finally {
      setBusy(false);
    }
  }

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
            <Text style={[styles.title, { color: c.ink }]}>Meetup pin</Text>
            <Text style={[styles.sub, { color: c.muted }]}>
              Private to this chat only — not shown on public listings.
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={{ color: c.orange, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
        </View>

        <TextInput
          style={[
            styles.input,
            {
              borderColor: c.border,
              backgroundColor: c.surface,
              color: c.ink,
            },
          ]}
          value={label}
          onChangeText={setLabel}
          placeholder="Label (e.g. Lekki Mall gate)"
          placeholderTextColor={c.muted}
          maxLength={80}
          accessibilityLabel="Meetup label"
        />

        <Pressable
          onPress={() => void useMyGps()}
          disabled={busy}
          style={[styles.gpsBtn, { borderColor: c.orange, backgroundColor: c.beige }]}
          accessibilityRole="button"
          accessibilityLabel="Use my location for meetup pin"
        >
          <Text style={{ color: c.ink, fontWeight: "700" }}>
            {busy ? "Getting GPS…" : "Use my location"}
          </Text>
        </Pressable>

        {Platform.OS === "web" ? (
          <View
            style={[
              styles.fallback,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text style={{ color: c.muted }}>
              Map picker on iOS/Android. Coords: {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          </View>
        ) : (
          <MapView
            style={styles.map}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            initialRegion={{
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            region={{
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            onPress={(e) => {
              setLat(e.nativeEvent.coordinate.latitude);
              setLng(e.nativeEvent.coordinate.longitude);
            }}
            showsUserLocation
          >
            <Marker
              coordinate={{ latitude: lat, longitude: lng }}
              draggable
              onDragEnd={(e) => {
                setLat(e.nativeEvent.coordinate.latitude);
                setLng(e.nativeEvent.coordinate.longitude);
              }}
              title={label || "Meetup"}
              pinColor="#D96A32"
            />
          </MapView>
        )}

        {hint ? (
          <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text>
        ) : (
          <Text style={[styles.hint, { color: c.muted }]}>
            Tap the map or drag the pin. Share only with this buyer/seller.
          </Text>
        )}

        <Pressable
          onPress={() =>
            onShare({
              lat,
              lng,
              label: label.trim() || "Meetup point",
            })
          }
          style={[styles.shareBtn, { backgroundColor: c.orange }]}
          accessibilityRole="button"
          accessibilityLabel="Share meetup pin in chat"
        >
          <Text style={{ color: c.onAccent, fontWeight: "700", fontSize: 16 }}>
            Share pin in chat
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: space.lg },
  header: {
    flexDirection: "row",
    paddingHorizontal: space.lg,
    marginBottom: space.md,
    gap: space.md,
  },
  title: { fontSize: typeScale.title, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  input: {
    marginHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: space.sm,
  },
  gpsBtn: {
    marginHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: space.sm,
  },
  map: { flex: 1, marginHorizontal: space.md, borderRadius: radius.md },
  fallback: {
    flex: 1,
    marginHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
    justifyContent: "center",
  },
  hint: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    fontSize: 12,
  },
  shareBtn: {
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
});
