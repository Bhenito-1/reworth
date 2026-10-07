import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  assistListing,
  createListing,
  getListing,
  getPriceIntelligence,
  patchListing,
  publishListing,
  appealListing,
  uploadListingPhotoDirect,
} from "./lib/listings";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "./lib/areas";
import { getRegion, listRegions, type RegionCity } from "./lib/region";
import {
  FALLBACK_BANKS,
  getPayoutSetup,
  listPayoutBanks,
  payoutDisplayName,
  verifyPayoutAccount,
  type LegalName,
  type PayoutAccountView,
  type PayoutBank,
} from "./lib/payout";
import {
  formatNgnFromKobo,
  type PriceIntelligence,
  type PublicListing,
  type SellingModeValue,
} from "./lib/types";

type SellStep =
  | "photos"
  | "draft"
  | "location"
  | "fulfilment"
  | "bank"
  | "publish"
  | "done";

type LocalPhoto = {
  uri: string;
  name: string;
  type: string;
  key?: string;
};

type Props = {
  onPublished?: (listing: PublicListing) => void;
  onOpenListing?: (id: string) => void;
};

async function pickImages(): Promise<LocalPhoto[]> {
  try {
    // Optional dependency — may be missing until pnpm install
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require("expo-image-picker") as {
      requestMediaLibraryPermissionsAsync: () => Promise<{
        status: string;
      }>;
      launchImageLibraryAsync: (opts: object) => Promise<{
        canceled: boolean;
        assets?: Array<{
          uri: string;
          fileName?: string | null;
          mimeType?: string | null;
          fileSize?: number | null;
        }>;
      }>;
    };
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      return mockPhotos();
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 6,
    });
    if (result.canceled || !result.assets?.length) return [];
    return result.assets.slice(0, 6).map((a, i) => ({
      uri: a.uri,
      name: a.fileName ?? `photo-${i}.jpg`,
      type: a.mimeType ?? "image/jpeg",
    }));
  } catch {
    return mockPhotos();
  }
}

function mockPhotos(): LocalPhoto[] {
  return [
    {
      uri: "mock://photo-1",
      name: "samsung-tv-front.jpg",
      type: "image/jpeg",
      key: "uploads/mock/samsung-tv-front.jpg",
    },
    {
      uri: "mock://photo-2",
      name: "samsung-tv-side.jpg",
      type: "image/jpeg",
      key: "uploads/mock/samsung-tv-side.jpg",
    },
  ];
}

