/**
 * Consumer onboarding â email register/login + profile customise.
 */

import { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScrollView } from "./components/BoundScroll";
import * as ImagePicker from "expo-image-picker";
import { ApiError, apiFetch } from "./lib/api";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "./lib/areas";
import { setTokens } from "./lib/auth";
import { storeMediaPhoto } from "./lib/listings";
import { getRegion, listRegions, type RegionCity } from "./lib/region";
import { brandAssets } from "./lib/brandAssets";
import { type MeResponse } from "./lib/types";
import { colors, radius, space, tap, type as typeScale } from "./theme/tokens";
import { hapticLight } from "./theme/haptics";

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
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [regions, setRegions] = useState<RegionCity[]>([...FALLBACK_STATES]);
  const [stateKey, setStateKey] = useState("");
  const [areaOptions, setAreaOptions] = useState<AreaChoice[]>([]);
  const [community, setCommunity] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLocal, setAvatarLocal] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (intent === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
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
    const asset = result.assets[0];
    setAvatarUrl(asset.uri);
    setAvatarLocal({
      uri: asset.uri,
      name: asset.fileName || "avatar.jpg",
      type: asset.mimeType || "image/jpeg",
    });
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
      setError("Session missing â start again");
      return;
    }
    setLoading(true);
    try {
      let remoteAvatar =
        avatarUrl && /^https?:\/\//i.test(avatarUrl) ? avatarUrl : undefined;
      if (avatarLocal) {
        const stored = await storeMediaPhoto(token, avatarLocal);
        remoteAvatar = stored.publicUrl;
      }
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

  return (
    <ScrollView
      contentContainerStyle={[
        styles.pad,
        step === "welcome" && styles.padLanding,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {step !== "welcome" ? (
        <Text style={styles.brand} accessibilityRole="header">
          ReWorth
        </Text>
      ) : null}

      {step === "welcome" ? (
        <Pressable
          style={({ pressed }) => [
            styles.landing,
            pressed && styles.landingPressed,
          ]}
          onPress={() => {
            void hapticLight();
            setStep("email");
          }}
          accessibilityRole="button"
          accessibilityLabel="Get started"
          testID="landing-get-started"
        >
          <Image
            source={brandAssets.landingPage}
            style={styles.landingImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
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
          <PasswordBox
            label="Password"
            value={password}
            onChangeText={setPassword}
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            autoComplete={intent === "login" ? "password" : "new-password"}
            editable={!loading}
          />
          {intent === "register" ? (
            <PasswordBox
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((current) => !current)}
              autoComplete="new-password"
              editable={!loading}
            />
          ) : null}
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
                ? "â¦"
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
              {loading ? "Savingâ¦" : "Enter ReWorth"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PasswordBox({
  label,
  value,
  onChangeText,
  visible,
  onToggle,
  autoComplete,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: "password" | "new-password";
  editable: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoComplete={autoComplete}
          autoCapitalize="none"
          accessibilityLabel={label}
          editable={editable}
        />
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordToggleText}>{visible ? "â" : "â£"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  padLanding: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  brand: {
    fontSize: typeScale.titleSm,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: space.xl,
    letterSpacing: -0.3,
  },
  landing: {
    width: "100%",
    minHeight: Dimensions.get("window").height - 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  landingPressed: {
    opacity: 0.96,
  },
  landingImage: {
    width: "100%",
    height: "100%",
    maxHeight: Dimensions.get("window").height - 48,
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
  passwordRow: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 72,
  },
  passwordToggle: {
    position: "absolute",
    right: space.md,
    minHeight: tap.min,
    justifyContent: "center",
  },
  passwordToggleText: {
    color: colors.emerald,
    fontSize: typeScale.bodySm,
    fontWeight: "600",
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
