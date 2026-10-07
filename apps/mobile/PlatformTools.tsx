import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ListingCard } from "./components/ListingCard";
import { ApiError } from "./lib/api";
import { ensureAccessToken, getAccessToken } from "./lib/auth";
import {
  ASK_SUGGESTIONS,
  bundleShareUrl,
  cardsFromAssistantTurn,
  createAssistantBundle,
  createAssistantSession,
  getBundleByToken,
  hitToListingStub,
  saveAssistantBundle,
  sendAssistantMessage,
  type AssistantTurnCard,
  type SavedBundle,
} from "./lib/assistant";
import { completeMedia, createListing, presignMedia } from "./lib/listings";
import {
  bookManagedPickup,
  consignmentStatusLabel,
  createConsignment,
  createValuation,
  generateWatPickupSlots,
  listConsignmentOnPlatform,
  listMyConsignments,
  listMyManagedPickups,
  markConsignmentSold,
  pickupStatusLabel,
  returnConsignment,
  type Consignment,
  type ManagedPickup,
  type ManagedPickupSlot,
  type ValuationCard,
} from "./lib/platform-services";
import {
  createRoomScan,
  createRoomScanDrafts,
  patchRoomScanItems,
  pollRoomScanUntilReady,
  startRoomScanDetect,
  type RoomScan,
} from "./lib/room-scan";
import { formatNgnFromKobo } from "./lib/types";
import { hapticLight } from "./theme/haptics";
import { colors } from "./theme/tokens";

export type PlatformTool =
  | "ask"
  | "worth"
  | "scan"
  | "consign"
  | "pickup"
  | null;

type Props = {
  tool: PlatformTool;
  city?: string;
  onClose: () => void;
  onOpenListing?: (id: string) => void;
};

const TOOL_TITLES: Record<Exclude<PlatformTool, null>, string> = {
  ask: "Ask ReWorth",
  worth: "What's it worth",
  scan: "Room scan",
  consign: "Consign",
  pickup: "Managed pickup",
};

export function PlatformToolsModal({
  tool,
  city = "Lagos",
  onClose,
  onOpenListing,
}: Props) {
  if (!tool) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{TOOL_TITLES[tool]}</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        {tool === "ask" ? (
          <AskPanel city={city} onOpenListing={onOpenListing} />
        ) : null}
        {tool === "worth" ? <WorthPanel city={city} /> : null}
        {tool === "scan" ? (
          <ScanPanel city={city} onOpenListing={onOpenListing} />
        ) : null}
        {tool === "consign" ? <ConsignPanel city={city} /> : null}
        {tool === "pickup" ? <PickupPanel city={city} /> : null}
      </View>
    </Modal>
  );
}

type ChatRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: AssistantTurnCard[];
};

