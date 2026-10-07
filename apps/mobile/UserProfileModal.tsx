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
import { ApiError } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import {
  followSeller,
  formatResponseMinutes,
  formatStars,
  getPublicProfile,
  listUserReviews,
  replyToReview,
  unfollowSeller,
  type PublicProfile,
  type ReviewDto,
} from "./lib/trust";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type PublicListing,
} from "./lib/types";

type Props = {
  userId: string | null;
  meId: string | null;
  onClose: () => void;
  dismissLabel?: string;
  onOpenListing?: (listingId: string) => void;
};

export function UserProfileModal({
  userId,
  meId,
  onClose,
  dismissLabel = "Close",
  onOpenListing,
}: Props) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const [p, revs] = await Promise.all([
        getPublicProfile(userId, token),
        listUserReviews(userId),
      ]);
      setProfile(p);
      setReviews(revs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Not found");
      setProfile(null);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
    else {
      setProfile(null);
      setReviews([]);
    }
  }, [userId, load]);

  async function toggleFollow() {
    if (!profile) return;
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to follow");
      return;
    }
    if (meId === profile.id) return;
    setFollowBusy(true);
    const next = !profile.isFollowing;
    setProfile({ ...profile, isFollowing: next });
    try {
      if (next) await followSeller(token, profile.id);
      else await unfollowSeller(token, profile.id);
      setToast(next ? "Following" : "Unfollowed");
    } catch (err) {
      setProfile({ ...profile, isFollowing: !next });
      setToast(err instanceof ApiError ? err.message : "Follow failed");
    } finally {
      setFollowBusy(false);
    }
  }

  async function submitReply(reviewId: string) {
    const token = await getAccessToken();
    if (!token) {
      setToast("Sign in to reply");
      return;
    }
    const text = (replyDrafts[reviewId] ?? "").trim();
    if (!text) {
      setToast("Write a short reply");
      return;
    }
    setReplyBusyId(reviewId);
    try {
      const updated = await replyToReview(token, reviewId, text);
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, ...updated } : r)),
      );
      setReplyDrafts((d) => ({ ...d, [reviewId]: "" }));
      setToast("Reply posted");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Reply failed");
    } finally {
      setReplyBusyId(null);
    }
  }

  const responseLine = profile
    ? formatResponseMinutes(profile.usuallyRespondsWithinMinutes)
    : null;
  const canFollow = Boolean(profile && meId !== profile.id);

  return (
    <Modal
      visible={Boolean(userId)}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
          >
            <Text style={styles.close}>{dismissLabel}</Text>
          </Pressable>
          <Text style={styles.brand}>ReWorth</Text>
          <View style={{ width: 48 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0E9F6E" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {profile ? (
              <>
                <View style={styles.heroRow}>
                  <View style={styles.avatar}>
                    {profile.avatarUrl ? (
                      <Image
                        source={{ uri: profile.avatarUrl }}
                        style={styles.avatarImg}
                      />
                    ) : (
                      <Text style={styles.avatarLetter}>
                        {(profile.displayName || "M")
                          .slice(0, 1)
                          .toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.heroText}>
                    <Text style={styles.name}>{profile.displayName}</Text>
                    <Text style={styles.muted}>
                      {formatStars(profile.avgRating, profile.reviewCount)}
                    </Text>
                    {profile.trustTier ? (
                      <Text style={styles.badge}>{profile.trustTier}</Text>
                    ) : null}
                  </View>
                </View>

                {canFollow ? (
                  <Pressable
                    style={[
                      styles.followBtn,
                      profile.isFollowing && styles.followBtnOn,
                      followBusy && styles.disabled,
                    ]}
                    disabled={followBusy}
                    onPress={() => void toggleFollow()}
                  >
                    <Text
                      style={[
                        styles.followText,
                        profile.isFollowing && styles.followTextOn,
                      ]}
                    >
                      {profile.isFollowing ? "Following" : "Follow"}
                    </Text>
                  </Pressable>
                ) : null}

                {profile.identityVerified ? (
                  <Text style={styles.verified}>Identity Verified ✓</Text>
                ) : null}
                <Text style={styles.metaLine}>
                  {profile.successfulTransactions} successful transaction
                  {profile.successfulTransactions === 1 ? "" : "s"}
                </Text>
                <Text style={styles.metaLine}>
                  Member since {profile.memberSince}
                </Text>
                {responseLine ? (
                  <Text style={styles.metaLine}>{responseLine}</Text>
                ) : null}

                <Text style={styles.section}>Active listings</Text>
                {profile.activeListings.length === 0 ? (
                  <Text style={styles.muted}>No live listings right now.</Text>
                ) : (
                  profile.activeListings.map((listing) => (
                    <ListingRow
                      key={listing.id}
                      listing={listing}
                      onPress={() => {
                        onClose();
                        onOpenListing?.(listing.id);
                      }}
                    />
                  ))
                )}

                <Text style={styles.section}>Reviews</Text>
                {reviews.length === 0 ? (
                  <Text style={styles.muted}>No published reviews yet.</Text>
                ) : (
                  reviews.map((review) => {
                    const canReply =
                      meId === review.revieweeId && !review.reply;
                    return (
                      <View key={review.id} style={styles.reviewCard}>
                        <View style={styles.reviewHead}>
                          <Text style={styles.reviewer}>
                            {review.reviewer?.displayName ?? "Member"}
                          </Text>
                          <Text style={styles.stars}>
                            {"★".repeat(review.overall)}
                            {"☆".repeat(5 - review.overall)}
                          </Text>
                        </View>
                        {review.body ? (
                          <Text style={styles.reviewBody}>{review.body}</Text>
                        ) : null}
                        {review.reply ? (
                          <View style={styles.replyBox}>
                            <Text style={styles.replyLabel}>
                              Reply from {profile.displayName}
                            </Text>
                            <Text style={styles.reviewBody}>
                              {review.reply}
                            </Text>
                          </View>
                        ) : null}
                        {canReply ? (
                          <View style={styles.replyForm}>
                            <TextInput
                              style={styles.input}
                              value={replyDrafts[review.id] ?? ""}
                              onChangeText={(t) =>
                                setReplyDrafts((d) => ({
                                  ...d,
                                  [review.id]: t,
                                }))
                              }
                              placeholder="Reply (max 200)"
                              maxLength={200}
                              multiline
                            />
                            <Pressable
                              style={[
                                styles.followBtn,
                                replyBusyId === review.id && styles.disabled,
                              ]}
                              disabled={replyBusyId === review.id}
                              onPress={() => void submitReply(review.id)}
                            >
                              <Text style={styles.followText}>
                                {replyBusyId === review.id
                                  ? "Sending…"
                                  : "Post reply"}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </>
            ) : null}

            {toast ? (
              <Pressable onPress={() => setToast(null)}>
                <Text style={styles.toast}>{toast}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function ListingRow({
  listing,
  onPress,
}: {
  listing: PublicListing;
  onPress: () => void;
}) {
  const images = [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const src = listingImageUrl(images[0]);
  return (
    <Pressable style={styles.listingRow} onPress={onPress}>
      {src ? (
        <Image source={{ uri: src }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.listingTitle} numberOfLines={2}>
          {listing.title || "Untitled"}
        </Text>
        <Text style={styles.muted}>
          {formatNgnFromKobo(listing.priceKobo)} · {listing.community}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FAF9F7" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brand: { fontSize: 20, fontWeight: "700", color: "#111315" },
  close: { fontSize: 16, fontWeight: "600", color: "#0E9F6E" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  error: { color: "#DC2626", marginBottom: 12 },
  heroRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 64, height: 64 },
  avatarLetter: { fontSize: 24, fontWeight: "700", color: "#0E9F6E" },
  heroText: { flex: 1 },
  name: { fontSize: 26, fontWeight: "700", color: "#111315" },
  muted: { marginTop: 4, fontSize: 14, color: "#5C636A" },
  badge: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#F5EDD0",
    color: "#111315",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
  },
  followBtn: {
    marginTop: 16,
    backgroundColor: "#0E9F6E",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  followBtnOn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2DC",
  },
  followText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  followTextOn: { color: "#111315" },
  disabled: { opacity: 0.55 },
  verified: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: "600",
    color: "#0E9F6E",
  },
  metaLine: { marginTop: 6, fontSize: 15, color: "#111315" },
  section: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 17,
    fontWeight: "700",
    color: "#111315",
  },
  listingRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E2DC",
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#E5E2DC",
  },
  thumbEmpty: {},
  listingTitle: { fontSize: 15, fontWeight: "600", color: "#111315" },
  reviewCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
  },
  reviewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  reviewer: { fontWeight: "700", color: "#111315", flex: 1 },
  stars: { color: "#C9A227", fontSize: 14 },
  reviewBody: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#5C636A" },
  replyBox: {
    marginTop: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#0E9F6E",
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5C636A",
    textTransform: "uppercase",
  },
  replyForm: { marginTop: 10, gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    padding: 12,
    minHeight: 64,
    textAlignVertical: "top",
    backgroundColor: "#FAF9F7",
    color: "#111315",
  },
  toast: {
    marginTop: 16,
    textAlign: "center",
    color: "#0E9F6E",
    fontWeight: "600",
  },
});
