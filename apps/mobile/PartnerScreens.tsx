import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "./components/AppButton";
import { EmptyState } from "./components/EmptyState";
import { ApiError } from "./lib/api";
import { ensureAccessToken, getAccessToken } from "./lib/auth";
import {
  decidePartnerMembership,
  getPartnerKpis,
  getStoredPartnerKey,
  listPartnerMembershipQueue,
  setStoredPartnerKey,
  type PartnerKpis,
  type PartnerMembership,
} from "./lib/partner";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  onNeedAuth?: () => void;
};

export function PartnerConsoleModal({ visible, onClose, onNeedAuth }: Props) {
  const c = useColors();
  const [kpis, setKpis] = useState<PartnerKpis | null>(null);
  const [queue, setQueue] = useState<PartnerMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [usingKey, setUsingKey] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = (await getAccessToken()) ?? (await ensureAccessToken());
      const partnerKey = getStoredPartnerKey();
      setUsingKey(Boolean(partnerKey));
      if (!token && !partnerKey) {
        onNeedAuth?.();
        return;
      }
      const [kpiRes, memRes] = await Promise.all([
        getPartnerKpis(token, partnerKey),
        listPartnerMembershipQueue(token, partnerKey, "INVITED"),
      ]);
      setKpis(kpiRes);
      setQueue(memRes);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load partner console",
      );
      setKpis(null);
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [onNeedAuth]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  function onSaveKey() {
    const key = apiKeyDraft.trim();
    if (!key) {
      setToast("Paste a partner API key");
      return;
    }
    setStoredPartnerKey(key);
    setApiKeyDraft("");
    setToast("API key stored for this app session only");
    void load();
  }

  function clearKey() {
    setStoredPartnerKey(null);
    setUsingKey(false);
    setToast("Partner API key cleared");
    void load();
  }

  async function decide(id: string, action: "approve" | "reject") {
    const token = await getAccessToken();
    const partnerKey = getStoredPartnerKey();
    setBusyId(id);
    try {
      await decidePartnerMembership(id, action, token, partnerKey);
      setToast(action === "approve" ? "Member approved" : "Request rejected");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${action} failed`);
    } finally {
      setBusyId(null);
    }
  }

  const kpiCards: { label: string; value: string | number }[] = [
    { label: "Members", value: kpis?.members ?? "—" },
    { label: "Pending", value: kpis?.pending ?? "—" },
    { label: "Live listings", value: kpis?.liveListings ?? "—" },
    { label: "Joins (7d)", value: kpis?.joins7d ?? "—" },
  ];

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.ink }]}>Partner console</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={{ color: c.muted, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>

        {toast ? (
          <Text style={[styles.toast, { color: c.navy }]}>{toast}</Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={c.orange} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            <Text style={[styles.lede, { color: c.muted }]}>
              Estate KPIs and membership queue. Sign in as a community manager,
              or attach a partner API key for this session.
            </Text>

            <View
              style={[
                styles.card,
                { borderColor: c.border, backgroundColor: c.surface },
              ]}
            >
              <Text style={[styles.section, { color: c.ink }]}>
                Session note
              </Text>
              <Text style={{ color: c.muted, fontSize: type.meta, lineHeight: 18 }}>
                Prefer your ReWorth login. Machine keys use header
                x-reworth-partner-key and stay in memory only — cleared when the
                app restarts.
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: c.border,
                    color: c.ink,
                    backgroundColor: c.canvas,
                    marginTop: space.sm,
                  },
                ]}
                placeholder="Partner API key (optional)"
                placeholderTextColor={c.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={apiKeyDraft}
                onChangeText={setApiKeyDraft}
              />
              {usingKey ? (
                <Text style={{ color: c.orange, fontSize: type.meta }}>
                  A key is active for this session
                </Text>
              ) : null}
              <View style={styles.row}>
                <AppButton
                  label="Use key"
                  variant="secondary"
                  onPress={onSaveKey}
                  style={{ flex: 1 }}
                />
                {usingKey ? (
                  <AppButton
                    label="Clear"
                    variant="secondary"
                    onPress={clearKey}
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>
            </View>

            {error ? (
              <EmptyState
                title="Couldn’t load partner console"
                body={error}
                ctaLabel="Retry"
                onCta={() => void load()}
                illustration="listings"
              />
            ) : (
              <>
                <Text style={[styles.section, { color: c.ink }]}>
                  KPIs
                  {kpis?.communityName || kpis?.companyName
                    ? ` · ${String(kpis.communityName || kpis.companyName)}`
                    : ""}
                </Text>
                <View style={styles.kpiGrid}>
                  {kpiCards.map((card) => (
                    <View
                      key={card.label}
                      style={[
                        styles.kpi,
                        { borderColor: c.border, backgroundColor: c.surface },
                      ]}
                    >
                      <Text style={{ color: c.muted, fontSize: type.meta }}>
                        {card.label}
                      </Text>
                      <Text
                        style={{
                          color: c.ink,
                          fontSize: 22,
                          fontWeight: "700",
                          marginTop: 4,
                        }}
                      >
                        {card.value}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.queueHeader}>
                  <Text style={[styles.section, { color: c.ink }]}>
                    Membership queue
                  </Text>
                  <Pressable onPress={() => void load()} hitSlop={8}>
                    <Text style={{ color: c.orange, fontWeight: "600" }}>
                      Refresh
                    </Text>
                  </Pressable>
                </View>

                {!queue.length ? (
                  <EmptyState
                    title="No pending requests"
                    body="New join requests appear here for approval."
                    ctaLabel="Refresh"
                    onCta={() => void load()}
                    illustration="listings"
                  />
                ) : (
                  queue.map((m) => (
                    <View
                      key={m.id}
                      style={[
                        styles.card,
                        { borderColor: c.border, backgroundColor: c.surface },
                      ]}
                    >
                      <Text style={{ color: c.ink, fontWeight: "700" }}>
                        {m.displayName ||
                          m.phoneMasked ||
                          m.userId?.slice(0, 8) ||
                          "Member"}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: type.meta }}>
                        {m.status}
                        {m.createdAt
                          ? ` · ${new Date(m.createdAt).toLocaleDateString("en-NG")}`
                          : ""}
                      </Text>
                      <View style={styles.row}>
                        <AppButton
                          label="Approve"
                          onPress={() => void decide(m.id, "approve")}
                          loading={busyId === m.id}
                          style={{ flex: 1 }}
                        />
                        <AppButton
                          label="Reject"
                          variant="secondary"
                          onPress={() => void decide(m.id, "reject")}
                          loading={busyId === m.id}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  title: { fontSize: type.title, fontWeight: "700" },
  toast: { paddingHorizontal: space.lg, marginBottom: 4, fontSize: type.meta },
  pad: { padding: space.lg, paddingBottom: 48, gap: space.sm },
  lede: { fontSize: type.bodySm, lineHeight: 22, marginBottom: space.md },
  section: { fontSize: type.body, fontWeight: "700", marginBottom: 4 },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 8,
    marginBottom: space.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.bodySm,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: space.md,
  },
  kpi: {
    width: "47%",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.sm,
  },
});
