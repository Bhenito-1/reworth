import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { apiFetch, ApiError } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import { colors } from "./theme/tokens";

type ConsentChannel = "MARKETING" | "EMAIL";

type ConsentRow = {
  channel: ConsentChannel;
  granted: boolean;
};

const COPY: Record<ConsentChannel, { label: string; hint: string }> = {
  EMAIL: {
    label: "Email",
    hint: "Orders and important updates. Off means we send you no email.",
  },
  MARKETING: {
    label: "Marketing",
    hint: "Product ads and promotions. Off means no marketing email.",
  },
};

type Props = {
  onDeleted?: () => void;
};

/**
 * Lightweight privacy settings for mobile profile (Phase 9).
 */
export function PrivacySettings({ onDeleted }: Props) {
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ consents: ConsentRow[] }>("/me/consents", {
        token,
      });
      setConsents(res.consents);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(channel: ConsentChannel, granted: boolean) {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await apiFetch<{ consents: ConsentRow[] }>("/me/consents", {
        method: "PUT",
        token,
        body: { consents: [{ channel, granted }] },
      });
      setConsents(res.consents);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function deleteAccount() {
    const token = await getAccessToken();
    if (!token) return;
    setDeleting(true);
    setMessage(null);
    try {
      await apiFetch("/me/delete-request", { method: "POST", token });
      setConfirmOpen(false);
      onDeleted?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.box}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Privacy</Text>
      {consents.map((row) => (
        <View key={row.channel} style={styles.row}>
          <View style={styles.copyBlock}>
            <Text style={styles.label}>{COPY[row.channel].label}</Text>
            <Text style={styles.hint}>{COPY[row.channel].hint}</Text>
          </View>
          <Switch
            value={row.granted}
            onValueChange={(v) => void toggle(row.channel, v)}
            accessibilityLabel={COPY[row.channel].label}
          />
        </View>
      ))}
      <Pressable
        style={styles.danger}
        onPress={() => setConfirmOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        <Text style={styles.dangerText}>Delete account</Text>
      </Pressable>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleting) setConfirmOpen(false);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.confirmTitle}>Delete your account?</Text>
            <Text style={styles.confirmCopy}>
              You will be signed out and your profile will be removed. Orders
              you bought or sold, and the payments on them, stay on record.
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={() => setConfirmOpen(false)}
                disabled={deleting}
                accessibilityRole="button"
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void deleteAccount()}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete account"
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmBtnText}>
                  {deleting ? "Deleting…" : "Delete account"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 12, gap: 10 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  copyBlock: { flex: 1 },
  label: { fontSize: 15, fontWeight: "600" },
  hint: { marginTop: 2, fontSize: 13, color: colors.muted, lineHeight: 18 },
  danger: { paddingVertical: 10, alignItems: "center" },
  dangerText: { color: colors.error, fontWeight: "600" },
  msg: { fontSize: 13, color: colors.muted, marginTop: 4 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,19,21,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  confirmCopy: { fontSize: 14, lineHeight: 20, color: colors.ink },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontWeight: "600", color: colors.ink },
  confirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { fontWeight: "700", color: colors.onAccent },
});
