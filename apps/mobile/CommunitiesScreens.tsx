import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { ListingCard } from "./components/ListingCard";
import { ApiError } from "./lib/api";
import { ensureAccessToken } from "./lib/auth";
import { brandAssets } from "./lib/brandAssets";
import {
  getEstateCommunity,
  listCommunityListings,
  listEstateCommunities,
  listMyCommunities,
  redeemCommunityInvite,
  requestJoinCommunity,
  type EstateCommunity,
  type EstateCommunityDetail,
} from "./lib/estate-communities";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type PublicListing,
} from "./lib/types";
import { hapticLight } from "./theme/haptics";
import { useColors } from "./theme/ThemeProvider";
import { radius, space, type } from "./theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  initialSlugOrId?: string | null;
  onOpenListing?: (id: string) => void;
  onNeedAuth?: () => void;
};

function communityIcon(communityType: string) {
  switch (communityType) {
    case "CHURCH":
      return brandAssets.communityChurch;
    case "ALUMNI":
      return brandAssets.communityAlumni;
    case "CORPORATE":
      return brandAssets.communityCorporate;
    case "PUBLIC":
      return brandAssets.communityNeighbourhood;
    case "ESTATE":
    default:
      return brandAssets.communityNeighbourhood;
  }
}

export function CommunitiesModal({
  visible,
  onClose,
  initialSlugOrId,
  onOpenListing,
  onNeedAuth,
}: Props) {
  const c = useColors();
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [items, setItems] = useState<EstateCommunity[]>([]);
  const [mine, setMine] = useState<
    Array<{ membershipId: string; status: string; community: EstateCommunity }>
  >([]);
  const [detail, setDetail] = useState<EstateCommunityDetail | null>(null);
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const res = await listEstateCommunities(token);
      setItems(res.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load communities",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        setMine([]);
        onNeedAuth?.();
        return;
      }
      const res = await listMyCommunities(token);
      setMine(res.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load memberships",
      );
    } finally {
      setLoading(false);
    }
  }, [onNeedAuth]);

  const openDetail = useCallback(
    async (slugOrId: string) => {
      setBusy(true);
      setError(null);
      try {
        const token = await ensureAccessToken();
        const d = await getEstateCommunity(slugOrId, token);
        setDetail(d);
        const list = await listCommunityListings(d.id, token);
        setListings(list.items ?? []);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not open community",
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!visible) return;
    setDetail(null);
    setToast(null);
    if (initialSlugOrId) {
      void openDetail(initialSlugOrId);
      return;
    }
    if (tab === "mine") void loadMine();
    else void loadBrowse();
  }, [visible, tab, initialSlugOrId, loadBrowse, loadMine, openDetail]);

  async function onJoin() {
    if (!detail) return;
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestJoinCommunity(token, detail.id);
      setToast("Join request sent");
      await openDetail(detail.slug || detail.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRedeem() {
    const token = await ensureAccessToken();
    if (!token) {
      onNeedAuth?.();
      return;
    }
    const code = inviteCode.trim();
    if (!code) {
      setError("Enter an invite code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await redeemCommunityInvite(token, code);
      setInviteCode("");
      setToast("Invite redeemed");
      setTab("mine");
      await loadMine();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Redeem failed");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safe, { backgroundColor: c.canvas }]}>
        <View style={styles.header}>
          {detail ? (
            <Pressable
              onPress={() => {
                void hapticLight();
                setDetail(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={[styles.link, { color: c.orange }]}>Back</Text>
            </Pressable>
          ) : (
            <Text style={[styles.title, { color: c.ink }]}>Communities</Text>
          )}
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={[styles.link, { color: c.muted }]}>Close</Text>
          </Pressable>
        </View>

        {toast ? (
          <Text style={[styles.toast, { color: c.navy }]}>{toast}</Text>
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: c.error }]}>{error}</Text>
        ) : null}

        {detail ? (
          <ScrollView contentContainerStyle={styles.pad}>
            <Image
              source={communityIcon(detail.type)}
              style={styles.heroIcon}
              resizeMode="contain"
            />
            <Text style={[styles.detailTitle, { color: c.ink }]}>
              {detail.name}
            </Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {detail.type.replace(/_/g, " ")} · {detail.privacy.replace(/_/g, " ")}
              {detail.verified ? " · Verified" : ""}
            </Text>
            {detail.about ? (
              <Text style={[styles.about, { color: c.ink }]}>{detail.about}</Text>
            ) : null}
            <Text style={[styles.meta, { color: c.muted }]}>
              {detail.isMember
                ? `Member · ${detail.membershipStatus ?? "ACTIVE"}`
                : "Not a member yet"}
            </Text>
            {!detail.isMember ? (
              <AppButton
                label={busy ? "Sending…" : "Request to join"}
                onPress={() => void onJoin()}
                loading={busy}
                style={styles.action}
              />
            ) : null}

            <Text style={[styles.section, { color: c.ink }]}>Listings</Text>
            {listings.length === 0 ? (
              <Text style={[styles.meta, { color: c.muted }]}>
                No community listings yet.
              </Text>
            ) : (
              listings.map((item) => (
                <ListingCard
                  key={item.id}
                  title={item.title || "Untitled"}
                  priceLabel={
                    item.sellingMode === "GIVE_AWAY"
                      ? "Free"
                      : formatNgnFromKobo(item.priceKobo)
                  }
                  community={item.community || undefined}
                  imageUri={listingImageUrl(item.images?.[0]) ?? undefined}
                  verified={Boolean(item.seller?.verificationBadge)}
                  onPress={() => onOpenListing?.(item.id)}
                  style={styles.listingCard}
                />
              ))
            )}
          </ScrollView>
        ) : (
          <>
            <View style={styles.tabs}>
              {(
                [
                  ["browse", "Browse"],
                  ["mine", "Mine"],
                ] as const
              ).map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => {
                    void hapticLight();
                    setTab(id);
                  }}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: tab === id ? c.beige : c.surface,
                      borderColor: c.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab === id }}
                >
                  <Text style={{ color: c.ink, fontWeight: "600" }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.inviteRow, { borderColor: c.border }]}>
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Invite code"
                placeholderTextColor={c.muted}
                autoCapitalize="characters"
                style={[
                  styles.inviteInput,
                  { color: c.ink, borderColor: c.border, backgroundColor: c.surface },
                ]}
                accessibilityLabel="Community invite code"
              />
              <AppButton
                label="Redeem"
                onPress={() => void onRedeem()}
                loading={busy}
                variant="secondary"
                style={styles.redeemBtn}
              />
            </View>

            {loading ? (
              <ActivityIndicator color={c.orange} style={{ marginTop: 24 }} />
            ) : tab === "browse" && items.length === 0 ? (
              <EmptyState
                title="No communities yet"
                body="Estate and alumni groups will appear here."
                ctaLabel="Refresh"
                onCta={() => void loadBrowse()}
                illustration="listings"
              />
            ) : tab === "mine" && mine.length === 0 ? (
              <EmptyState
                title="You’re not in a community"
                body="Browse public groups or redeem an invite code."
                ctaLabel="Browse"
                onCta={() => setTab("browse")}
                illustration="listings"
              />
            ) : (
              <ScrollView contentContainerStyle={styles.pad}>
                {(tab === "browse"
                  ? items
                  : mine.map((m) => m.community)
                ).map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      void hapticLight();
                      void openDetail(item.slug || item.id);
                    }}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: pressed ? c.surfaceWarm : c.surface,
                        borderColor: c.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                  >
                    <Image
                      source={communityIcon(item.type)}
                      style={styles.cardIcon}
                      resizeMode="contain"
                    />
                    <View style={styles.cardCopy}>
                      <Text style={[styles.cardTitle, { color: c.ink }]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.meta, { color: c.muted }]} numberOfLines={2}>
                        {item.about || `${item.type} · ${item.privacy}`}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  title: { fontSize: type.title, fontWeight: "700" },
  link: { fontSize: type.bodySm, fontWeight: "600" },
  toast: { paddingHorizontal: space.lg, marginBottom: 4, fontSize: type.meta },
  error: { paddingHorizontal: space.lg, marginBottom: 4, fontSize: type.meta },
  tabs: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  inviteRow: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
    alignItems: "center",
  },
  inviteInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.bodySm,
  },
  redeemBtn: { minWidth: 96 },
  pad: { padding: space.lg, paddingBottom: 48, gap: space.sm },
  card: {
    flexDirection: "row",
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    alignItems: "center",
  },
  cardIcon: { width: 48, height: 48 },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: type.body, fontWeight: "700", marginBottom: 2 },
  meta: { fontSize: type.meta },
  heroIcon: { width: 72, height: 72, alignSelf: "center", marginBottom: space.sm },
  detailTitle: { fontSize: type.title, fontWeight: "700", textAlign: "center" },
  about: { fontSize: type.bodySm, marginVertical: space.sm, lineHeight: 22 },
  section: { fontSize: type.titleSm, fontWeight: "700", marginTop: space.lg, marginBottom: space.sm },
  action: { marginTop: space.md },
  listingCard: { marginBottom: space.sm },
});