export function SellFlow({ onPublished, onOpenListing }: Props) {
  const [step, setStep] = useState<SellStep>("photos");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealOk, setAppealOk] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState("GOOD");
  const [categoryName, setCategoryName] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [units, setUnits] = useState("1");
  const [priceIntel, setPriceIntel] = useState<PriceIntelligence | null>(null);

  const [sellingMode, setSellingMode] = useState<SellingModeValue>("SELL");
  const [negotiable, setNegotiable] = useState(true);
  const [community, setCommunity] = useState("");
  const [stateKey, setStateKey] = useState("");
  const [regions, setRegions] = useState<RegionCity[]>([]);
  const [areaOptions, setAreaOptions] = useState<AreaChoice[]>([]);
  const [fulfilmentPickup, setFulfilmentPickup] = useState(true);
  const [fulfilmentMeet, setFulfilmentMeet] = useState(true);
  const [fulfilmentDelivery, setFulfilmentDelivery] = useState(false);
  const [donateIfUnsold, setDonateIfUnsold] = useState(false);
  const [donateIfUnsoldDays, setDonateIfUnsoldDays] = useState("30");
  const [published, setPublished] = useState<PublicListing | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountView | null>(
    null,
  );
  const [payoutBanks, setPayoutBanks] = useState<PayoutBank[]>([
    ...FALLBACK_BANKS,
  ]);
  const [nameEnquiryMode, setNameEnquiryMode] = useState<"mock" | "paystack">(
    "mock",
  );
  const [bankEditing, setBankEditing] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [legalFirst, setLegalFirst] = useState("");
  const [legalMiddle, setLegalMiddle] = useState("");
  const [legalLast, setLegalLast] = useState("");
  const [nibssName, setNibssName] = useState<LegalName | null>(null);

  const tokenOrThrow = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error("Not signed in");
    return token;
  }, []);

  useEffect(() => {
    if (step !== "bank") return;
    let cancelled = false;
    void Promise.all([
      getPayoutSetup().catch(() => ({
        account: null,
        nameEnquiryMode: "mock" as const,
      })),
      listPayoutBanks(),
    ]).then(([setup, banks]) => {
      if (cancelled) return;
      setPayoutAccount(setup.account);
      setNameEnquiryMode(setup.nameEnquiryMode);
      setPayoutBanks(banks);
      setBankEditing(!setup.account);
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    void listRegions()
      .then((items) => setRegions(items))
      .catch(() => setRegions([]));
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
        const options = areaChoices(stateKey, source);
        setAreaOptions(options);
        if (options.length === 0) return;
        setCommunity((current) =>
          !current || options.some((option) => option.value === current)
            ? current
            : "",
        );
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

  async function ensureDraft(token: string) {
    if (listingId) return listingId;
    const created = await createListing(token, {
      title: "",
      description: "",
      sellingMode: "SELL",
      negotiable: true,
    });
    setListingId(created.id);
    return created.id;
  }

  async function addPhotos() {
    setError(null);
    const picked = await pickImages();
    if (!picked.length) {
      setError("No photos selected — try again.");
      return;
    }
    setPhotos((prev) => [...prev, ...picked].slice(0, 6));
  }

  async function continuePhotos() {
    setError(null);
    if (photos.length < 2) {
      setError("Add at least 2 photos.");
      return;
    }
    setBusy(true);
    try {
      const token = await tokenOrThrow();
      const id = await ensureDraft(token);
      const keys: { key: string; sortOrder: number }[] = [];

      const MOCK_JPEG_URI =
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const isMock = photo.uri.startsWith("mock://");
        const uploaded = await uploadListingPhotoDirect(
          token,
          id,
          {
            uri: isMock ? MOCK_JPEG_URI : photo.uri,
            name: (photo.name || `photo-${i}`).replace(/\.[^.]+$/, "") + ".jpg",
            type: "image/jpeg",
          },
          i,
        );
        if (uploaded.status !== "READY") {
          throw new Error("Photo did not finish processing. Try again.");
        }
        keys.push({ key: uploaded.key, sortOrder: i });
      }

      // Direct upload already attached + processed images.

      setAssistLoading(true);
      setStep("draft");
      const assist = await assistListing(
        id,
        token,
        keys.map((k) => k.key),
      );
      const refreshed = await getListing(id, token);
      setTitle(assist.draft?.title || refreshed.title);
      setDescription(assist.draft?.description || refreshed.description);
      setBrand(assist.draft?.brand || refreshed.brand || "");
      setCondition(assist.draft?.suggestedCondition || refreshed.condition);
      setCategoryName(
        assist.draft?.suggestedCategory || refreshed.category?.name || "",
      );
      setPriceNaira(
        String(
          assist.draft?.suggestedPriceNaira ??
            Math.round(refreshed.priceKobo / 100),
        ),
      );
      if (refreshed.quantityTotal && refreshed.quantityTotal > 0) {
        setUnits(String(refreshed.quantityTotal));
      }
      try {
        setPriceIntel(await getPriceIntelligence(id));
      } catch {
        setPriceIntel(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
      setStep("photos");
    } finally {
      setAssistLoading(false);
      setBusy(false);
    }
  }

  async function saveFields() {
    if (!listingId) return;
    const token = await tokenOrThrow();
    const naira = Number(priceNaira) || 0;
    await patchListing(listingId, token, {
      title: title.trim(),
      description: description.trim(),
      brand: brand.trim() || undefined,
      condition,
      priceKobo: sellingMode === "GIVE_AWAY" ? 0 : Math.round(naira * 100),
      quantity: sellingMode === "SELL" ? Math.max(1, Number(units) || 1) : 1,
      negotiable: sellingMode === "SELL" ? negotiable : false,
      donateIfUnsoldDays: donateIfUnsold
        ? Math.min(59, Math.max(7, Number(donateIfUnsoldDays) || 30))
        : null,
      sellingMode,
      community: community || undefined,
      city:
        [...regions, ...FALLBACK_STATES].find((item) => item.city === stateKey)
          ?.displayName || undefined,
      fulfilmentPickup,
      fulfilmentMeet,
      fulfilmentDelivery,
    });
  }

  async function doPublish() {
    setError(null);
    if (!listingId) return;
    setBusy(true);
    try {
      await saveFields();
      const token = await tokenOrThrow();
      const live = await publishListing(listingId, token);
      setPublished(live);
      setStep("done");
      onPublished?.(live);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand} accessibilityRole="header">
        Sell
      </Text>
      <Text style={styles.stepHint}>{stepLabel(step)}</Text>

      {step === "photos" ? (
        <View>
          <Text style={styles.copy}>
            Add 2–6 photos. AI drafts title, price, and more.
          </Text>
          <Text style={styles.meta}>{photos.length} / 6 photos</Text>
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {photos.map((p) =>
                p.uri.startsWith("mock://") ? (
                  <View key={p.uri} style={[styles.photoThumb, styles.photoMock]}>
                    <Text style={styles.photoMockText}>Photo</Text>
                  </View>
                ) : (
                  <Image
                    key={p.uri}
                    source={{ uri: p.uri }}
                    style={styles.photoThumb}
                    resizeMode="cover"
                    accessibilityLabel="Selected photo"
                  />
                ),
              )}
            </ScrollView>
          ) : null}
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void addPhotos()}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Choose photos</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.primaryBtn, (busy || photos.length < 2) && styles.btnDisabled]}
            onPress={() => void continuePhotos()}
            disabled={busy || photos.length < 2}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>
              {busy ? "Uploading…" : "Continue"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {step === "draft" ? (
        <View>
          {assistLoading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator color="#0E9F6E" />
              <Text style={styles.copy}>Reading your photos…</Text>
            </View>
          ) : (
            <>
              <Field label="Title" value={title} onChange={setTitle} />
              <Field
                label="Description"
                value={description}
                onChange={setDescription}
                multiline
              />
              <Field
                label="Category"
                value={categoryName}
                onChange={setCategoryName}
              />
              <Field label="Brand" value={brand} onChange={setBrand} />
              <Field
                label="Condition"
                value={condition}
                onChange={setCondition}
              />
              <Text style={styles.label}>How are you listing?</Text>
              <View style={styles.chips}>
                {(
                  [
                    ["SELL", "Sell"],
                    ["SWAP", "Swap"],
                    ["GIVE_AWAY", "Give away"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    onPress={() => setSellingMode(value)}
                    style={[
                      styles.chip,
                      sellingMode === value && styles.chipSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sellingMode === value }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        sellingMode === value && styles.chipTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {sellingMode !== "GIVE_AWAY" ? (
                <Field
                  label="Price per unit (₦)"
                  value={priceNaira}
                  onChange={(t) => setPriceNaira(t.replace(/[^\d]/g, ""))}
                  keyboardType="numeric"
                />
              ) : null}
              {sellingMode === "SELL" ? (
                <>
                  <Field
                    label="Units available"
                    value={units}
                    onChange={(t) => setUnits(t.replace(/[^\d]/g, ""))}
                    keyboardType="numeric"
                  />
                  <Pressable
                    style={styles.checkRow}
                    onPress={() => setNegotiable((v) => !v)}
                  >
                    <Text style={styles.copy}>
                      {negotiable ? "☑" : "☐"} Price is negotiable
                    </Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable
                style={styles.checkRow}
                onPress={() => setDonateIfUnsold((v) => !v)}
              >
                <Text style={styles.copy}>
                  {donateIfUnsold ? "☑" : "☐"} Donate if unsold
                </Text>
              </Pressable>
              {donateIfUnsold ? (
                <>
                  <Text style={styles.copy}>
                    The listing stays live for 60 days. Choose a shorter wait
                    so the hand-off can happen while it is still live.
                  </Text>
                  <Field
                    label="Days before hand-off"
                    value={donateIfUnsoldDays}
                    onChange={(t) => setDonateIfUnsoldDays(t.replace(/[^\d]/g, ""))}
                    keyboardType="numeric"
                  />
                </>
              ) : null}
              {priceIntel && sellingMode !== "GIVE_AWAY" ? (
                <View style={styles.intel}>
                  <Text style={styles.intelTitle}>Price sense</Text>
                  <Text style={styles.copy}>
                    {formatNgnFromKobo(priceIntel.estimatedLowKobo)} –{" "}
                    {formatNgnFromKobo(priceIntel.estimatedHighKobo)}
                  </Text>
                  <Text style={styles.intelRec}>
                    Recommended{" "}
                    {formatNgnFromKobo(priceIntel.recommendedKobo)}
                  </Text>
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                <Pressable
                  style={[styles.secondaryBtn, styles.flex]}
                  onPress={() => setStep("photos")}
                >
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, styles.flex, busy && styles.btnDisabled]}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      await saveFields();
                      setStep("location");
                    } catch (err) {
                      setError(
                        err instanceof ApiError ? err.message : "Save failed",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : null}

      {step === "location" ? (
        <View>
          <Text style={styles.copy}>
            Select a state first. Areas in that state appear after you choose it.
          </Text>
          <Text style={styles.label}>State</Text>
          <View style={styles.chips}>
            {(regions.length > 0 ? regions : [...FALLBACK_STATES]).map((item) => (
              <Pressable
                key={item.city}
                onPress={() => {
                  setStateKey(item.city);
                  setCommunity("");
                  setError(null);
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
              <Text style={styles.label}>Area</Text>
              {areaOptions.length === 0 ? (
                <Text style={styles.copy}>No areas are available for this state yet.</Text>
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
            <Text style={styles.copy}>
              Select a state to see areas such as VI and Ikoyi.
            </Text>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, styles.flex]}
              onPress={() => setStep("draft")}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, styles.flex]}
              onPress={async () => {
                if (!stateKey) {
                  setError("Select a state first");
                  return;
                }
                if (!community) {
                  setError("Select an area in that state");
                  return;
                }
                await saveFields();
                setStep("fulfilment");
              }}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === "fulfilment" ? (
        <View>
          <Check
            label="Pickup or meet nearby"
            checked={fulfilmentPickup || fulfilmentMeet}
            onToggle={() => {
              const next = !(fulfilmentPickup || fulfilmentMeet);
              setFulfilmentPickup(next);
              setFulfilmentMeet(next);
            }}
          />
          <Check
            label="Delivery (quote at checkout)"
            checked={fulfilmentDelivery}
            onToggle={() => setFulfilmentDelivery((v) => !v)}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, styles.flex]}
              onPress={() => setStep("location")}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, styles.flex]}
              onPress={async () => {
                if (!fulfilmentPickup && !fulfilmentMeet && !fulfilmentDelivery) {
                  setError("Pick at least one option");
                  return;
                }
                await saveFields();
                setStep("bank");
              }}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === "bank" ? (
        <View>
          <Text style={styles.copy}>
            Paystack checks the account and returns the name on it. Enter
            your legal name as first, middle, then last.
          </Text>
          {payoutAccount && !bankEditing ? (
            <View style={styles.intel}>
              <Text style={styles.intelTitle}>Verified account</Text>
              <Text style={styles.copy}>{payoutDisplayName(payoutAccount)}</Text>
              <Text style={styles.copy}>
                {payoutAccount.bankName} · {payoutAccount.accountNumberMasked}
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setStep("publish")}
              >
                <Text style={styles.primaryBtnText}>Use these details</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  setNibssName(null);
                  setError(null);
                  setBankEditing(true);
                }}
              >
                <Text style={styles.secondaryBtnText}>Use a different account</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {nameEnquiryMode === "mock" ? (
                <Text style={styles.copy}>
                  Local check without Paystack: GTBank account 0123456789 is
                  Adewale Chinedu Okonkwo.
                </Text>
              ) : null}
              <Field
                label="Search bank name"
                value={bankQuery}
                onChange={setBankQuery}
              />
              <View style={styles.chips}>
                {payoutBanks
                  .filter((bank) =>
                    bank.name.toLowerCase().includes(bankQuery.trim().toLowerCase()),
                  )
                  .slice(0, 8)
                  .map((bank) => (
                    <Pressable
                      key={bank.code}
                      onPress={() => {
                        setBankCode(bank.code);
                        setBankQuery(bank.name);
                      }}
                      style={[
                        styles.chip,
                        bankCode === bank.code && styles.chipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          bankCode === bank.code && styles.chipTextSelected,
                        ]}
                      >
                        {bank.name}
                      </Text>
                    </Pressable>
                  ))}
              </View>
              <Field
                label="Account number"
                value={accountNumber}
                keyboardType="numeric"
                onChange={(t) => setAccountNumber(t.replace(/\D/g, "").slice(0, 10))}
              />
              <Field label="First name" value={legalFirst} onChange={setLegalFirst} />
              <Field
                label="Middle name"
                value={legalMiddle}
                onChange={setLegalMiddle}
              />
              <Field label="Last name" value={legalLast} onChange={setLegalLast} />
              {nibssName ? (
                <Text style={styles.copy}>
                  Name on the account: {payoutDisplayName(nibssName)}
                </Text>
              ) : null}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, styles.flex]}
              onPress={() => setStep("fulfilment")}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>
            {bankEditing || !payoutAccount ? (
              <Pressable
                style={[styles.primaryBtn, styles.flex, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => {
                  void (async () => {
                    setError(null);
                    setNibssName(null);
                    if (!/^\d{10}$/.test(accountNumber)) {
                      setError("Enter a 10-digit account number.");
                      return;
                    }
                    if (!bankCode) {
                      setError("Choose your bank.");
                      return;
                    }
                    if (!legalFirst.trim() || !legalLast.trim()) {
                      setError("Enter your first and last name.");
                      return;
                    }
                    setBusy(true);
                    try {
                      const result = await verifyPayoutAccount({
                        accountNumber,
                        bankCode,
                        firstName: legalFirst.trim(),
                        middleName: legalMiddle.trim(),
                        lastName: legalLast.trim(),
                      });
                      if (!result.ok) {
                        if (result.reason === "NAME_MISMATCH" && result.nibssName) {
                          setNibssName(result.nibssName);
                          setError(
                            "The name on this account does not match the name you entered.",
                          );
                        } else {
                          setError(
                            "We could not find that account at the selected bank.",
                          );
                        }
                        return;
                      }
                      setPayoutAccount(result.account);
                      setBankEditing(false);
                      setStep("publish");
                    } catch (err) {
                      setError(
                        err instanceof ApiError ? err.message : "Could not verify the account",
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? "Checking…" : "Check account"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {step === "publish" ? (
        <View>
          <Text style={styles.titlePreview}>{title}</Text>
          <Text style={styles.copy}>
            {community} ·{" "}
            {sellingMode === "GIVE_AWAY"
              ? "Give away"
              : sellingMode === "SWAP"
                ? "Swap"
                : formatNgnFromKobo((Number(priceNaira) || 0) * 100)}
          </Text>
          {payoutAccount ? (
            <Text style={styles.copy}>
              Payout · {payoutAccount.bankName} {payoutAccount.accountNumberMasked}
            </Text>
          ) : null}
          <Text style={styles.copy}>
            Publishing can take a little while. We verify your photos and the
            item details before the listing goes live, so you can stay on this
            page.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, styles.flex]}
              onPress={() => setStep("bank")}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, styles.flex, busy && styles.btnDisabled]}
              onPress={() => void doPublish()}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Publishing…" : "Publish"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === "done" && published ? (
        <View>
          <Text style={styles.titlePreview}>
            {published.status === "REJECTED"
              ? "Listing rejected"
              : published.status === "UNDER_REVIEW"
                ? "Submitted for review"
                : "Your listing is live"}
          </Text>
          <Text style={styles.copy}>{published.title}</Text>
          {published.status === "REJECTED" ? (
            <View style={{ gap: 8, marginBottom: 12 }}>
              <Text style={styles.copy}>
                {(published.moderationReasons?.length
                  ? published.moderationReasons.join("; ")
                  : "Content moderation rejected this listing.") +
                  " You can appeal — our team will review."}
              </Text>
              {appealOk ? (
                <Text style={styles.copy}>Appeal submitted.</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Why should this be allowed?"
                    value={appealReason}
                    onChangeText={setAppealReason}
                    multiline
                  />
                  <Pressable
                    style={[styles.primaryBtn, appealBusy && styles.btnDisabled]}
                    disabled={appealBusy || appealReason.trim().length < 8}
                    onPress={() =>
                      void (async () => {
                        const token = await getAccessToken();
                        if (!token || !published.id) return;
                        setAppealBusy(true);
                        setError(null);
                        try {
                          await appealListing(
                            published.id,
                            token,
                            appealReason.trim(),
                          );
                          setAppealOk(true);
                        } catch (err) {
                          setError(
                            err instanceof ApiError
                              ? err.message
                              : "Appeal failed",
                          );
                        } finally {
                          setAppealBusy(false);
                        }
                      })()
                    }
                  >
                    <Text style={styles.primaryBtnText}>
                      {appealBusy ? "…" : "Submit appeal"}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
          <Pressable
            style={styles.primaryBtn}
            onPress={() => onOpenListing?.(published.id)}
          >
            <Text style={styles.primaryBtnText}>View listing</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              setStep("photos");
              setPhotos([]);
              setListingId(null);
              setPublished(null);
              setAppealOk(false);
              setAppealReason("");
            }}
          >
            <Text style={styles.secondaryBtnText}>List another</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function stepLabel(step: SellStep): string {
  const map: Record<SellStep, string> = {
    photos: "1 · Photos",
    draft: "2 · Details",
    location: "3 · Location",
    fulfilment: "4 · Fulfilment",
    bank: "5 · Bank",
    publish: "6 · Publish",
    done: "Done",
  };
  return map[step];
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  multiline?: boolean;
  keyboardType?: "numeric";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function Check({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      <Text style={styles.copy}>
        {checked ? "☑" : "☐"} {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 40 },
  brand: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111315",
    letterSpacing: -0.4,
  },
  stepHint: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#0E9F6E",
  },
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    color: "#5C636A",
  },
  meta: { marginTop: 8, fontSize: 14, color: "#5C636A" },
  photoRow: { gap: 8, paddingTop: 12 },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#E5E2DC",
  },
  photoMock: { alignItems: "center", justifyContent: "center" },
  photoMockText: { fontSize: 12, fontWeight: "600", color: "#5C636A" },
  label: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#111315",
  },
  field: { marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111315",
    backgroundColor: "#FFFFFF",
  },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: "#0E9F6E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: { color: "#111315", fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.55 },
  error: { marginTop: 10, color: "#DC2626", fontSize: 14 },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  flex: { flex: 1 },
  centerBlock: { alignItems: "center", paddingVertical: 40, gap: 12 },
  intel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#FFFFFF",
  },
  intelTitle: { fontSize: 14, fontWeight: "700", color: "#111315" },
  intelRec: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "700",
    color: "#0E9F6E",
  },
  checkRow: { marginTop: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: { backgroundColor: "#0E9F6E", borderColor: "#0E9F6E" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#111315" },
  chipTextSelected: { color: "#FFFFFF" },
  titlePreview: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "700",
    color: "#111315",
  },
});
