import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScrollView } from "./BoundScroll";
import { getAccessToken } from "../lib/auth";
import {
  acceptDriverRun,
  declineDriverRun,
  listDriverAssignments,
  milestoneButtonLabel,
  nextMilestone,
  newIdempotencyKey,
  submitDriverMilestone,
  type DriverAssignment,
} from "../lib/driver-delivery";
import { shipmentStatusLabel } from "../lib/delivery";
import { ApiError } from "../lib/api";
import { colors } from "../theme/tokens";

const PROGRESS = [
  { status: "ASSIGNED", label: "Assigned & accepted" },
  { status: "PICKED_UP", label: "Collected from seller" },
  { status: "IN_TRANSIT", label: "On the way" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
] as const;

const RANK: Record<string, number> = {
  OFFERED: 0,
  ASSIGNED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};

type Section = "active" | "pickups";

type Props = {
  riderName?: string | null;
  onBack?: () => void;
  onOpenOrder?: (orderId: string) => void;
};

function naira(kobo?: number | null): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format((kobo ?? 0) / 100);
}

function stopLine(stop: DriverAssignment["pickup"], fallback: string): string {
  if (!stop) return fallback;
  if (stop.line) return stop.line;
  if (stop.area) return stop.area;
  return fallback;
}

function isPickup(row: DriverAssignment): boolean {
  return row.status === "OFFERED" && !row.accepted;
}

