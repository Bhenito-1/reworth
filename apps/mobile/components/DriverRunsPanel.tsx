import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScrollView } from "./BoundScroll";
import { getAccessToken } from "../lib/auth";
import {
  listDriverAssignments,
  nextMilestone,
  newIdempotencyKey,
  submitDriverMilestone,
  type DriverAssignment,
} from "../lib/driver-delivery";
import { ApiError } from "../lib/api";
import { colors } from "../theme/tokens";

type Props = {
  onOpenOrder?: (orderId: string) => void;
};

export function DriverRunsPanel({ onOpenOrder }: Props) {
  const [rows, setRows] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Sign in as a delivery driver to see runs.");
        setRows([]);
        return;
      }
      const data = await listDriverAssignments(token);
      setRows(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(row: DriverAssignment, failed = false) {
    const token = await getAccessToken();
    if (!token) return;
    const status = failed ? "FAILED" : nextMilestone(row.status);
    if (!status) return;
    if (failed && !(failReason[row.orderId]?.trim())) {
      setToast("Add a failure reason before marking failed.");
      return;
    }
    setBusyId(row.orderId);
    setToast(null);
    try {
      const result = await submitDriverMilestone(
        token,
        row.orderId,
        {
          status,
          failureReason: failed ? failReason[row.orderId] : undefined,
          occurredAt: new Date().toISOString(),
        },
        newIdempotencyKey(row.orderId, status),
      );
      if (!result.accepted) {
        setToast(
          result.reason === "stale_or_delayed"
            ? `Late update ignored — still ${result.currentStatus}`
            : "Update not applied",
        );
      } else {
        setToast(`Updated → ${result.status}`);
      }
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.title} accessibilityRole="header">
        Driver runs
      </Text>
      <Text style={styles.copy}>
        Submit pickup → transit → delivered milestones. Customers see the same
        timeline live.
      </Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
      {rows.length === 0 && !error ? (
        <Text style={styles.copy}>No active assignments.</Text>
      ) : null}
      {rows.map((row) => {
        const next = nextMilestone(row.status);
        const busy = busyId === row.orderId;
        return (
          <View key={row.orderId} style={styles.card} testID={`driver-run-${row.orderId}`}>
            <Pressable onPress={() => onOpenOrder?.(row.orderId)}>
              <Text style={styles.cardTitle}>
                {row.listingTitle ?? "Delivery"}
              </Text>
              <Text style={styles.meta}>
                {row.status.replace(/_/g, " ")}
                {row.community ? ` · ${row.community}` : ""}
              </Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Failure reason (if needed)"
              placeholderTextColor={colors.muted}
              value={failReason[row.orderId] ?? ""}
              onChangeText={(t) =>
                setFailReason((prev) => ({ ...prev, [row.orderId]: t }))
              }
              accessibilityLabel="Failure reason"
            />
            <View style={styles.row}>
              {next ? (
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  disabled={busy}
                  onPress={() => void advance(row, false)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${next}`}
                >
                  <Text style={styles.btnPrimaryText}>
                    {busy ? "…" : `Mark ${next.replace(/_/g, " ")}`}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                disabled={busy}
                onPress={() => void advance(row, true)}
                accessibilityRole="button"
                accessibilityLabel="Mark failed"
              >
                <Text style={styles.btnDangerText}>Failed</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Pressable style={styles.refresh} onPress={() => void load()}>
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 48, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  copy: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  err: { color: "#b42318", fontSize: 14 },
  toast: { color: colors.brand, fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: colors.surface,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.ink,
    fontSize: 14,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  btnDanger: { borderWidth: 1, borderColor: "#b42318" },
  btnDangerText: { color: "#b42318", fontWeight: "600", fontSize: 13 },
  refresh: { alignSelf: "flex-start", paddingVertical: 8 },
  refreshText: { color: colors.brand, fontWeight: "600" },
});