function AskPanel({
  city,
  onOpenListing,
}: {
  city: string;
  onOpenListing?: (id: string) => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const token = await ensureAccessToken();
    if (!token) throw new Error("Sign in to ask ReWorth");
    const s = await createAssistantSession(token, { city });
    setSessionId(s.id);
    return s.id;
  }, [city, sessionId]);

  async function send(text?: string, confirmToken?: string) {
    const userText = (text ?? input).trim();
    if (!userText && !confirmToken) return;
    setBusy(true);
    setError(null);
    if (!confirmToken && userText) {
      setMessages((m) => [
        ...m,
        { id: `u-${Date.now()}`, role: "user", content: userText },
      ]);
      setInput("");
    }
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in to ask ReWorth");
      const id = await ensureSession();
      const res = await sendAssistantMessage(
        token,
        id,
        confirmToken ? "Confirm" : userText,
        confirmToken,
      );
      const cards = cardsFromAssistantTurn(res);
      setMessages((m) => [
        ...m,
        {
          id: res.message?.id ?? `a-${Date.now()}`,
          role: "assistant",
          content:
            res.message?.content ??
            res.proposal?.summary ??
            (res.confirmed ? "Confirmed." : "Done."),
          cards,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed",
      );
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function onConfirm(token: string) {
    setConfirming(token);
    await send("Confirm", token);
  }

  return (
    <View style={styles.body}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.pad}>
        <Text style={styles.hint}>
          Budget / bundle questions grounded in live listings · {city}
        </Text>
        {messages.length === 0 ? (
          <View style={styles.suggestRow}>
            {ASK_SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                style={styles.suggestChip}
                onPress={() => {
                  void hapticLight();
                  void send(s);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.suggestText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {messages.map((m) => (
          <View key={m.id} style={styles.msgBlock}>
            <View
              style={[
                styles.bubble,
                m.role === "user" ? styles.userBubble : styles.botBubble,
              ]}
            >
              <Text style={styles.bubbleText}>{m.content}</Text>
            </View>
            {(m.cards ?? []).map((card, idx) => (
              <AssistantCardView
                key={`${m.id}-${idx}`}
                card={card}
                city={city}
                confirming={confirming}
                busy={busy}
                onConfirm={onConfirm}
                onOpenListing={onOpenListing}
              />
            ))}
          </View>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about budget, bundles, price…"
          editable={!busy}
          multiline
        />
        <Pressable
          style={[styles.primaryBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void send()}
        >
          <Text style={styles.primaryBtnText}>{busy ? "…" : "Send"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AssistantCardView({
  card,
  city,
  confirming,
  busy,
  onConfirm,
  onOpenListing,
}: {
  card: AssistantTurnCard;
  city: string;
  confirming: string | null;
  busy: boolean;
  onConfirm: (token: string) => void;
  onOpenListing?: (id: string) => void;
}) {
  const [shareToken, setShareToken] = useState(
    card.type === "bundle" ? card.shareToken ?? null : null,
  );
  const [savingBundle, setSavingBundle] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  async function saveAndShareBundle() {
    if (card.type !== "bundle") return;
    setSavingBundle(true);
    setBundleError(null);
    void hapticLight();
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in to save a bundle");
      const saved = await createAssistantBundle(token, {
        brief: card.brief.slice(0, 500),
        budgetKobo: card.budgetKobo,
        city,
      });
      setShareToken(saved.shareToken);
      const url = bundleShareUrl(saved.shareToken);
      await Share.share({
        message: `${saved.brief}\nCombined ${formatNgnFromKobo(saved.totalKobo)} · ${url}`,
        title: "ReWorth budget bundle",
        url,
      });
    } catch (err) {
      setBundleError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Could not save bundle",
      );
    } finally {
      setSavingBundle(false);
    }
  }

  async function shareExisting() {
    if (!shareToken) return;
    const url = bundleShareUrl(shareToken);
    const brief = card.type === "bundle" ? card.brief : "Budget bundle";
    await Share.share({
      message: `${brief}\n${url}`,
      title: "ReWorth budget bundle",
      url,
    });
  }

  if (card.type === "mutation_pending") {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Needs confirmation</Text>
        <Text style={styles.meta}>{card.summary}</Text>
        <Text style={styles.meta}>Tool: {card.toolName}</Text>
        <Pressable
          style={[
            styles.primaryBtn,
            (busy || confirming === card.confirmToken) && styles.disabled,
          ]}
          disabled={busy}
          onPress={() => onConfirm(card.confirmToken)}
        >
          <Text style={styles.primaryBtnText}>
            {confirming === card.confirmToken ? "Confirming…" : "Confirm"}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (card.type === "search" || card.type === "bundle") {
    return (
      <View style={styles.card}>
        {card.type === "bundle" ? (
          <>
            <Text style={styles.cardTitle}>{card.brief}</Text>
            <Text style={styles.meta}>
              Combined {formatNgnFromKobo(card.totalKobo)} · budget{" "}
              {formatNgnFromKobo(card.budgetKobo)}
            </Text>
          </>
        ) : (
          <Text style={styles.cardTitle}>Matching listings</Text>
        )}
        {card.listings.length === 0 ? (
          <Text style={styles.meta}>No listings in this result.</Text>
        ) : (
          card.listings.slice(0, 6).map((hit) => {
            const stub = hitToListingStub(hit);
            return (
              <ListingCard
                key={hit.id}
                title={stub.title}
                priceLabel={formatNgnFromKobo(stub.priceKobo)}
                onPress={() => onOpenListing?.(hit.id)}
                style={{ marginTop: 8 }}
              />
            );
          })
        )}
        {card.type === "bundle" ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            {shareToken ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => void shareExisting()}
                accessibilityRole="button"
                accessibilityLabel="Share bundle link"
              >
                <Text style={styles.secondaryBtnText}>Share link</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.primaryBtn,
                  (savingBundle || busy) && styles.disabled,
                ]}
                disabled={savingBundle || busy}
                onPress={() => void saveAndShareBundle()}
                accessibilityRole="button"
                accessibilityLabel="Save and share bundle"
              >
                <Text style={styles.primaryBtnText}>
                  {savingBundle ? "Saving…" : "Save & share bundle"}
                </Text>
              </Pressable>
            )}
            {bundleError ? (
              <Text style={styles.error}>{bundleError}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }
  if (card.type === "valuation") {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Valuation guidance</Text>
        <Text style={styles.price}>
          {formatNgnFromKobo(card.recommendedKobo)}
        </Text>
        {card.lowKobo != null && card.highKobo != null ? (
          <Text style={styles.meta}>
            Range {formatNgnFromKobo(card.lowKobo)} –{" "}
            {formatNgnFromKobo(card.highKobo)}
          </Text>
        ) : null}
      </View>
    );
  }
  return null;
}

export function SharedBundleModal({
  shareToken,
  onClose,
  onOpenListing,
  onNeedAuth,
}: {
  shareToken: string | null;
  onClose: () => void;
  onOpenListing?: (id: string) => void;
  onNeedAuth?: () => void;
}) {
  const [bundle, setBundle] = useState<SavedBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shareToken) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const data = await getBundleByToken(shareToken, token);
      setBundle(data);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Bundle not found",
      );
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!shareToken) return null;

  async function onSaveCopy() {
    if (!bundle) return;
    setSaving(true);
    setToast(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        onNeedAuth?.();
        return;
      }
      await saveAssistantBundle(token, bundle.id);
      setToast("Saved to your bundles");
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onShare() {
    if (!bundle?.shareToken) return;
    const url = bundleShareUrl(bundle.shareToken);
    await Share.share({
      message: `${bundle.brief}\n${url}`,
      title: "ReWorth budget bundle",
      url,
    });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Shared bundle</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.pad}>
          {loading ? (
            <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
          ) : error || !bundle ? (
            <View>
              <Text style={styles.error}>{error ?? "Bundle unavailable"}</Text>
              <Pressable style={styles.secondaryBtn} onPress={() => void load()}>
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.cardTitle}>{bundle.brief}</Text>
              <Text style={styles.meta}>
                Combined {formatNgnFromKobo(bundle.totalKobo)} · budget{" "}
                {formatNgnFromKobo(bundle.budgetKobo)}
                {bundle.city ? ` · ${bundle.city}` : ""}
              </Text>
              {(bundle.listings ?? []).length === 0 ? (
                <Text style={styles.meta}>
                  {bundle.listingIds.length} listing
                  {bundle.listingIds.length === 1 ? "" : "s"} in this bundle.
                </Text>
              ) : (
                (bundle.listings ?? []).map((hit) => (
                  <ListingCard
                    key={hit.id}
                    title={hit.title || "Listing"}
                    priceLabel={formatNgnFromKobo(hit.priceKobo)}
                    community={hit.city || undefined}
                    onPress={() => onOpenListing?.(hit.id)}
                    style={{ marginTop: 10 }}
                  />
                ))
              )}
              {toast ? <Text style={[styles.meta, { color: colors.orange }]}>{toast}</Text> : null}
              <Pressable
                style={[styles.primaryBtn, saving && styles.disabled]}
                disabled={saving}
                onPress={() => void onSaveCopy()}
              >
                <Text style={styles.primaryBtnText}>
                  {saving ? "Saving…" : "Save to my bundles"}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => void onShare()}>
                <Text style={styles.secondaryBtnText}>Share link</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function WorthPanel({ city }: { city: string }) {
  const [photo, setPhoto] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [card, setCard] = useState<ValuationCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uriToBase64(uri: string): Promise<string | undefined> {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result !== "string") {
            resolve(undefined);
            return;
          }
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  async function pickPhoto() {
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ImagePicker = require("expo-image-picker") as {
        requestMediaLibraryPermissionsAsync: () => Promise<{ status: string }>;
        launchImageLibraryAsync: (opts: object) => Promise<{
          canceled: boolean;
          assets?: Array<{
            uri: string;
            fileName?: string | null;
            mimeType?: string | null;
          }>;
        }>;
      };
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setError("Photo library permission needed");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      setPhoto({
        uri: a.uri,
        name: a.fileName ?? "worth.jpg",
        type: a.mimeType ?? "image/jpeg",
      });
      setCard(null);
    } catch {
      setError("Could not open gallery");
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in for a photo estimate");
      let photoKey: string | undefined;
      if (photo) {
        const draft = await createListing(token, {});
        const inline = await uriToBase64(photo.uri);
        const len = inline ? Math.ceil((inline.length * 3) / 4) : 4096;
        const presign = await presignMedia(
          token,
          draft.id,
          photo.name,
          photo.type,
          Math.max(len, 64),
        );
        await completeMedia(token, draft.id, presign.key, 0, {
          inlineBase64: inline,
          contentType: photo.type,
        });
        photoKey = presign.key;
      }
      const result = await createValuation(token, { city, photoKey });
      setCard(result);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Valuation failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function shareCard() {
    if (!card) return;
    const msg = `ReWorth estimate (${city}): ${formatNgnFromKobo(card.recommendedKobo)} (range ${formatNgnFromKobo(card.estimatedLowKobo)}–${formatNgnFromKobo(card.estimatedHighKobo)}). Guidance only — not a binding offer.`;
    await Share.share({ message: msg, title: "What's it worth" });
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.hint}>
        Add a photo for a stronger Lagos estimate. Guidance only — not a binding
        offer. City: {city}
      </Text>
      <Pressable style={styles.secondaryBtn} onPress={() => void pickPhoto()}>
        <Text style={styles.secondaryBtnText}>
          {photo ? "Change photo" : "Add photo"}
        </Text>
      </Pressable>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={styles.worthPreview}
          resizeMode="cover"
          accessibilityLabel="Item photo"
        />
      ) : null}
      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void run()}
      >
        <Text style={styles.primaryBtnText}>
          {busy ? "Estimating…" : "Get estimate"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {card ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recommended</Text>
          <Text style={styles.price}>
            {formatNgnFromKobo(card.recommendedKobo)}
          </Text>
          <Text style={styles.meta}>
            Range {formatNgnFromKobo(card.estimatedLowKobo)} –{" "}
            {formatNgnFromKobo(card.estimatedHighKobo)}
          </Text>
          <Text style={styles.meta}>
            Quick sale {formatNgnFromKobo(card.quickSaleKobo)} · Max{" "}
            {formatNgnFromKobo(card.maxValueKobo)}
          </Text>
          {card.confidenceLabel ? (
            <Text style={styles.meta}>Confidence: {card.confidenceLabel}</Text>
          ) : null}
          <Pressable style={styles.secondaryBtn} onPress={() => void shareCard()}>
            <Text style={styles.secondaryBtnText}>Share estimate</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function ScanPanel({
  city,
  onOpenListing,
}: {
  city: string;
  onOpenListing?: (id: string) => void;
}) {
  const [photos, setPhotos] = useState<
    Array<{ uri: string; name: string; type: string }>
  >([]);
  const [scan, setScan] = useState<RoomScan | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<
    "idle" | "upload" | "detect" | "ready" | "drafts"
  >("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickRoomPhotos() {
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ImagePicker = require("expo-image-picker") as {
        requestMediaLibraryPermissionsAsync: () => Promise<{ status: string }>;
        launchImageLibraryAsync: (opts: object) => Promise<{
          canceled: boolean;
          assets?: Array<{
            uri: string;
            fileName?: string | null;
            mimeType?: string | null;
          }>;
        }>;
      };
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setError("Photo library permission needed");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 6,
      });
      if (result.canceled || !result.assets?.length) return;
      setPhotos(
        result.assets.slice(0, 6).map((a, i) => ({
          uri: a.uri,
          name: a.fileName ?? `room-${i}.jpg`,
          type: a.mimeType ?? "image/jpeg",
        })),
      );
      setScan(null);
      setDraftIds([]);
      setPhase("idle");
    } catch {
      setError("Could not open gallery");
    }
  }

  async function uriToBase64(uri: string): Promise<string | undefined> {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result !== "string") {
            resolve(undefined);
            return;
          }
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  async function runDetect() {
    setBusy(true);
    setError(null);
    setDraftIds([]);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in to room-scan");

      let photoKeys: string[] = [];
      if (photos.length) {
        setPhase("upload");
        const draftListing = await (
          await import("./lib/listings")
        ).createListing(token, {});
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const inline = await uriToBase64(photo.uri);
          const len = inline ? Math.ceil((inline.length * 3) / 4) : 4096;
          const presign = await presignMedia(
            token,
            draftListing.id,
            photo.name,
            photo.type,
            Math.max(len, 64),
          );
          await completeMedia(token, draftListing.id, presign.key, i, {
            inlineBase64: inline,
            contentType: photo.type,
          });
          photoKeys.push(presign.key);
        }
      } else {
        photoKeys = ["room-scan/fixture-living-1.jpg"];
      }

      setPhase("detect");
      const created = await createRoomScan(token, { photoKeys, city });
      await startRoomScanDetect(token, created.id);
      const ready = await pollRoomScanUntilReady(token, created.id);
      setScan(ready);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(itemId: string, selected: boolean) {
    if (!scan) return;
    const token = await ensureAccessToken();
    if (!token) return;
    try {
      const updated = await patchRoomScanItems(token, scan.id, [
        { id: itemId, selected: !selected },
      ]);
      setScan(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update item");
    }
  }

  async function createDrafts() {
    if (!scan) return;
    setBusy(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in to room-scan");
      setPhase("drafts");
      const drafts = await createRoomScanDrafts(token, scan.id);
      setScan(drafts.roomScan);
      setDraftIds(drafts.drafts.map((d) => d.listingId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drafts failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.hint}>
        Photograph a room → detect saleable items → pick what to draft. City:{" "}
        {city}
      </Text>
      <Pressable style={styles.secondaryBtn} onPress={() => void pickRoomPhotos()}>
        <Text style={styles.secondaryBtnText}>
          {photos.length
            ? `${photos.length} photo(s) selected · change`
            : "Add room photos"}
        </Text>
      </Pressable>
      {photos.length ? (
        <ScrollView horizontal style={{ marginVertical: 8 }}>
          {photos.map((p) => (
            <Image
              key={p.uri}
              source={{ uri: p.uri }}
              style={styles.thumb}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.meta}>
          Or run with fixture photos if gallery is empty.
        </Text>
      )}
      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void runDetect()}
      >
        <Text style={styles.primaryBtnText}>
          {busy
            ? phase === "upload"
              ? "Uploading…"
              : phase === "detect"
                ? "Detecting…"
                : "Working…"
            : photos.length
              ? "Scan photos"
              : "Run demo scan"}
        </Text>
      </Pressable>
      {busy ? (
        <ActivityIndicator color={colors.orange} style={{ marginTop: 16 }} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {scan ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status: {scan.status}</Text>
          <Text style={styles.meta}>
            Tap items to include / skip before drafting.
          </Text>
          {(scan.items ?? []).map((it) => {
            const on = it.selected !== false;
            return (
              <Pressable
                key={it.id}
                onPress={() => void toggleItem(it.id, on)}
                style={[styles.itemRow, !on && styles.itemRowOff]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={styles.meta}>
                  {on ? "✓ " : "○ "}
                  {it.label}
                  {it.condition ? ` · ${it.condition}` : ""}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.primaryBtn, busy && styles.disabled]}
            disabled={busy || !(scan.items ?? []).some((i) => i.selected !== false)}
            onPress={() => void createDrafts()}
          >
            <Text style={styles.primaryBtnText}>
              {busy && phase === "drafts" ? "Creating drafts…" : "Create drafts"}
            </Text>
          </Pressable>
          {draftIds.map((id) => (
            <Pressable key={id} onPress={() => onOpenListing?.(id)}>
              <Text style={styles.link}>Open draft {id.slice(0, 8)}…</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ConsignPanel({ city }: { city: string }) {
  const [items, setItems] = useState<Consignment[]>([]);
  const [title, setTitle] = useState("");
  const [asking, setAsking] = useState("");
  const [floor, setFloor] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const list = await listMyConsignments(token);
    setItems(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in to consign");
      const askingPriceKobo = Math.round(Number(asking || 0) * 100);
      const floorPriceKobo = Math.round(Number(floor || 0) * 100);
      await createConsignment(token, {
        title: title.trim() || "Consignment item",
        askingPriceKobo,
        floorPriceKobo,
        city,
      });
      setTitle("");
      setAsking("");
      setFloor("");
      await load();
      setToast("Consignment created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onList(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in");
      await listConsignmentOnPlatform(token, id);
      await load();
      setToast("Listed on ReWorth");
    } catch (err) {
      setError(err instanceof Error ? err.message : "List failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onReturn(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in");
      await returnConsignment(token, id);
      await load();
      setToast("Return requested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onSold(id: string, askingPriceKobo: number) {
    setBusyId(id);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in");
      await markConsignmentSold(token, id, askingPriceKobo);
      await load();
      setToast("Marked sold");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sold update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.hint}>
        Hand inventory to ReWorth/partner ops. List when ready, or return. City:{" "}
        {city}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Item title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Asking price (₦)"
        keyboardType="numeric"
        value={asking}
        onChangeText={setAsking}
      />
      <TextInput
        style={styles.input}
        placeholder="Floor price (₦)"
        keyboardType="numeric"
        value={floor}
        onChangeText={setFloor}
      />
      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void submit()}
      >
        <Text style={styles.primaryBtnText}>
          {busy ? "Submitting…" : "Create consignment"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {toast ? <Text style={[styles.meta, { color: colors.orange }]}>{toast}</Text> : null}
      {items.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.cardTitle}>{c.title}</Text>
          <Text style={styles.meta}>
            {consignmentStatusLabel(c.status)} · ask{" "}
            {formatNgnFromKobo(c.askingPriceKobo)} · floor{" "}
            {formatNgnFromKobo(c.floorPriceKobo)}
          </Text>
          {c.netPayoutKobo != null ? (
            <Text style={[styles.meta, { color: colors.orange, fontWeight: "700" }]}>
              Net {formatNgnFromKobo(c.netPayoutKobo)}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {c.status === "INTAKE" ? (
              <Pressable
                style={[styles.miniBtn, busyId === c.id && styles.disabled]}
                disabled={busyId === c.id}
                onPress={() => void onList(c.id)}
              >
                <Text style={styles.miniBtnText}>List on ReWorth</Text>
              </Pressable>
            ) : null}
            {c.status === "LISTED" ? (
              <Pressable
                style={[styles.miniBtn, busyId === c.id && styles.disabled]}
                disabled={busyId === c.id}
                onPress={() => void onSold(c.id, c.askingPriceKobo)}
              >
                <Text style={styles.miniBtnText}>Mark sold</Text>
              </Pressable>
            ) : null}
            {c.status === "INTAKE" || c.status === "LISTED" ? (
              <Pressable
                style={[styles.miniBtnGhost, busyId === c.id && styles.disabled]}
                disabled={busyId === c.id}
                onPress={() => void onReturn(c.id)}
              >
                <Text style={styles.miniBtnGhostText}>Return</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function PickupPanel({ city }: { city: string }) {
  const [slots, setSlots] = useState<ManagedPickupSlot[]>([]);
  const [pickups, setPickups] = useState<ManagedPickup[]>([]);
  const [address, setAddress] = useState("");
  const [selected, setSelected] = useState<ManagedPickupSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const list = await listMyManagedPickups(token);
      setPickups(Array.isArray(list) ? list : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setSlots(generateWatPickupSlots(6));
    void reload();
  }, [reload]);

  async function book() {
    if (!selected || !address.trim()) {
      setError("Pick a slot and enter an address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Sign in to book pickup");
      await bookManagedPickup(token, {
        slotStartAt: selected.slotStartAt,
        slotEndAt: selected.slotEndAt,
        addressLine: address.trim(),
        city,
      });
      setToast("Pickup booked");
      setAddress("");
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.hint}>
        Book a Lagos WAT window for managed pickup · {city}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Pickup address"
        value={address}
        onChangeText={setAddress}
      />
      {slots.map((s) => (
        <Pressable
          key={s.slotStartAt}
          style={[
            styles.slot,
            selected?.slotStartAt === s.slotStartAt && styles.slotActive,
          ]}
          onPress={() => setSelected(s)}
        >
          <Text style={styles.meta}>{s.label}</Text>
        </Pressable>
      ))}
      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void book()}
      >
        <Text style={styles.primaryBtnText}>
          {busy ? "Booking…" : "Book pickup"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {toast ? <Text style={[styles.meta, { color: colors.orange }]}>{toast}</Text> : null}
      <Text style={[styles.cardTitle, { marginTop: 8 }]}>Your pickups</Text>
      {!pickups.length ? (
        <Text style={styles.meta}>No bookings yet.</Text>
      ) : (
        pickups.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {pickupStatusLabel(p.status)}
            </Text>
            <Text style={styles.meta}>{p.addressLine}</Text>
            <Text style={styles.meta}>
              {new Date(p.slotStartAt).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" – "}
              {new Date(p.slotEndAt).toLocaleTimeString("en-NG", {
                timeZone: "Africa/Lagos",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
  close: { color: colors.orange, fontWeight: "600", fontSize: 16 },
  body: { flex: 1 },
  flex: { flex: 1 },
  pad: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  worthPreview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: colors.beige,
  },
  miniBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 13 },
  miniBtnGhost: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBtnGhostText: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  primaryBtn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontWeight: "700", fontSize: 16, color: colors.ink },
  price: { fontSize: 24, fontWeight: "700", color: colors.orange },
  meta: { color: colors.muted, fontSize: 14 },
  link: { color: colors.orange, fontWeight: "600", marginTop: 4 },
  msgBlock: { gap: 8 },
  suggestRow: { gap: 8 },
  suggestChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: colors.beige,
  },
  itemRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.orange,
    backgroundColor: colors.orangeWash,
    marginTop: 6,
  },
  itemRowOff: {
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    opacity: 0.75,
  },
  bubble: { borderRadius: 12, padding: 12, maxWidth: "92%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.orangeWash },
  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.beige,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  composer: {
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  slot: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotActive: { borderColor: colors.orange, backgroundColor: colors.orangeWash },
});
