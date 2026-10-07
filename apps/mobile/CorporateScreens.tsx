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
import { EmptyState } from "./components/EmptyState";
import { ApiError } from "./lib/api";
import { ensureAccessToken } from "./lib/auth";
import {
  applyCorporate,
  completeRelocationProject,
  corporateStatusLabel,
  createRelocationProject,
  fetchRelocationInvoiceText,
  getMyCorporate,
  getRelocationProject,
  intakeRelocationItems,
  listRelocationProjects,
  PROJECT_STATUS_ORDER,
  projectStatusLabel,
  type CorporateAccount,
  type RelocationProject,
} from "./lib/corporate";
import { listRegions } from "./lib/region";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  onNeedAuth?: () => void;
};

export function CorporateModal({ visible, onClose, onNeedAuth }: Props) {
  const c = useColors();
  const [account, setAccount] = useState<CorporateAccount | null>(null);
  const [projects, setProjects] = useState<RelocationProject[]>([]);
  const [selected, setSelected] = useState<RelocationProject | null>(null);
  const [cities, setCities] = useState<string[]>(["Lagos"]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [billingContact, setBillingContact] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  const [projTitle, setProjTitle] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [cityFrom, setCityFrom] = useState("Lagos");
  const [cityTo, setCityTo] = useState("Lagos");
  const [intakeText, setIntakeText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        onNeedAuth?.();
        return;
      }
      const [me, regions] = await Promise.all([
        getMyCorporate(token),
        listRegions().catch(() => []),
      ]);
      setAccount(me);
      if (regions.length) {
        setCities(
          regions.map((r) => r.displayName || r.city).filter(Boolean),
        );
      }
      if (me && ["APPROVED", "ACTIVE"].includes(String(me.status))) {
        setProjects(await listRelocationProjects(token));
      } else {
        setProjects([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load workspace",
      );
    } finally {
      setLoading(false);
    }
  }, [onNeedAuth]);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      void load();
    }
  }, [visible, load]);

  async function onApply() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    if (!companyName.trim() || !billingContact.trim() || !billingEmail.trim()) {
      setError("Company, contact, and email are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await applyCorporate(token, {
        companyName: companyName.trim(),
        billingContact: billingContact.trim(),
        billingEmail: billingEmail.trim(),
      });
      setAccount(res);
      setToast("Application submitted");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateProject() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    if (!projTitle.trim() || !employeeName.trim() || !deadline.trim()) {
      setError("Title, employee, and deadline (YYYY-MM-DD) required");
      return;
    }
    const iso = new Date(deadline.trim()).toISOString();
    if (Number.isNaN(Date.parse(iso))) {
      setError("Deadline must be a valid date (YYYY-MM-DD)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createRelocationProject(token, {
        title: projTitle.trim(),
        employeeName: employeeName.trim(),
        deadline: iso,
        cityFrom,
        cityTo,
      });
      setProjects((prev) => [created, ...prev]);
      setSelected(created);
      setProjTitle("");
      setEmployeeName("");
      setDeadline("");
      setToast("Project created");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openProject(id: string) {
    const token = await ensureAccessToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setSelected(await getRelocationProject(token, id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load project");
    } finally {
      setBusy(false);
    }
  }

  async function onIntake() {
    const token = await ensureAccessToken();
    if (!token || !selected) return;
    const lines = intakeText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      setError("Add at least one item title (one per line)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await intakeRelocationItems(token, selected.id, {
        items: lines.map((title) => ({ title })),
      });
      setSelected(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setIntakeText("");
      setToast(`Intake saved · ${lines.length} item(s)`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Intake failed");
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    const token = await ensureAccessToken();
    if (!token || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await completeRelocationProject(token, selected.id);
      setSelected(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setToast("Project marked complete");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Complete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onInvoice() {
    const token = await ensureAccessToken();
    if (!token || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const text = await fetchRelocationInvoiceText(token, selected.id);
      await Share.share({
        message: text.slice(0, 3500),
        title: selected.invoiceNumber ?? "Relocation invoice",
      });
      setToast("Invoice ready to share");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invoice unavailable");
    } finally {
      setBusy(false);
    }
  }

  const workspaceReady =
    account && ["APPROVED", "ACTIVE"].includes(String(account.status));
  const currentIdx = selected
    ? PROJECT_STATUS_ORDER.indexOf(selected.status)
    : -1;

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.ink }]}>
            Corporate relocation
          </Text>
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
          <ScrollView contentContainerStyle={styles.pad}>
            <Text style={[styles.lede, { color: c.muted }]}>
              Coordinator workspace for company moves — apply, intake items,
              complete, and share invoice.
            </Text>

            <View
              style={[
                styles.card,
                { borderColor: c.border, backgroundColor: c.surface },
              ]}
            >
              <Text style={[styles.section, { color: c.ink }]}>Account</Text>
              {account ? (
                <>
                  <Text style={{ color: c.ink, fontWeight: "600" }}>
                    {account.companyName}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: type.meta }}>
                    {corporateStatusLabel(account.status)} ·{" "}
                    {account.billingContact}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: type.meta }}>
                    {account.billingEmail}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: c.muted, marginBottom: space.sm }}>
                    Apply for a corporate account to manage relocations.
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: c.border,
                        color: c.ink,
                        backgroundColor: c.canvas,
                      },
                    ]}
                    placeholder="Company name"
                    placeholderTextColor={c.muted}
                    value={companyName}
                    onChangeText={setCompanyName}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: c.border,
                        color: c.ink,
                        backgroundColor: c.canvas,
                      },
                    ]}
                    placeholder="Billing contact"
                    placeholderTextColor={c.muted}
                    value={billingContact}
                    onChangeText={setBillingContact}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: c.border,
                        color: c.ink,
                        backgroundColor: c.canvas,
                      },
                    ]}
                    placeholder="Billing email"
                    placeholderTextColor={c.muted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={billingEmail}
                    onChangeText={setBillingEmail}
                  />
                  <AppButton
                    label={busy ? "Submitting…" : "Apply"}
                    onPress={() => void onApply()}
                    loading={busy}
                  />
                </>
              )}
            </View>

            {workspaceReady ? (
              <>
                <Text style={[styles.section, { color: c.ink }]}>
                  New project
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: c.border,
                      color: c.ink,
                      backgroundColor: c.surface,
                    },
                  ]}
                  placeholder="Project title"
                  placeholderTextColor={c.muted}
                  value={projTitle}
                  onChangeText={setProjTitle}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: c.border,
                      color: c.ink,
                      backgroundColor: c.surface,
                    },
                  ]}
                  placeholder="Employee name"
                  placeholderTextColor={c.muted}
                  value={employeeName}
                  onChangeText={setEmployeeName}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: c.border,
                      color: c.ink,
                      backgroundColor: c.surface,
                    },
                  ]}
                  placeholder="Deadline YYYY-MM-DD"
                  placeholderTextColor={c.muted}
                  value={deadline}
                  onChangeText={setDeadline}
                  autoCapitalize="none"
                />
                <Text style={{ color: c.muted, fontSize: type.meta }}>
                  From city
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {cities.map((city) => (
                    <Pressable
                      key={`from-${city}`}
                      onPress={() => setCityFrom(city)}
                      style={[
                        styles.chip,
                        {
                          borderColor: c.border,
                          backgroundColor:
                            cityFrom === city ? c.orange : c.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: cityFrom === city ? c.onAccent : c.ink,
                          fontWeight: "600",
                          fontSize: type.meta,
                        }}
                      >
                        {city}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={{ color: c.muted, fontSize: type.meta }}>
                  To city
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {cities.map((city) => (
                    <Pressable
                      key={`to-${city}`}
                      onPress={() => setCityTo(city)}
                      style={[
                        styles.chip,
                        {
                          borderColor: c.border,
                          backgroundColor:
                            cityTo === city ? c.orange : c.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: cityTo === city ? c.onAccent : c.ink,
                          fontWeight: "600",
                          fontSize: type.meta,
                        }}
                      >
                        {city}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <AppButton
                  label={busy ? "Creating…" : "Create project"}
                  onPress={() => void onCreateProject()}
                  loading={busy}
                />

                <Text style={[styles.section, { color: c.ink, marginTop: space.md }]}>
                  Projects
                </Text>
                {!projects.length ? (
                  <EmptyState
                    title="No projects yet"
                    body="Create a relocation project to start intake."
                    ctaLabel="Refresh"
                    onCta={() => void load()}
                    illustration="listings"
                  />
                ) : (
                  projects.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => void openProject(p.id)}
                      style={[
                        styles.card,
                        {
                          borderColor:
                            selected?.id === p.id ? c.orange : c.border,
                          backgroundColor: c.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: c.ink, fontWeight: "700" }}>
                        {p.title}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: type.meta }}>
                        {projectStatusLabel(p.status)} · {p.employeeName}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: type.meta }}>
                        {p.cityFrom} → {p.cityTo}
                      </Text>
                    </Pressable>
                  ))
                )}

                {selected ? (
                  <View
                    style={[
                      styles.card,
                      { borderColor: c.border, backgroundColor: c.surface },
                    ]}
                  >
                    <Text style={[styles.section, { color: c.ink }]}>
                      {selected.title}
                    </Text>
                    <View style={styles.timeline}>
                      {PROJECT_STATUS_ORDER.map((st, i) => (
                        <Text
                          key={st}
                          style={{
                            color: i <= currentIdx ? c.orange : c.muted,
                            fontSize: 11,
                            fontWeight: i === currentIdx ? "700" : "500",
                          }}
                        >
                          {projectStatusLabel(st)}
                          {i < PROJECT_STATUS_ORDER.length - 1 ? " → " : ""}
                        </Text>
                      ))}
                    </View>
                    {(selected.items?.length ?? 0) > 0 ? (
                      <Text style={{ color: c.muted, fontSize: type.meta }}>
                        {selected.items!.length} item(s) in intake
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        color: c.muted,
                        fontSize: type.meta,
                        marginTop: space.sm,
                      }}
                    >
                      Add items (one title per line)
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        styles.multiline,
                        {
                          borderColor: c.border,
                          color: c.ink,
                          backgroundColor: c.canvas,
                        },
                      ]}
                      multiline
                      placeholder={"Desk\nMonitor\nChair"}
                      placeholderTextColor={c.muted}
                      value={intakeText}
                      onChangeText={setIntakeText}
                    />
                    <AppButton
                      label={busy ? "Saving…" : "Save intake"}
                      onPress={() => void onIntake()}
                      loading={busy}
                    />
                    <AppButton
                      label={busy ? "…" : "Mark complete"}
                      variant="secondary"
                      onPress={() => void onComplete()}
                      loading={busy}
                      style={{ marginTop: space.sm }}
                    />
                    <AppButton
                      label={busy ? "…" : "Share invoice"}
                      variant="secondary"
                      onPress={() => void onInvoice()}
                      loading={busy}
                      style={{ marginTop: space.sm }}
                    />
                  </View>
                ) : null}
              </>
            ) : account ? (
              <Text style={{ color: c.muted }}>
                Waiting for ops approval before projects unlock.
              </Text>
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
  title: { fontSize: type.title, fontWeight: "700", flex: 1, paddingRight: 12 },
  toast: { paddingHorizontal: space.lg, marginBottom: 4, fontSize: type.meta },
  pad: { padding: space.lg, paddingBottom: 48, gap: space.sm },
  lede: { fontSize: type.bodySm, lineHeight: 22, marginBottom: space.md },
  section: { fontSize: type.body, fontWeight: "700", marginBottom: 4 },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 6,
    marginBottom: space.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.bodySm,
    marginBottom: 6,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timeline: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
});
