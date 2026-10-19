"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNgn, nairaToKobo, koboToNaira } from "@reworth/shared";
import { Button, Chip, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { fetchCategories } from "../../lib/discovery";
import { getAccessToken } from "../../lib/auth";
import {
  FALLBACK_BANKS,
  getPayoutSetup,
  listPayoutBanks,
  payoutDisplayName,
  verifyPayoutAccount,
  type PayoutAccountView,
  type PayoutBank,
} from "../../lib/payout";
import {
  areaChoices,
  FALLBACK_AREAS,
  FALLBACK_STATES,
  type AreaChoice,
} from "../../lib/areas";
import {
  assistListing,
  CONDITIONS,
  CONDITION_LABELS,
  createListing,
  getListing,
  getPriceIntelligence,
  listingImageUrl,
  patchListing,
  publishListing,
  appealListing,
  uploadListingPhoto,
} from "../../lib/listings";
import { getRegion, listRegions, type RegionCity } from "../../lib/region";
import type {
  PriceIntelligence,
  PublicListing,
  SellingModeValue,
} from "../../lib/types";

type SellStep =
  | "photos"
  | "draft"
  | "location"
  | "fulfilment"
  | "bank"
  | "publish"
  | "done";

const STEPS: SellStep[] = [
  "photos",
  "draft",
  "location",
  "fulfilment",
  "bank",
  "publish",
];

const STEP_LABELS: Record<SellStep, string> = {
  photos: "Photos",
  draft: "Details",
  location: "Location",
  fulfilment: "Fulfilment",
  bank: "Bank",
  publish: "Publish",
  done: "Live",
};

type LocalPhoto = {
  id: string;
  file?: File;
  key?: string;
  existing?: boolean;
  previewUrl: string;
};

function draftResumeStep(listing: PublicListing): SellStep {
  if ((listing.images?.length ?? 0) < 2) return "photos";
  const priced =
    listing.sellingMode === "GIVE_AWAY" ||
    listing.sellingMode === "SWAP" ||
    listing.priceKobo > 0;
  if (!listing.title?.trim() || !listing.description?.trim() || !priced) {
    return "draft";
  }
  if (!listing.community?.trim()) return "location";
  return "fulfilment";
}

export default function SellPage() {
  const router = useRouter();
  const resumeId = useSearchParams().get("listingId");
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [hydratingDraft, setHydratingDraft] = useState(Boolean(resumeId));
  const [step, setStep] = useState<SellStep>("photos");
  const [listingId, setListingId] = useState<string | null>(null);
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealOk, setAppealOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);
  const [condition, setCondition] = useState<string>("GOOD");
  const [brand, setBrand] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [units, setUnits] = useState("1");
  const [priceIntel, setPriceIntel] = useState<PriceIntelligence | null>(null);
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleMileage, setVehicleMileage] = useState("");

  const [sellingMode, setSellingMode] = useState<SellingModeValue>("SELL");
  const [negotiable, setNegotiable] = useState(true);
  const [community, setCommunity] = useState("");
  const [stateKey, setStateKey] = useState("");
  const [areaOptions, setAreaOptions] = useState<AreaChoice[]>([]);
  const [donateIfUnsold, setDonateIfUnsold] = useState(false);
  const [donateIfUnsoldDays, setDonateIfUnsoldDays] = useState(30);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountView | null>(
    null,
  );
  const [payoutBanks, setPayoutBanks] = useState<PayoutBank[]>([
    ...FALLBACK_BANKS,
  ]);
  const [bankEditing, setBankEditing] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [legalFirst, setLegalFirst] = useState("");
  const [legalMiddle, setLegalMiddle] = useState("");
  const [legalLast, setLegalLast] = useState("");
  const [cities, setCities] = useState<RegionCity[]>([]);
  const [city, setCity] = useState("");

  const [published, setPublished] = useState<PublicListing | null>(null);

  useEffect(() => {
    void fetchCategories()
      .then((items) =>
        setCategories(
          items.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
          })),
        ),
      )
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (categoryId || !categoryName.trim() || categories.length === 0) return;
    const norm = (value: string) =>
      value
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const query = norm(categoryName);
    const match =
      categories.find(
        (item) =>
          norm(item.name) === query || item.slug.replace(/-/g, " ") === query,
      ) ??
      categories.find((item) => {
        const name = norm(item.name);
        return name.includes(query) || query.includes(name);
      });
    if (!match) return;
    setCategoryId(match.id);
    if (match.name !== categoryName) setCategoryName(match.name);
  }, [categories, categoryName, categoryId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setReady(true);
    void listRegions()
      .then((regions) => setCities(regions))
      .catch(() => setCities([]));
  }, [router]);

  useEffect(() => {
    if (!ready || !resumeId) return;
    let cancelled = false;
    setHydratingDraft(true);
    void (async () => {
      try {
        const token = getAccessToken();
        if (!token) return;
        const existing = await getListing(resumeId, token);
        if (cancelled || existing.status !== "DRAFT") return;
        setListingId(existing.id);
        syncFromListing(existing);
        setPhotos(
          [...existing.images]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .flatMap((img) => {
              const previewUrl = listingImageUrl(img);
              return previewUrl
                ? [{ id: img.id, existing: true, previewUrl }]
                : [];
            }),
        );
        setStep(draftResumeStep(existing));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not open this draft",
          );
        }
      } finally {
        if (!cancelled) setHydratingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, resumeId]);

  useEffect(() => {
    if (!city || cities.length === 0) return;
    const match = [...cities, ...FALLBACK_STATES].find(
      (item) =>
        item.key.toLowerCase() === city.toLowerCase() ||
        item.displayName.toLowerCase() === city.toLowerCase(),
    );
    if (match && match.key !== stateKey) setStateKey(match.key);
  }, [city, cities, stateKey]);

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
          setAreaOptions(
            areaChoices(stateKey, FALLBACK_AREAS[stateKey] ?? []),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stateKey]);

  const tokenOrThrow = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      throw new Error("Not signed in");
    }
    return token;
  }, [router]);

  const ensureDraft = useCallback(async () => {
    if (listingId) return listingId;
    const token = tokenOrThrow();
    const created = await createListing(token, {
      title: "",
      description: "",
      sellingMode: "SELL",
      negotiable: true,
    });
    setListingId(created.id);
    setListing(created);
    return created.id;
  }, [listingId, tokenOrThrow]);

  function syncFromListing(l: PublicListing) {
    setListing(l);
    setTitle(l.title || "");
    setDescription(l.description || "");
    setCategoryName(l.category?.name ?? "");
    setCategoryId(l.category?.id ?? "");
    setCondition(l.condition || "GOOD");
    setBrand(l.brand || "");
    setPriceNaira(
      l.priceKobo > 0 ? String(Math.round(koboToNaira(l.priceKobo))) : "",
    );
    setUnits(String(l.quantityTotal && l.quantityTotal > 0 ? l.quantityTotal : 1));
    setSellingMode((l.sellingMode as SellingModeValue) || "SELL");
    setNegotiable(l.negotiable);
    if (l.community) setCommunity(l.community);
    if (l.city) setCity(l.city);
    if (l.donateIfUnsoldDays != null && l.donateIfUnsoldDays > 0) {
      setDonateIfUnsold(true);
      setDonateIfUnsoldDays(l.donateIfUnsoldDays);
    } else {
      setDonateIfUnsold(false);
    }
    const v = l.vehicle;
    if (v && typeof v === "object") {
      setVehicleYear(v.year != null ? String(v.year) : "");
      setVehicleMake(
        typeof v.make === "string"
          ? v.make
          : typeof v.brand === "string"
            ? v.brand
            : "",
      );
      setVehicleModel(typeof v.model === "string" ? v.model : "");
      setVehicleMileage(
        v.mileage != null
          ? String(v.mileage)
          : v.mileageKm != null
            ? String(v.mileageKm)
            : "",
      );
    }
  }

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setPhotos((prev) => {
      const room = 6 - prev.length;
      if (room <= 0) {
        setToast("Maximum 6 photos");
        return prev;
      }
      const next = files.slice(0, room).map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function continueFromPhotos() {
    setError(null);
    if (photos.length < 2) {
      setError("Add at least 2 photos (up to 6).");
      return;
    }
    setBusy(true);
    try {
      const token = tokenOrThrow();
      const id = await ensureDraft();
      const uploaded: { key: string; sortOrder: number }[] = [];
      const nextPhotos: LocalPhoto[] = [];
      const hasExisting = photos.some((photo) => photo.existing);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo.existing) {
          nextPhotos.push(photo);
          continue;
        }
        if (photo.key) {
          uploaded.push({ key: photo.key, sortOrder: i });
          nextPhotos.push(photo);
          continue;
        }
        if (!photo.file) continue;
        const result = await uploadListingPhoto(token, id, photo.file, i);
        uploaded.push({ key: result.key, sortOrder: i });
        nextPhotos.push({ ...photo, key: result.key });
      }

      setPhotos(nextPhotos);
      // Direct upload already attaches + processes images to READY.

      setAssistLoading(true);
      setStep("draft");
      const keys = uploaded.map((u) => u.key);
      const assist = await assistListing(
        id,
        token,
        hasExisting ? undefined : keys,
      );
      const refreshed = await getListing(id, token);
      syncFromListing(refreshed);
      if (assist.draft) {
        setTitle(assist.draft.title || refreshed.title);
        setDescription(assist.draft.description || refreshed.description);
        setBrand(assist.draft.brand || refreshed.brand || "");
        setCondition(assist.draft.suggestedCondition || refreshed.condition);
        setCategoryId("");
        setCategoryName(
          assist.draft.suggestedCategory || refreshed.category?.name || "",
        );
        setPriceNaira(String(assist.draft.suggestedPriceNaira));
      }
      try {
        const intel = await getPriceIntelligence(id);
        setPriceIntel(intel);
      } catch {
        setPriceIntel(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload photos");
      setStep("photos");
    } finally {
      setAssistLoading(false);
      setBusy(false);
    }
  }

  async function saveDraftFields() {
    if (!listingId) return;
    const token = tokenOrThrow();
    const naira = Number(priceNaira.replace(/,/g, ""));
    const catLower = categoryName.trim().toLowerCase();
    const isVehicleCat =
      catLower.includes("vehicle") ||
      catLower.includes("car") ||
      catLower === "cars";
    const body: Parameters<typeof patchListing>[2] = {
      title: title.trim(),
      description: description.trim(),
      brand: brand.trim() || null,
      condition,
      ...(categoryId ? { categoryId } : {}),
      categoryName: categoryName.trim() || null,
      priceKobo:
        sellingMode === "SELL" && Number.isFinite(naira) && naira >= 0
          ? nairaToKobo(naira)
          : 0,
      ...(sellingMode === "SELL" || sellingMode === "GIVE_AWAY"
        ? { quantity: Math.max(1, Number(units) || 1) }
        : {}),
      negotiable: sellingMode === "SELL" ? negotiable : false,
      sellingMode,
      community,
      fulfilmentPickup: false,
      fulfilmentMeet: false,
      fulfilmentDelivery: true,
      city: city || undefined,
      donateIfUnsoldDays:
        sellingMode !== "GIVE_AWAY" && donateIfUnsold
          ? Math.min(59, Math.max(7, donateIfUnsoldDays))
          : null,
    };
    if (isVehicleCat || vehicleYear || vehicleMake || vehicleMileage) {
      body.vehicle = {
        year: vehicleYear ? Number(vehicleYear) : undefined,
        make: vehicleMake.trim() || undefined,
        model: vehicleModel.trim() || brand.trim() || undefined,
        mileageKm: vehicleMileage
          ? Number(vehicleMileage.replace(/,/g, ""))
          : undefined,
      };
    }
    const updated = await patchListing(listingId, token, body);
    syncFromListing(updated);
    return updated;
  }

  async function continueFromDraft() {
    setError(null);
    if (!title.trim()) {
      setError("Add a title before continuing.");
      return;
    }
    setBusy(true);
    try {
      await saveDraftFields();
      setStep("location");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save draft");
    } finally {
      setBusy(false);
    }
  }

  async function continueFromLocation() {
    setError(null);
    if (!stateKey) {
      setError("Select a state first.");
      return;
    }
    if (!community) {
      setError("Select an area in that state.");
      return;
    }
    setBusy(true);
    try {
      await saveDraftFields();
      setStep("fulfilment");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save location");
    } finally {
      setBusy(false);
    }
  }

  async function continueFromFulfilment() {
    setError(null);
    setBusy(true);
    try {
      await saveDraftFields();
      setStep(
        sellingMode === "GIVE_AWAY" || sellingMode === "SWAP"
          ? "publish"
          : "bank",
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save fulfilment",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (
      (sellingMode === "GIVE_AWAY" || sellingMode === "SWAP") &&
      step === "bank"
    ) {
      setStep("publish");
    }
  }, [sellingMode, step]);

  useEffect(() => {
    if (step !== "bank") return;
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    void Promise.all([
      getPayoutSetup(token).catch(() => ({ account: null })),
      listPayoutBanks(token).catch(() => [...FALLBACK_BANKS]),
    ]).then(([setup, banks]) => {
      if (cancelled) return;
      setPayoutAccount(setup.account);
      setPayoutBanks(banks);
      setBankEditing(!setup.account);
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  function goBack(next: SellStep) {
    setError(null);
    setStep(next);
  }

  async function saveBank() {
    setError(null);
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
      const token = tokenOrThrow();
      const result = await verifyPayoutAccount(token, {
        accountNumber,
        bankCode,
        firstName: legalFirst.trim(),
        middleName: legalMiddle.trim(),
        lastName: legalLast.trim(),
      });
      setPayoutAccount(result.account);
      setBankEditing(false);
      setStep("publish");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the account");
    } finally {
      setBusy(false);
    }
  }

  async function doPublish() {
    setError(null);
    if (!listingId) return;
    setBusy(true);
    try {
      await saveDraftFields();
      const token = tokenOrThrow();
      const live = await publishListing(listingId, token);
      setPublished(live);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  const skipsPayout =
    sellingMode === "GIVE_AWAY" || sellingMode === "SWAP";
  const steps = skipsPayout ? STEPS.filter((item) => item !== "bank") : STEPS;
  const stepIndex = steps.indexOf(step === "done" ? "publish" : step);

  if (!ready || hydratingDraft) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--rw-bg)]">
        <Skeleton className="h-10 w-40" label="Checking session" />
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 85% 0%, rgba(14,159,110,0.14), transparent 55%), radial-gradient(ellipse 40% 35% at 5% 95%, rgba(201,162,39,0.1), transparent 50%), linear-gradient(165deg, #FAF9F7 0%, #F3F0EA 50%, #E8F5EF 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 py-8 sm:px-8">
        <header className="mb-6 flex items-center justify-end gap-4">
          <div className="flex items-center gap-3">
            {step !== "done" ? (
              <p className="text-sm text-[var(--rw-ink-muted)]">
                {STEP_LABELS[step]} · {Math.max(stepIndex, 0) + 1}/{steps.length}
              </p>
            ) : null}
          </div>
        </header>

        {step !== "done" ? (
          <div
            className="mb-8 flex gap-1.5"
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label="Sell progress"
          >
            {steps.map((s, i) => (
              <span
                key={s}
                className={[
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= stepIndex
                    ? "bg-[var(--rw-accent)]"
                    : "bg-[var(--rw-border)]",
                ].join(" ")}
              />
            ))}
          </div>
        ) : null}

        <div className="rw-fade-up flex flex-1 flex-col">
          {step === "photos" ? (
            <section aria-labelledby="sell-photos-title">
              <h1
                id="sell-photos-title"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Show the item
              </h1>
              <p className="mt-3 text-[var(--rw-ink-muted)]">
                2–6 clear photos. AI drafts the rest in about a minute.
              </p>

              <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative aspect-square overflow-hidden rounded-[var(--rw-radius)] bg-[var(--rw-bg-elevated)]"
                  >
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="h-full w-full"
                      aria-label="Remove this photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.previewUrl}
                        alt=""
                        className="pointer-events-none h-full w-full object-cover"
                      />
                    </button>
                  </div>
                ))}
                {photos.length < 6 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--rw-radius)] border border-dashed border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/70 text-sm font-medium text-[var(--rw-ink-muted)] transition hover:border-[var(--rw-accent)] hover:text-[var(--rw-accent)]"
                    aria-label="Add photos"
                  >
                    <span className="text-2xl leading-none" aria-hidden>
                      +
                    </span>
                    Add
                  </button>
                ) : null}
              </div>

              <input
                ref={fileRef}
                id={fileInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                className="sr-only"
                onChange={onPickFiles}
              />

              {photos.length === 0 ? (
                <p className="mt-6 text-sm text-[var(--rw-ink-muted)]">
                  No photos yet — add at least two to continue.
                </p>
              ) : (
                <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
                  Tap a photo to remove it.
                </p>
              )}

              {error ? (
                <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mt-10">
                <Button
                  variant="sell"
                  size="lg"
                  className="w-full"
                  disabled={busy || photos.length < 2}
                  onClick={() => void continueFromPhotos()}
                >
                  {busy ? "Uploading…" : "Continue"}
                </Button>
              </div>
            </section>
          ) : null}

          {step === "draft" ? (
            <section aria-labelledby="sell-draft-title">
              <h1
                id="sell-draft-title"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Review the details
              </h1>
              <p className="mt-3 text-[var(--rw-ink-muted)]">
                Review and edit — you stay in control.
              </p>

              {assistLoading ? (
                <div className="mt-8 space-y-4" aria-busy="true">
                  <p className="text-sm font-medium text-[var(--rw-accent)]">
                    Reading your photos…
                  </p>
                  <Skeleton className="h-10 w-full" label="Loading title" />
                  <Skeleton className="h-28 w-full" label="Loading description" />
                  <Skeleton className="h-10 w-2/3" label="Loading price" />
                  <Skeleton className="h-24 w-full" label="Loading price intel" />
                </div>
              ) : (
                <div className="mt-8 flex flex-col gap-5">
                  <Input
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="sell-desc"
                      className="text-sm font-medium"
                    >
                      Description
                    </label>
                    <textarea
                      id="sell-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Category</p>
                    {categories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categories.map((item) => (
                          <Chip
                            key={item.id}
                            selected={categoryId === item.id}
                            onClick={() => {
                              setCategoryId(item.id);
                              setCategoryName(item.name);
                            }}
                          >
                            {item.name}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <Input
                        label="Category"
                        value={categoryName}
                        onChange={(e) => {
                          setCategoryId("");
                          setCategoryName(e.target.value);
                        }}
                      />
                    )}
                  </div>
                  {(() => {
                    const catLower = categoryName.trim().toLowerCase();
                    const showVehicle =
                      catLower.includes("vehicle") ||
                      catLower.includes("car") ||
                      Boolean(listing?.vehicle);
                    if (!showVehicle) return null;
                    return (
                      <fieldset className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] p-4">
                        <legend className="px-1 text-sm font-semibold">
                          Vehicle details
                        </legend>
                        <div className="mt-3 flex flex-col gap-4">
                          <Input
                            label="Year"
                            inputMode="numeric"
                            value={vehicleYear}
                            onChange={(e) =>
                              setVehicleYear(
                                e.target.value.replace(/[^\d]/g, "").slice(0, 4),
                              )
                            }
                          />
                          <Input
                            label="Make"
                            value={vehicleMake}
                            onChange={(e) => setVehicleMake(e.target.value)}
                          />
                          <Input
                            label="Model"
                            value={vehicleModel}
                            onChange={(e) => setVehicleModel(e.target.value)}
                          />
                          <Input
                            label="Mileage (km)"
                            inputMode="numeric"
                            value={vehicleMileage}
                            onChange={(e) =>
                              setVehicleMileage(
                                e.target.value.replace(/[^\d]/g, ""),
                              )
                            }
                          />
                        </div>
                      </fieldset>
                    );
                  })()}
                  <Input
                    label="Brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                  <div>
                    <p className="mb-2 text-sm font-medium">Condition</p>
                    <div className="flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => (
                        <Chip
                          key={c}
                          selected={condition === c}
                          onClick={() => setCondition(c)}
                        >
                          {CONDITION_LABELS[c] ?? c}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">How are you listing?</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["SELL", "Sell"],
                          ["SWAP", "Swap"],
                          ["GIVE_AWAY", "Give away"],
                        ] as const
                      ).map(([value, label]) => (
                        <Chip
                          key={value}
                          selected={sellingMode === value}
                          onClick={() => setSellingMode(value)}
                        >
                          {label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {sellingMode === "SELL" ? (
                    <Input
                      label="Price per unit (₦)"
                      inputMode="numeric"
                      value={priceNaira}
                      onChange={(e) =>
                        setPriceNaira(e.target.value.replace(/[^\d]/g, ""))
                      }
                      hint={
                        priceNaira
                          ? `${formatNgn({
                              amountKobo: nairaToKobo(Number(priceNaira) || 0),
                            })} each`
                          : undefined
                      }
                    />
                  ) : null}
                  {sellingMode === "GIVE_AWAY" ? (
                    <p className="text-sm text-[var(--rw-ink-muted)]">
                      Price is ₦0.
                    </p>
                  ) : null}
                  {sellingMode === "SWAP" ? (
                    <p className="text-sm text-[var(--rw-ink-muted)]">
                      Another user sends a swap proposal for this item.
                    </p>
                  ) : null}
                  {sellingMode === "SELL" || sellingMode === "GIVE_AWAY" ? (
                    <Input
                      label={
                        sellingMode === "GIVE_AWAY"
                          ? "Units to gift"
                          : "Units available"
                      }
                      inputMode="numeric"
                      value={units}
                      onChange={(e) =>
                        setUnits(e.target.value.replace(/[^\d]/g, ""))
                      }
                      hint={
                        sellingMode === "GIVE_AWAY"
                          ? undefined
                          : "How many of this item you can sell."
                      }
                    />
                  ) : null}
                  {sellingMode === "SELL" ? (
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={negotiable}
                        onChange={(e) => setNegotiable(e.target.checked)}
                        className="h-4 w-4 accent-[var(--rw-accent)]"
                      />
                      Price is negotiable
                    </label>
                  ) : null}
                  {sellingMode !== "GIVE_AWAY" ? (
                  <div className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4">
                    <label className="flex items-start gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={donateIfUnsold}
                        onChange={(e) => setDonateIfUnsold(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-[var(--rw-accent)]"
                      />
                      <span>
                        {sellingMode === "SWAP"
                          ? "Donate if no swap offer"
                          : "Donate if unsold"}
                        <span className="mt-0.5 block font-normal text-[var(--rw-ink-muted)]">
                          {sellingMode === "SWAP"
                            ? "The listing stays live for 60 days. If nobody sends a swap offer in that time, we can hand it to a verified charity or recycler."
                            : "The listing stays live for 60 days. After the waiting period, we can hand it to a verified charity or recycler."}
                        </span>
                      </span>
                    </label>
                    {donateIfUnsold ? (
                      <label className="mt-4 block text-sm font-medium">
                        Days before hand-off
                        <input
                          type="number"
                          min={7}
                          max={59}
                          value={donateIfUnsoldDays}
                          onChange={(e) =>
                            setDonateIfUnsoldDays(
                              Math.max(
                                7,
                                Math.min(59, Number(e.target.value) || 30),
                              ),
                            )
                          }
                          className="mt-2 w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                        />
                      </label>
                    ) : null}
                  </div>
                  ) : null}

                  {priceIntel && sellingMode === "SELL" ? (
                    <aside
                      className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/80 p-4"
                      aria-label="Price sense"
                    >
                      <p className="text-sm font-semibold text-[var(--rw-ink)]">
                        Price sense
                      </p>
                      <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                        Suggested range{" "}
                        {formatNgn({
                          amountKobo: priceIntel.estimatedLowKobo,
                        })}{" "}
                        –{" "}
                        {formatNgn({
                          amountKobo: priceIntel.estimatedHighKobo,
                        })}
                      </p>
                      <p className="mt-2 text-base font-semibold text-[var(--rw-accent)]">
                        Recommended{" "}
                        {formatNgn({
                          amountKobo: priceIntel.recommendedKobo,
                        })}
                      </p>
                      {priceIntel.confidenceLabel ? (
                        <p className="mt-2 text-xs text-[var(--rw-ink-muted)]">
                          {priceIntel.confidenceLabel}
                        </p>
                      ) : null}
                    </aside>
                  ) : null}
                </div>
              )}

              {error ? (
                <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}

              {!assistLoading ? (
                <div className="mt-10 flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => goBack("photos")}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => void continueFromDraft()}
                  >
                    {busy ? "Saving…" : "Continue"}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === "location" ? (
            <section aria-labelledby="sell-loc-title">
              <h1
                id="sell-loc-title"
                className="text-3xl font-semibold tracking-tight"
              >
                Where is it?
              </h1>
              <p className="mt-3 text-[var(--rw-ink-muted)]">
                Choose a state first. Areas in that state show up after you
                select it. Buyers see the area, never your street address.
              </p>
              <label className="mt-6 block text-sm font-medium">
                State
                <select
                  value={stateKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setStateKey(key);
                    const match = [...cities, ...FALLBACK_STATES].find(
                      (item) => item.key === key,
                    );
                    setCity(match?.displayName ?? "");
                    setCommunity("");
                  }}
                  className="mt-2 w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                  disabled={busy}
                >
                  <option value="">Select a state</option>
                  {(cities.length > 0 ? cities : [...FALLBACK_STATES]).map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.displayName || item.key}
                    </option>
                  ))}
                </select>
              </label>
              {stateKey ? (
                <div className="mt-8">
                  <p className="text-sm font-medium">Area</p>
                  {areaOptions.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                      No areas are available for this state yet.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {areaOptions.map((area) => (
                        <Chip
                          key={area.value}
                          selected={community === area.value}
                          onClick={() => setCommunity(area.value)}
                        >
                          {area.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-6 text-sm text-[var(--rw-ink-muted)]">
                  Select a state to see areas such as VI and Ikoyi.
                </p>
              )}
              {error ? (
                <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-10 flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => goBack("draft")}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void continueFromLocation()}
                >
                  Continue
                </Button>
              </div>
            </section>
          ) : null}

          {step === "fulfilment" ? (
            <section aria-labelledby="sell-ful-title">
              <h1
                id="sell-ful-title"
                className="text-3xl font-semibold tracking-tight"
              >
                ReWorth delivery
              </h1>
              <p className="mt-3 text-[var(--rw-ink-muted)]">
                Buyers receive this by ReWorth delivery. The courier fee is quoted
                at checkout.
              </p>
              {error ? (
                <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-10 flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => goBack("location")}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void continueFromFulfilment()}
                >
                  Continue
                </Button>
              </div>
            </section>
          ) : null}

          {step === "bank" ? (
            <section aria-labelledby="sell-bank-title">
              <h1
                id="sell-bank-title"
                className="text-3xl font-semibold tracking-tight"
              >
                Where should we pay you?
              </h1>
              <p className="mt-3 text-[var(--rw-ink-muted)]">
                Add the bank account we should pay you into.
              </p>
              {payoutAccount && !bankEditing ? (
                <div className="mt-8 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5">
                  <p className="text-sm font-medium text-[var(--rw-ink-muted)]">
                    Saved account
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {payoutDisplayName(payoutAccount)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                    {payoutAccount.bankName} · {payoutAccount.accountNumberMasked}
                  </p>
                  <div className="mt-6 flex flex-col gap-3">
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => setStep("publish")}
                    >
                      Use these details
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        setError(null);
                        setBankEditing(true);
                      }}
                    >
                      Use a different account
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-8 flex flex-col gap-5">
                  <label className="block text-sm font-medium">
                    Bank name
                    <select
                      value={bankCode}
                      onChange={(e) => setBankCode(e.target.value)}
                      className="mt-2 w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                    >
                      <option value="">Select a bank</option>
                      {payoutBanks.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Account number"
                    inputMode="numeric"
                    value={accountNumber}
                    maxLength={10}
                    onChange={(e) =>
                      setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                  />
                  <Input
                    label="First name"
                    value={legalFirst}
                    onChange={(e) => setLegalFirst(e.target.value)}
                    autoComplete="given-name"
                  />
                  <Input
                    label="Middle name"
                    value={legalMiddle}
                    onChange={(e) => setLegalMiddle(e.target.value)}
                    hint="Optional"
                    autoComplete="additional-name"
                  />
                  <Input
                    label="Last name"
                    value={legalLast}
                    onChange={(e) => setLegalLast(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              )}
              {error ? (
                <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-10 flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => goBack("fulfilment")}
                  disabled={busy}
                >
                  Back
                </Button>
                {bankEditing || !payoutAccount ? (
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => void saveBank()}
                  >
                    {busy ? "Saving…" : "Save"}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === "publish" ? (
            <section aria-labelledby="sell-pub-title">
              <h1
                id="sell-pub-title"
                className="text-3xl font-semibold tracking-tight"
              >
                Ready to go live?
              </h1>
              <p className="mt-3 text-[var(--rw-ink-muted)]">
                {title || listing?.title || "Your listing"} ·{" "}
                {community || "Lagos"}
              </p>
              <div className="mt-8 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 p-5">
                <p className="text-2xl font-semibold">
                  {sellingMode === "GIVE_AWAY"
                    ? "Give away · ₦0"
                    : sellingMode === "SWAP"
                      ? "Swap"
                      : formatNgn({
                          amountKobo: nairaToKobo(Number(priceNaira) || 0),
                        })}
                </p>
                {negotiable && sellingMode === "SELL" ? (
                  <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                    Negotiable
                  </p>
                ) : null}
                <p className="mt-4 text-sm text-[var(--rw-ink-muted)] line-clamp-3">
                  {description}
                </p>
                {sellingMode !== "GIVE_AWAY" && payoutAccount ? (
                  <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
                    Payout · {payoutAccount.bankName}{" "}
                    {payoutAccount.accountNumberMasked}
                  </p>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
                Publishing can take a little while. We verify your photos and
                the item details before the listing goes live, so you can stay
                on this page.
              </p>
              {error ? (
                <p className="mt-4 text-sm text-[var(--rw-error)]" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-10 flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() =>
                    goBack(sellingMode === "GIVE_AWAY" ? "fulfilment" : "bank")
                  }
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  variant="sell"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void doPublish()}
                >
                  {busy ? "Publishing…" : "Publish"}
                </Button>
              </div>
            </section>
          ) : null}

          {step === "done" && published ? (
            <section aria-labelledby="sell-done-title" className="text-center">
              <p className="text-sm font-semibold text-[var(--rw-accent)]">
                {published.status === "REJECTED"
                  ? "Rejected"
                  : published.status === "UNDER_REVIEW"
                    ? "In review"
                    : "Live"}
              </p>
              <h1
                id="sell-done-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                {published.status === "REJECTED"
                  ? "Listing rejected"
                  : published.status === "UNDER_REVIEW"
                    ? "Submitted for review"
                    : "Your listing is live"}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-[var(--rw-ink-muted)]">
                {published.status === "REJECTED"
                  ? published.moderationReasons?.length
                    ? published.moderationReasons.join("; ")
                    : "Content moderation rejected this listing."
                  : `${published.title || "Listing"} is ready for Lagos buyers.`}
              </p>
              {published.status === "REJECTED" ? (
                <div className="mx-auto mt-6 max-w-md space-y-3 text-left">
                  {appealOk ? (
                    <p className="text-sm text-[var(--rw-accent)]">
                      Appeal submitted — it appears in the moderation queue.
                    </p>
                  ) : (
                    <>
                      <label className="block text-sm">
                        Appeal reason
                        <textarea
                          className="mt-1 w-full rounded-[var(--rw-radius-md)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2 text-sm"
                          rows={3}
                          value={appealReason}
                          onChange={(e) => setAppealReason(e.target.value)}
                        />
                      </label>
                      <Button
                        variant="sell"
                        disabled={appealBusy || appealReason.trim().length < 8}
                        onClick={() => {
                          void (async () => {
                            const token = tokenOrThrow();
                            setAppealBusy(true);
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
                          })();
                        }}
                      >
                        {appealBusy ? "…" : "Submit appeal"}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href={`/listings/${published.id}`}>
                  <Button variant="sell" size="lg" className="w-full sm:w-auto">
                    View listing
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setStep("photos");
                    setListingId(null);
                    setListing(null);
                    setPublished(null);
                    setPhotos([]);
                    setTitle("");
                    setDescription("");
                    setError(null);
                    setAppealOk(false);
                    setAppealReason("");
                  }}
                >
                  List another
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2">
          <Toast
            message={toast}
            tone="info"
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </main>
  );
}
