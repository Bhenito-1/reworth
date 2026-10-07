import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, apiFetch } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import {
  CRITICAL_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  categoryLabel,
  getNotificationPreferences,
  isCriticalCategory,
  clearNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  parseDeepLink,
  patchNotificationPreference,
  type AppNotification,
  type NotificationChannel,
} from "./lib/notifications";

type Props = {
  visible: boolean;
  embedded?: boolean;
  onClose: () => void;
  onOpenOrder?: (orderId: string) => void;
  onOpenDispute?: (disputeId: string) => void;
  onOpenChat?: (conversationId: string) => void;
  onOpenListing?: (listingId: string) => void;
  onOpenSelling?: (listingId?: string) => void;
};

export function NotificationsModal({
  visible,
  embedded = false,
  onClose,
  onOpenOrder,
  onOpenDispute,
  onOpenChat,
  onOpenListing,
  onOpenSelling,
}: Props) {
  const [tab, setTab] = useState<"inbox" | "prefs">("inbox");
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [quietStart, setQuietStart] = useState("22");
  const [quietEnd, setQuietEnd] = useState("7");
  const [toast, setToast] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listNotifications(token);
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const rows = await getNotificationPreferences(token);
      const map: Record<string, boolean> = {};
      for (const cat of NOTIFICATION_CATEGORIES) {
        for (const ch of NOTIFICATION_CHANNELS) {
          map[`${cat}:${ch}`] = true;
        }
      }
      for (const r of rows) {
        map[`${r.category}:${r.channel}`] = r.enabled;
      }
      setPrefs(map);
      const me = await apiFetch<{
        profile?: { quietHoursStart?: number | null; quietHoursEnd?: number | null };
      }>("/me", { token });
      if (me.profile?.quietHoursStart != null) {
        setQuietStart(String(me.profile.quietHoursStart));
      }
      if (me.profile?.quietHoursEnd != null) {
        setQuietEnd(String(me.profile.quietHoursEnd));
      }
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Prefs failed");
    }
  }, []);

  useEffect(() => {
    if (!visible && !embedded) return;
    if (tab === "inbox") void loadInbox();
    else void loadPrefs();
  }, [visible, embedded, tab, loadInbox, loadPrefs]);

  async function onMarkAll() {
    const token = await getAccessToken();
    if (!token) return;
    const stamp = new Date().toISOString();
    const previous = items;
    setItems((rows) =>
      rows.map((row) => ({ ...row, readAt: row.readAt ?? stamp })),
    );
    try {
      const result = await markAllNotificationsRead(token);
      if (result.updated === 0 && previous.some((row) => !row.readAt)) {
        setItems(previous);
        setToast("Could not mark notifications as read");
        return;
      }
      setToast("All marked read");
    } catch (err) {
      setItems(previous);
      setToast(err instanceof ApiError ? err.message : "Could not mark as read");
    }
  }

  async function onClear() {
    const token = await getAccessToken();
    if (!token || items.length === 0) return;
    const previous = items;
    setItems([]);
    try {
      await clearNotifications(token);
      setToast("Notifications cleared");
    } catch (err) {
      setItems(previous);
      setToast(err instanceof ApiError ? err.message : "Could not clear notifications");
    }
  }

  async function openItem(n: AppNotification) {
    const token = await getAccessToken();
    if (token && !n.readAt) {
      try {
        await markNotificationRead(token, n.id);
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
          ),
        );
      } catch {
        /* ignore */
      }
    }
    const parsed = parseDeepLink(n.deepLink);
    if (parsed?.kind === "order" && parsed.id) onOpenOrder?.(parsed.id);
    else if (parsed?.kind === "dispute" && parsed.id) onOpenDispute?.(parsed.id);
    else if (parsed?.kind === "chat" && parsed.id) onOpenChat?.(parsed.id);
    else if (parsed?.kind === "listing" && parsed.id) onOpenListing?.(parsed.id);
    else if (parsed?.kind === "selling") onOpenSelling?.(parsed.id);
  }

  async function togglePref(
    category: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    if (channel === "IN_APP" && isCriticalCategory(category) && !enabled) {
      setToast("Order-critical in-app alerts cannot be turned off");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    const key = `${category}:${channel}`;
    setPrefs((p) => ({ ...p, [key]: enabled }));
    try {
      await patchNotificationPreference(token, { category, channel, enabled });
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !enabled }));
      setToast(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function saveQuietHours() {
    const token = await getAccessToken();
    if (!token) return;
    const start = Number(quietStart);
    const end = Number(quietEnd);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      start > 23 ||
      end < 0 ||
      end > 23
    ) {
      setToast("Quiet hours must be 0–23");
      return;
    }
    try {
      await apiFetch("/me", {
        method: "PATCH",
        token,
        body: { quietHoursStart: start, quietHoursEnd: end },
      });
      setToast("Quiet hours saved");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  const body = (
      <View style={[styles.root, embedded && styles.rootEmbedded]}>
        <View style={styles.header}>
          {embedded ? (
            <Text style={styles.link}> </Text>
          ) : (
            <Pressable onPress={onClose}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          )}
          <Text style={styles.brand}>Notifications</Text>
          {tab === "inbox" ? (
            <View style={styles.headerActions}>
              <Pressable onPress={() => void onMarkAll()} disabled={items.length === 0}>
                <Text style={styles.link}>Read all</Text>
              </Pressable>
              <Pressable onPress={() => void onClear()} disabled={items.length === 0}>
                <Text style={styles.link}>Clear</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setTab("inbox")}>
              <Text style={styles.link}>Done</Text>
            </Pressable>
          )}
        </View>

        {tab === "inbox" ? (
          <Pressable
            onPress={() => setTab("prefs")}
            style={styles.settingsLink}
          >
            <Text style={styles.link}>Notification settings</Text>
          </Pressable>
        ) : null}

        {toast ? <Text style={styles.toast}>{toast}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {tab === "inbox" ? (
          loading ? (
            <ActivityIndicator color="#0E9F6E" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(n) => n.id}
              contentContainerStyle={styles.pad}
              ListEmptyComponent={
                <Text style={styles.muted}>No notifications yet.</Text>
              }
              renderItem={({ item: n }) => (
                <Pressable
                  style={[styles.row, !n.readAt && styles.rowUnread]}
                  onPress={() => void openItem(n)}
                >
                  <Text style={styles.rowTitle}>{n.title}</Text>
                  <Text style={styles.rowBody} numberOfLines={2}>
                    {n.body}
                  </Text>
                  <Text style={styles.meta}>
                    {categoryLabel(n.category)} ·{" "}
                    {new Date(n.createdAt).toLocaleString()}
                  </Text>
                </Pressable>
              )}
            />
          )
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            <Text style={styles.section}>Quiet hours (WAT, 0–23)</Text>
            <Text style={styles.muted}>
              Push is paused in this window. Order-critical in-app still arrives.
            </Text>
            <View style={styles.quietRow}>
              <TextInput
                style={styles.quietInput}
                value={quietStart}
                onChangeText={setQuietStart}
                keyboardType="number-pad"
                accessibilityLabel="Quiet hours start"
              />
              <Text style={styles.muted}>to</Text>
              <TextInput
                style={styles.quietInput}
                value={quietEnd}
                onChangeText={setQuietEnd}
                keyboardType="number-pad"
                accessibilityLabel="Quiet hours end"
              />
              <Pressable style={styles.saveBtn} onPress={() => void saveQuietHours()}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>

            <Text style={[styles.section, { marginTop: 20 }]}>
              Categories × channels
            </Text>
            <Text style={styles.muted}>
              Critical: {Array.from(CRITICAL_CATEGORIES).join(", ")} — in-app
              always on.
            </Text>
            {NOTIFICATION_CATEGORIES.map((cat) => (
              <View key={cat} style={styles.prefBlock}>
                <Text style={styles.prefCat}>{categoryLabel(cat)}</Text>
                {NOTIFICATION_CHANNELS.map((ch) => {
                  const key = `${cat}:${ch}`;
                  const locked =
                    ch === "IN_APP" && isCriticalCategory(cat);
                  return (
                    <View key={key} style={styles.prefRow}>
                      <Text style={styles.prefCh}>{ch}</Text>
                      <Switch
                        value={prefs[key] !== false}
                        disabled={locked}
                        onValueChange={(v) => void togglePref(cat, ch, v)}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
  );

  if (embedded) return body;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F8F6", paddingTop: 48 },
  rootEmbedded: { paddingTop: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  brand: { fontSize: 17, fontWeight: "700", color: "#1A1D21" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  link: { color: "#0E9F6E", fontWeight: "600", fontSize: 15 },
  settingsLink: { paddingHorizontal: 16, marginBottom: 8 },
  pad: { padding: 16, paddingBottom: 48 },
  row: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E4E7E2",
  },
  rowUnread: { borderColor: "#0E9F6E" },
  rowTitle: { fontWeight: "700", color: "#1A1D21", marginBottom: 4 },
  rowBody: { color: "#3D444B", fontSize: 14 },
  meta: { marginTop: 6, fontSize: 12, color: "#8A9198" },
  muted: { color: "#5C636A", fontSize: 13, marginBottom: 10 },
  error: { color: "#C0392B", paddingHorizontal: 16 },
  toast: {
    marginHorizontal: 16,
    marginBottom: 8,
    color: "#0E9F6E",
    fontWeight: "600",
  },
  section: { fontWeight: "700", fontSize: 15, marginBottom: 6, color: "#1A1D21" },
  quietRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  quietInput: {
    width: 48,
    borderWidth: 1,
    borderColor: "#D0D5CE",
    borderRadius: 8,
    padding: 8,
    textAlign: "center",
    backgroundColor: "#FFF",
  },
  saveBtn: {
    backgroundColor: "#0E9F6E",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: { color: "#FFF", fontWeight: "700" },
  prefBlock: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E4E7E2",
  },
  prefCat: { fontWeight: "700", marginBottom: 8 },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  prefCh: { color: "#5C636A", fontSize: 13 },
});
