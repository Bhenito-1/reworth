/**
 * Consumer onboarding — email register/login + profile customise.
 */

import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ApiError, apiFetch } from "./lib/api";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "./lib/areas";
import { setTokens } from "./lib/auth";
import { getRegion, listRegions, type RegionCity } from "./lib/region";
import { type MeResponse } from "./lib/types";
import { colors, radius, space, tap, type as typeScale } from "./theme/tokens";

type Step = "welcome" | "email" | "profile";

type Props = {
  /** `register` = new-user onboarding; `login` = returning users only. */
  intent?: "register" | "login";
  onBack?: () => void;
  onComplete: (me: MeResponse) => void;
};

export function OnboardingFlow({
  intent = "register",
  onBack,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>(
    intent === "login" ? "email" : "welcome",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [regions, setRegions] = useState<RegionCity[]>([...FALLBACK_STATES]);
  const [stateKey, setStateKey] = useState("");
  const [areaOptions, setAreaOptions] = useState<AreaChoice[]>([]);
  const [community, setCommunity] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcomeSlide, setWelcomeSlide] = useState(0);

  useEffect(() => {
    setError(null);
  }, [step]);

  useEffect(() => {
    void listRegions()
      .then((items) => {
        if (items.length > 0) setRegions(items);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!stateKey) {
      setAreaOptions([]);
      return;
    }
    let cancelled = false;
    void getRegion(stateKey)
      .then((detail) => {
        if (cancelled) return;
        const source =
          detail?.areas && detail.areas.length > 0
            ? detail.areas
            : (FALLBACK_AREAS[stateKey] ?? []);
        setAreaOptions(areaChoices(stateKey, source));
      })
      .catch(() => {
        if (!cancelled) {
          setAreaOptions(areaChoices(stateKey, FALLBACK_AREAS[stateKey] ?? []));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stateKey]);

  async function submitEmail() {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em.includes("@") || password.length < 8) {
      setError("Email and password (min 8 characters) required");
      return;
    }
    setLoading(true);
    try {
      if (intent === "login") {
        const res = await apiFetch<{
          accessToken: string;
          refreshToken: string;
          userId: string;
        }>("/auth/login", {
          method: "POST",
          body: {
            email: em,
            password,
            device: { name: "ReWorth Mobile", platform: "IOS" },
          },
        });
        await setTokens(res.accessToken, res.refreshToken);
        setAccessToken(res.accessToken);
        const me = await apiFetch<MeResponse>("/me", {
          token: res.accessToken,
        });
        onComplete(me);
        return;
      }

      const res = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        userId: string;
      }>("/auth/register", {
        method: "POST",
        body: {
          email: em,
          password,
          displayName: displayName.trim() || em.split("@")[0],
          device: { name: "ReWorth Mobile", platform: "IOS" },
        },
      });
      await setTokens(res.accessToken, res.refreshToken);
      setAccessToken(res.accessToken);
      const me = await apiFetch<MeResponse>("/me", { token: res.accessToken });
      if (me.profile?.displayName) setDisplayName(me.profile.displayName);
      if (me.profile?.bio) setBio(me.profile.bio);
      if (me.profile?.avatarUrl) setAvatarUrl(me.profile.avatarUrl);
      const pref = me.profile?.preferredCommunity?.trim();
      if (pref) setCommunity(pref);
      setStep("profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission needed for avatar");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarUrl(result.assets[0].uri);
  }

  async function saveProfile() {
    setError(null);
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required");
      return;
    }
    if (!stateKey) {
      setError("Select your state");
      return;
    }
    if (!community || !areaOptions.some((area) => area.value === community)) {
      setError("Select a preferred area in that state");
      return;
    }
    const token = accessToken;
    if (!token) {
      setError("Session missing — start again");
      return;
    }
    setLoading(true);
    try {
      const remoteAvatar =
        avatarUrl && /^https?:\/\//i.test(avatarUrl) ? avatarUrl : undefined;
      const me = await apiFetch<MeResponse>("/me", {
        method: "PATCH",
        token,
        body: {
          displayName: name,
          preferredCommunity: community,
          bio: bio.trim() || null,
          ...(remoteAvatar ? { avatarUrl: remoteAvatar } : {}),
        },
      });
      onComplete(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  }

  const slides = [
    { title: "Sell what you don’t need", line: "Photo → AI draft → live in Lagos." },
    { title: "Buy with local trust", line: "Verified neighbours. Buyer protection." },
    { title: "Swap or give away", line: "Your unused things are worth something." },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand} accessibilityRole="header">
        ReWorth
      </Text>

      {step === "welcome" ? (
        <View>
          <Text style={styles.title}>{slides[welcomeSlide].title}</Text>
          <Text style={styles.copy}>{slides[welcomeSlide].line}</Text>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === welcomeSlide && styles.dotOn]}
              />
            ))}
          </View>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              if (welcomeSlide < slides.length - 1) {
                setWelcomeSlide((s) => s + 1);
              } else {
                setStep("email");
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.primaryBtnText}>
              {welcomeSlide < slides.length - 1 ? "Next" : "Continue with email"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (onBack && welcomeSlide === 0) onBack();
              else setStep("email");
            }}
            accessibilityRole="button"
          >
            <Text style={styles.link}>
              {onBack && welcomeSlide === 0 ? "Back" : "Skip"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {step === "email" ? (
        <View>
          <Text style={styles.title}>
            {intent === "login" ? "Welcome back" : "Create account"}
          </Text>
          <Text style={styles.copy}>
            {intent === "login"
              ? "Log in with the email you used to join ReWorth."
              : "Use your email, then customise how neighbours see you."}
          </Text>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email"
            editable={!loading}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={intent === "login" ? "password" : "new-password"}
            accessibilityLabel="Password"
            editable={!loading}
          />
          {intent === "register" ? (
            <>
              <Text style={styles.label}>Display name (optional)</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                accessibilityLabel="Display name"
                editable={!loading}
              />
            </>
          ) : null}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={() => void submitEmail()}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>
              {loading
                ? "…"
                : intent === "login"
                  ? "Log in"
                  : "Create account"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (intent === "login" && onBack) onBack();
              else setStep("welcome");
            }}
          >
            <Text style={styles.link}>Back</Text>
          </Pressable>
        </View>
      ) : null}

      {step === "profile" ? (
        <View>
          <Text style={styles.title}>Customise your profile</Text>
          <Text style={styles.copy}>
            Name, photo, bio, and the area you want to shop in.
          </Text>
          <Pressable
            style={styles.avatarBtn}
            onPress={() => void pickAvatar()}
            accessibilityRole="button"
            accessibilityLabel="Choose profile photo"
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarPlus}>+</Text>
            )}
          </Pressable>
          <Text style={styles.hint}>Add a photo (optional)</Text>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            accessibilityLabel="Display name"
            editable={!loading}
          />
          <Text style={styles.label}>Bio (optional)</Text>
          <TextInput
            style={[styles.input, styles.bio]}
            value={bio}
            onChangeText={setBio}
            multiline
            accessibilityLabel="Bio"
            editable={!loading}
          />
          <Text style={styles.label}>State</Text>
          <View style={styles.chips}>
            {(regions.length > 0 ? regions : [...FALLBACK_STATES]).map((item) => (
              <Pressable
                key={item.city}
                onPress={() => {
                  setStateKey(item.city);
                  setCommunity("");
                }}
                style={[styles.chip, stateKey === item.city && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: stateKey === item.city }}
              >
                <Text
                  style={[
                    styles.chipText,
                    stateKey === item.city && styles.chipTextSelected,
                  ]}
                >
                  {item.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
          {stateKey ? (
            <>
              <Text style={styles.label}>Preferred area</Text>
              {areaOptions.length === 0 ? (
                <Text style={styles.hint}>No areas are available for this state yet.</Text>
              ) : (
                <View style={styles.chips}>
                  {areaOptions.map((area) => (
                    <Pressable
                      key={area.value}
                      onPress={() => setCommunity(area.value)}
                      style={[
                        styles.chip,
                        community === area.value && styles.chipSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: community === area.value }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          community === area.value && styles.chipTextSelected,
                        ]}
                      >
                        {area.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.hint}>Select a state to see its areas.</Text>
          )}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={() => void saveProfile()}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>
              {loading ? "Saving…" : "Enter ReWorth"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  brand: {
    fontSize: typeScale.titleSm,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: space.xl,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: typeScale.titleSm,
    fontWeight: "600",
    color: colors.ink,
    lineHeight: 26,
    marginBottom: space.sm,
  },
  copy: {
    fontSize: typeScale.bodySm,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: space.lg,
  },
  label: {
    fontSize: typeScale.meta,
    fontWeight: "500",
    color: colors.muted,
    marginBottom: space.xs,
    marginTop: space.md,
  },
  input: {
    minHeight: tap.min,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: typeScale.body,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  bio: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  primaryBtn: {
    marginTop: space.xl,
    minHeight: tap.min,
    borderRadius: radius.md,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: typeScale.bodySm,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.5 },
  link: {
    marginTop: space.lg,
    textAlign: "center",
    color: colors.emerald,
    fontSize: typeScale.bodySm,
    fontWeight: "500",
  },
  error: {
    marginTop: space.sm,
    color: colors.error,
    fontSize: typeScale.meta,
  },
  hint: {
    marginTop: space.xs,
    color: colors.muted,
    fontSize: typeScale.meta,
    textAlign: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.sm,
  },
  chip: {
    minHeight: tap.min,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: colors.emeraldWash,
    borderColor: colors.emerald,
  },
  chipText: {
    fontSize: typeScale.meta,
    color: colors.ink,
    fontWeight: "500",
  },
  chipTextSelected: {
    color: colors.emeraldPressed,
    fontWeight: "600",
  },
  dots: {
    flexDirection: "row",
    gap: space.sm,
    marginBottom: space.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotOn: { backgroundColor: colors.emerald },
  avatarBtn: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.emeraldWash,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: space.xs,
  },
  avatarImg: { width: 88, height: 88 },
  avatarPlus: {
    fontSize: 32,
    color: colors.emerald,
    fontWeight: "600",
  },
});
