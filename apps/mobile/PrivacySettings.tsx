import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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

const LABELS: Record<ConsentChannel, string> = {
  MARKETING: "Marketing",
  EMAIL: "Email updates",
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

  async function exportData() {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await apiFetch("/me/export", { token });
      setMessage("Export ready — check API response / share sheet later");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  async function deleteAccount() {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await apiFetch("/me/delete-request", { method: "POST", token });
      setMessage("Account deleted");
      onDeleted?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Delete failed");
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
          <Text style={styles.label}>{LABELS[row.channel]}</Text>
          <Switch
            value={row.granted}
            onValueChange={(v) => void toggle(row.channel, v)}
          />
        </View>
      ))}
      <Pressable style={styles.btn} onPress={() => void exportData()}>
        <Text style={styles.btnText}>Export my data</Text>
      </Pressable>
      <Pressable style={styles.danger} onPress={() => void deleteAccount()}>
        <Text style={styles.dangerText}>Delete account</Text>
      </Pressable>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
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
    paddingVertical: 6,
  },
  label: { fontSize: 15 },
  btn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.navy,
  },
  btnText: { color: colors.onAccent, fontWeight: "600" },
  danger: { paddingVertical: 10, alignItems: "center" },
  dangerText: { color: colors.error, fontWeight: "600" },
  msg: { fontSize: 13, color: colors.muted, marginTop: 4 },
});
