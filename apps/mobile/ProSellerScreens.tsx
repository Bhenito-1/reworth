import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "./components/AppButton";
import { ApiError } from "./lib/api";
import { ensureAccessToken } from "./lib/auth";
import {
  applyPro,
  getMyProAccount,
  storefrontShareUrl,
  subscribePro,
  uploadProBulkCsvText,
  type ProAccount,
} from "./lib/pro";
import { formatNgnFromKobo } from "./lib/types";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  onNeedAuth?: () => void;
  onOpenStorefront?: (handle: string) => void;
};

const SAMPLE_CSV = `title,priceNaira,condition,community,categorySlug
IKEA desk,45000,GOOD,Lekki Ph1,home-furniture
Samsung TV 43,180000,LIKE_NEW,VI,electronics`;

export function ProSellerModal({
  visible,
  onClose,
  onNeedAuth,
  onOpenStorefront,
}: Props) {
  const c = useColors();
  const [account, setAccount] = useState<ProAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [handle, setHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [csv, setCsv] = useState(SAMPLE_CSV);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        onNeedAuth?.();
        return;
      }
      const me = await getMyProAccount(token);
      setAccount(me);
      if (me?.businessName) setBusinessName(me.businessName);
      if (me?.handle) setHandle(me.handle);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Pro");
    } finally {
      setLoading(false);
    }
  }, [onNeedAuth]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function onApply() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await applyPro(token, {
        businessName: businessName.trim(),
        handle: handle.trim() || undefined,
        applicationNotes: notes.trim() || undefined,
      });
      setAccount(res);
      setToast("Application submitted");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubscribe() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await subscribePro(token);
      setAccount(res);
      setToast("Subscription started");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Subscribe failed");
    } finally {
      setBusy(false);
    }
  }

  async function onBulk() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const job = await uploadProBulkCsvText(token, csv);
      setToast(
        `Upload ${job.status} · ok ${job.successCount ?? "—"} · errors ${job.errorCount ?? 0}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  const status = account?.status;
  const canBulk =
    status === "ACTIVE" || status === "APPROVED" || status === "GRACE";

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.ink }]}>Pro seller</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={{ color: c.muted, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>

        {toast ? (
          <Text style={[styles.toast, { color: c.navy }]}>{toast}</Text>
        ) : null}
        {error ? (
          <Text style={[styles.toast, { color: c.error }]}>{error}</Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={c.orange} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.pad}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.lede, { color: c.muted }]}>
              Business storefront, bulk tools, and optional Pro subscription for
              boosts.
            </Text>

            {account ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: c.surface, borderColor: c.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: c.ink }]}>
                  {account.businessName}
                </Text>
                <Text style={{ color: c.muted, fontSize: type.meta }}>
                  Status · {account.status}
                  {account.handle ? ` · @${account.handle}` : ""}
                </Text>
                {account.mrrKobo != null ? (
                  <Text style={{ color: c.orange, fontWeight: "700" }}>
                    {formatNgnFromKobo(account.mrrKobo)} / mo
                  </Text>
                ) : null}
                {account.handle ? (
                  <View style={{ marginTop: space.sm, gap: space.xs }}>
                    <AppButton
                      label={`View /u/${account.handle}`}
                      variant="secondary"
                      onPress={() => {
                        onClose();
                        onOpenStorefront?.(account.handle!);
                      }}
                    />
                    <AppButton
                      label="Share storefront"
                      variant="ghost"
                      onPress={() => {
                        void Share.share({
                          message: `Shop ${account.businessName} on ReWorth: ${storefrontShareUrl(account.handle!)}`,
                          url: storefrontShareUrl(account.handle!),
                          title: account.businessName,
                        });
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.section, { color: c.ink }]}>Apply</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: c.border, color: c.ink, backgroundColor: c.surface },
              ]}
              placeholder="Business name"
              placeholderTextColor={c.muted}
              value={businessName}
              onChangeText={setBusinessName}
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: c.border, color: c.ink, backgroundColor: c.surface },
              ]}
              placeholder="Handle (optional)"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              value={handle}
              onChangeText={setHandle}
            />
            <TextInput
              style={[
                styles.input,
                styles.multiline,
                { borderColor: c.border, color: c.ink, backgroundColor: c.surface },
              ]}
              placeholder="Notes for ops (optional)"
              placeholderTextColor={c.muted}
              multiline
              value={notes}
              onChangeText={setNotes}
            />
            <AppButton
              label={busy ? "Submitting…" : "Submit application"}
              onPress={() => void onApply()}
              loading={busy}
            />

            {account && status !== "ACTIVE" ? (
              <AppButton
                label={busy ? "…" : "Start Pro subscription"}
                variant="secondary"
                onPress={() => void onSubscribe()}
                loading={busy}
                style={{ marginTop: space.sm }}
              />
            ) : null}

            {canBulk ? (
              <>
                <Text style={[styles.section, { color: c.ink }]}>
                  Bulk CSV upload
                </Text>
                <Text style={{ color: c.muted, fontSize: type.meta }}>
                  Paste CSV: title,priceNaira,condition,community,categorySlug
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.csv,
                    {
                      borderColor: c.border,
                      color: c.ink,
                      backgroundColor: c.surface,
                    },
                  ]}
                  multiline
                  value={csv}
                  onChangeText={setCsv}
                  autoCapitalize="none"
                />
                <AppButton
                  label={busy ? "Uploading…" : "Upload CSV"}
                  onPress={() => void onBulk()}
                  loading={busy}
                />
              </>
            ) : null}
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
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 4,
    marginBottom: space.md,
  },
  cardTitle: { fontSize: type.body, fontWeight: "700" },
  section: {
    fontSize: type.titleSm,
    fontWeight: "700",
    marginTop: space.md,
    marginBottom: space.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.bodySm,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  csv: { minHeight: 140, textAlignVertical: "top", fontFamily: "monospace" },
});