export function DriverRunsPanel({
  riderName,
  onBack,
  onOpenOrder: _onOpenOrder,
}: Props) {
  const [rows, setRows] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("active");
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Sign in as a delivery driver to see runs.");
        setRows([]);
        return;
      }
      setRows(await listDriverAssignments(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => clearInterval(timer);
  }, [load]);

  const activeRuns = useMemo(() => rows.filter((row) => !isPickup(row)), [rows]);
  const pickups = useMemo(() => rows.filter(isPickup), [rows]);
  const featured = activeRuns[0] ?? null;
  const onRunFees = activeRuns.reduce((sum, row) => sum + (row.quoteKobo ?? 0), 0);
  const corridor = featured
    ? `${featured.community ?? "Pickup"} → ${featured.dropoffArea ?? "Dropoff"}`
    : "Waiting for a run";

  async function accept(row: DriverAssignment) {
    const token = await getAccessToken();
    if (!token) return;
    setBusyId(row.orderId);
    setToast(null);
    try {
      await acceptDriverRun(token, row.orderId);
      setToast("Accepted. Pickup and dropoff are now visible.");
      setSection("active");
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Could not accept");
    } finally {
      setBusyId(null);
    }
  }

  async function decline(row: DriverAssignment) {
    const token = await getAccessToken();
    if (!token) return;
    setBusyId(row.orderId);
    setToast(null);
    try {
      await declineDriverRun(token, row.orderId);
      setToast("Declined. The run goes to the next rider.");
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Could not decline");
    } finally {
      setBusyId(null);
    }
  }

  async function advance(row: DriverAssignment, failed = false) {
    const token = await getAccessToken();
    if (!token) return;
    const status = failed ? "FAILED" : nextMilestone(row.status);
    if (!status) return;
    if (failed && !failReason.trim()) {
      setToast("Add what went wrong before reporting the run.");
      setReportOpen(true);
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
          failureReason: failed ? failReason : undefined,
          occurredAt: new Date().toISOString(),
        },
        newIdempotencyKey(row.orderId, status),
      );
      setToast(
        result.accepted
          ? `Updated → ${shipmentStatusLabel(result.status ?? status)}`
          : `Late update ignored — still ${result.currentStatus ?? row.status}`,
      );
      if (failed && result.accepted) {
        setReportOpen(false);
        setFailReason("");
      }
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function openRoute(row: DriverAssignment) {
    const from = row.pickup;
    const to = row.dropoff;
    if (from?.lat == null || from.lng == null || to?.lat == null || to.lng == null) {
      setToast("The route opens after you accept and both stops have a pin.");
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
    await Linking.openURL(url);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to profile">
            <Text style={styles.back}>←</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.onlinePill}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Online</Text>
        </View>
        <Pressable
          style={styles.sos}
          onPress={() => setReportOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Report a delivery issue"
        >
          <Text style={styles.sosText}>SOS</Text>
        </Pressable>
      </View>
      <Text style={styles.corridor} numberOfLines={1}>
        {riderName ? `${riderName} · ` : ""}
        {corridor}
      </Text>

      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.earnRow}>
          <View>
            <Text style={styles.earnValue}>{naira(onRunFees)}</Text>
            <Text style={styles.earnLabel}>on your runs</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {activeRuns.length} active
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, section === "active" && styles.tabOn]}
            onPress={() => setSection("active")}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === "active" }}
          >
            <Text style={[styles.tabText, section === "active" && styles.tabTextOn]}>
              Active run {activeRuns.length}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, section === "pickups" && styles.tabOn]}
            onPress={() => setSection("pickups")}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === "pickups" }}
          >
            <Text style={[styles.tabText, section === "pickups" && styles.tabTextOn]}>
              Pickups {pickups.length}
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}
        {toast ? <Text style={styles.toast}>{toast}</Text> : null}

        {section === "pickups" ? (
          pickups.length === 0 ? (
            <Text style={styles.copy}>No pickups waiting. A paid order shows up here.</Text>
          ) : (
            pickups.map((row) => (
              <PickupCard
                key={row.orderId}
                row={row}
                busy={busyId === row.orderId}
                onAccept={() => void accept(row)}
                onDecline={() => void decline(row)}
              />
            ))
          )
        ) : featured ? (
          <ActiveCard
            row={featured}
            busy={busyId === featured.orderId}
            onAdvance={() => void advance(featured, false)}
            onReport={() => setReportOpen(true)}
            onRoute={() => void openRoute(featured)}
          />
        ) : (
          <Text style={styles.copy}>No active run. Accept a pickup to start.</Text>
        )}
      </ScrollView>

      {reportOpen ? (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Report this run</Text>
          <Text style={styles.copy}>
            This marks the active delivery as undeliverable. It does not call emergency services.
          </Text>
          {featured ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="What went wrong"
                placeholderTextColor={colors.muted}
                value={failReason}
                onChangeText={setFailReason}
                accessibilityLabel="What went wrong"
              />
              <Pressable
                style={styles.dangerBtn}
                disabled={busyId === featured.orderId}
                onPress={() => void advance(featured, true)}
              >
                <Text style={styles.primaryText}>Could not deliver</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.copy}>Accept a run before reporting it.</Text>
          )}
          <Pressable onPress={() => setReportOpen(false)}>
            <Text style={styles.backLink}>Close</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ActiveCard({
  row,
  busy,
  onAdvance,
  onReport,
  onRoute,
}: {
  row: DriverAssignment;
  busy: boolean;
  onAdvance: () => void;
  onReport: () => void;
  onRoute: () => void;
}) {
  const next = nextMilestone(row.status);
  const rank = RANK[row.status] ?? 0;
  return (
    <View style={styles.card} testID={`driver-run-${row.orderId}`}>
      <View style={styles.cardTop}>
        <Text style={styles.kicker}>ReWorth delivery</Text>
        <Text style={styles.fee}>{naira(row.quoteKobo)}</Text>
      </View>
      <Text style={styles.cardTitle}>{row.listingTitle ?? "Delivery"}</Text>
      <Text style={styles.meta}>
        {row.community ?? "Pickup"} → {row.dropoffArea ?? "Dropoff"}
        {row.distanceKm != null ? ` · ${row.distanceKm.toFixed(1)} km` : ""}
      </Text>
      <View style={styles.party}>
        <Text style={styles.partyKicker}>A · Pickup</Text>
        <Text style={styles.partyName}>{row.sellerName ?? "Seller"}</Text>
        <Text style={styles.meta}>
          {stopLine(row.pickup, row.community ?? "Seller area")}
        </Text>
        {row.sellerPhone ? (
          <Text style={styles.meta}>Phone {row.sellerPhone}</Text>
        ) : null}
      </View>
      <View style={styles.party}>
        <Text style={styles.partyKicker}>B · Dropoff</Text>
        <Text style={styles.partyName}>{row.dropoffArea ?? "Buyer"}</Text>
        <Text style={styles.meta}>
          {stopLine(row.dropoff, row.dropoffArea ?? "Buyer area")}
        </Text>
      </View>
      <Text style={styles.progressTitle}>Delivery progress</Text>
      {PROGRESS.map((step) => {
        const done = rank >= (RANK[step.status] ?? 0) && row.status !== "FAILED";
        const current = row.status === step.status;
        return (
          <View key={step.status} style={styles.step}>
            <View style={[styles.stepDot, done && styles.stepDotOn]} />
            <Text style={[styles.stepLabel, current && styles.stepCurrent]}>
              {step.label}
            </Text>
          </View>
        );
      })}
      <View style={styles.actions}>
        {next ? (
          <Pressable style={styles.primaryBtn} disabled={busy} onPress={onAdvance}>
            <Text style={styles.primaryText}>
              {busy ? "…" : `Mark ${milestoneButtonLabel(next)}`}
            </Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.ghostBtn} onPress={onRoute}>
          <Text style={styles.ghostText}>Open route</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={onReport}>
          <Text style={styles.ghostText}>Report an issue</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PickupCard({
  row,
  busy,
  onAccept,
  onDecline,
}: {
  row: DriverAssignment;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{row.listingTitle ?? "Delivery"}</Text>
        <Text style={styles.fee}>{naira(row.quoteKobo)}</Text>
      </View>
      <Text style={styles.meta}>
        {row.community ?? "Pickup"} → {row.dropoffArea ?? "Dropoff"}
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} disabled={busy} onPress={onAccept}>
          <Text style={styles.primaryText}>{busy ? "…" : "Accept run"}</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} disabled={busy} onPress={onDecline}>
          <Text style={styles.ghostText}>Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  back: { fontSize: 22, color: colors.ink, padding: 4 },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E4F0EA",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  onlineText: { color: colors.success, fontWeight: "700", fontSize: 13 },
  sos: {
    backgroundColor: "#FCE8E6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sosText: { color: colors.error, fontWeight: "700", fontSize: 13 },
  corridor: {
    paddingHorizontal: 16,
    paddingTop: 8,
    color: colors.muted,
    fontSize: 13,
  },
  pad: { padding: 16, paddingBottom: 40, gap: 12 },
  earnRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  earnValue: { fontSize: 28, fontWeight: "700", color: colors.orange },
  earnLabel: { color: colors.muted, fontSize: 13 },
  countPill: {
    backgroundColor: colors.orangeWash,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countText: { color: colors.orangePressed, fontWeight: "700", fontSize: 13 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  tabTextOn: { color: colors.onAccent },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  err: { color: colors.error, fontSize: 14 },
  toast: { color: colors.success, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  fee: { color: colors.orange, fontWeight: "700", fontSize: 18 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.ink, flex: 1 },
  meta: { color: colors.muted, fontSize: 13 },
  party: {
    backgroundColor: colors.canvas,
    borderRadius: 14,
    padding: 12,
    gap: 2,
  },
  partyKicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  partyName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  progressTitle: { marginTop: 4, fontWeight: "700", color: colors.ink },
  step: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepDotOn: { backgroundColor: colors.success, borderColor: colors.success },
  stepLabel: { color: colors.muted, fontSize: 14 },
  stepCurrent: { color: colors.ink, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  primaryBtn: {
    backgroundColor: colors.orange,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: { color: colors.onAccent, fontWeight: "700", fontSize: 13 },
  ghostBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ghostText: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  sheet: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  dangerBtn: {
    backgroundColor: colors.error,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  backLink: { color: colors.ink, fontWeight: "600", paddingVertical: 6 },
});
