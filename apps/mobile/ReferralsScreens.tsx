import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "./components/AppButton";
import { EmptyState } from "./components/EmptyState";
import { ApiError } from "./lib/api";
import { ensureAccessToken } from "./lib/auth";
import { brandAssets } from "./lib/brandAssets";
import * as Clipboard from "./lib/clipboard";
import {
  getMyReferrals,
  referralShareUrl,
  referralStatusLabel,
  shareReferralInvite,
  type MyReferralInvite,
} from "./lib/referrals";
import { hapticLight } from "./theme/haptics";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  onNeedAuth?: () => void;
};

export function ReferralsModal({ visible, onClose, onNeedAuth }: Props) {
  const c = useColors();
  const [code, setCode] = useState<string | null>(null);
  const [invited, setInvited] = useState<MyReferralInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        onNeedAuth?.();
        return;
      }
      const res = await getMyReferrals(token);
      setCode(res.code);
      setInvited(res.invited ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load referrals",
      );
    } finally {
      setLoading(false);
    }
  }, [onNeedAuth]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function copyCode() {
    if (!code) return;
    await Clipboard.setString(code);
    setToast("Code copied");
    void hapticLight();
  }

  async function copyLink() {
    if (!code) return;
    await Clipboard.setString(referralShareUrl(code));
    setToast("Link copied");
    void hapticLight();
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.ink }]}>Referrals</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={{ color: c.muted, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>

        {toast ? (
          <Text style={[styles.toast, { color: c.navy }]}>{toast}</Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={c.orange} style={{ marginTop: 40 }} />
        ) : error ? (
          <EmptyState
            title="Couldn’t load referrals"
            body={error}
            ctaLabel="Retry"
            onCta={() => void load()}
            illustration="listings"
          />
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            <Image
              source={brandAssets.invite}
              style={styles.hero}
              resizeMode="contain"
            />
            <Text style={[styles.lede, { color: c.muted }]}>
              Invite friends. Rewards are listing boost credits when they
              complete qualifying steps.
            </Text>

            <View
              style={[
                styles.card,
                { backgroundColor: c.surface, borderColor: c.border },
              ]}
            >
              <Text style={[styles.cardLabel, { color: c.muted }]}>
                Your code
              </Text>
              <Text style={[styles.code, { color: c.ink }]}>{code ?? "—"}</Text>
              <View style={styles.row}>
                <AppButton
                  label="Copy code"
                  onPress={() => void copyCode()}
                  style={{ flex: 1 }}
                />
                <AppButton
                  label="Copy link"
                  variant="secondary"
                  onPress={() => void copyLink()}
                  style={{ flex: 1 }}
                />
              </View>
              <AppButton
                label="Share invite"
                variant="soft"
                onPress={() => code && void shareReferralInvite(code)}
                style={{ marginTop: space.sm }}
              />
            </View>

            <Text style={[styles.section, { color: c.ink }]}>My referrals</Text>
            {!invited.length ? (
              <Text style={{ color: c.muted, fontSize: type.meta }}>
                No referrals yet — share your code to get started.
              </Text>
            ) : (
              invited.map((row) => (
                <View
                  key={row.referredUserId}
                  style={[
                    styles.inviteRow,
                    { borderColor: c.border, backgroundColor: c.surface },
                  ]}
                >
                  <Text style={{ color: c.ink, fontWeight: "600", flex: 1 }}>
                    {row.displayName ||
                      `User ${row.referredUserId.slice(0, 8)}…`}
                  </Text>
                  <Text style={{ color: c.orange, fontSize: type.meta }}>
                    {referralStatusLabel(row.status)}
                  </Text>
                </View>
              ))
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
  hero: { width: "100%", height: 120, marginBottom: space.sm },
  lede: { fontSize: type.bodySm, lineHeight: 22, marginBottom: space.md },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  cardLabel: { fontSize: type.meta, fontWeight: "600" },
  code: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  section: {
    fontSize: type.titleSm,
    fontWeight: "700",
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
});
