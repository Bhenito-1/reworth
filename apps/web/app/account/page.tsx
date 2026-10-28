"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Skeleton } from "@reworth/ui-web";
import { apiFetch, ApiError } from "../../lib/api";
import {
  clearTokens,
  forceLandingRedirect,
  getAccessToken,
  getRefreshToken,
} from "../../lib/auth";
import { areaChoices, FALLBACK_AREAS, type AreaChoice } from "../../lib/areas";
import { brandPublic } from "../../lib/brand";
import { verifyNin } from "../../lib/identity";
import {
  getPayoutSetup,
  payoutDisplayName,
  type PayoutAccountView,
} from "../../lib/payout";
import { getRegion, listRegions, type RegionCity } from "../../lib/region";
import type { DeviceRow, MeResponse } from "../../lib/types";

const ACCOUNT_LINKS: {
  href: string;
  label: string;
  icon: keyof typeof brandPublic;
}[] = [
  { href: "/ask", label: "Ask ReWorth", icon: "actionChat" },
  { href: "/worth", label: "Worth", icon: "actionOffer" },
  { href: "/consign", label: "Consign", icon: "actionDelivery" },
  { href: "/account/communities", label: "Communities", icon: "invite" },
  { href: "/sell/analytics", label: "Seller analytics", icon: "actionSell" },
  { href: "/pro", label: "Pro seller", icon: "verifiedSeller" },
  { href: "/corporate", label: "Corporate", icon: "movingSale" },
  { href: "/partner", label: "Partner", icon: "identityChecked" },
  { href: "/referrals", label: "Referrals", icon: "invite" },
  { href: "/orders", label: "Orders", icon: "actionBuy" },
  { href: "/room-scan", label: "Room scan", icon: "actionSave" },
];

function VerificationBadges({
  levels,
  identityBadge,
}: {
  levels: MeResponse["verificationLevels"];
  identityBadge: boolean;
}) {
  const items = [
    { key: "L1", label: "L1 Phone", ok: levels.L1_PHONE },
    { key: "L2", label: "L2 Email", ok: levels.L2_EMAIL },
    {
      key: "L3",
      label: identityBadge ? "L3 Identity Verified ✓" : "L3 Identity",
      ok: levels.L3_IDENTITY,
    },
  ];

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Verification status">
      {items.map((item) => (
        <li key={item.key}>
          <span
            className={[
              "inline-flex items-center rounded-[var(--rw-radius)] px-3 py-1.5 text-sm font-medium",
              item.ok
                ? "bg-[var(--rw-success-muted)] text-[var(--rw-success)]"
                : "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink-muted)] border border-[var(--rw-border)]",
            ].join(" ")}
          >
            {item.label}
            {item.ok && item.key !== "L3" ? " ✓" : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [community, setCommunity] = useState("");
  const [cities, setCities] = useState<RegionCity[]>([]);
  const [city, setCity] = useState("");
  const [areas, setAreas] = useState<AreaChoice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [payout, setPayout] = useState<PayoutAccountView | null>(null);
  const [nin, setNin] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [profile, deviceRes, regions, payoutSetup] = await Promise.all([
        apiFetch<MeResponse>("/me", { token }),
        apiFetch<{ devices: DeviceRow[] }>("/me/devices", { token }),
        listRegions().catch(() => [] as RegionCity[]),
        getPayoutSetup(token).catch(() => ({ account: null })),
      ]);
      setMe(profile);
      setPayout(payoutSetup.account);
      setDisplayName(profile.profile?.displayName ?? "");
      const pref = profile.profile?.preferredCommunity?.trim() ?? "";
      setCommunity(pref);
      setDevices(deviceRes.devices);
      setCities(regions);
      let matched = "";
      for (const region of regions) {
        const detail = await getRegion(region.key).catch(() => null);
        const source =
          detail?.areas && detail.areas.length > 0
            ? detail.areas
            : (FALLBACK_AREAS[region.key] ?? []);
        if (pref && areaChoices(region.key, source).some((area) => area.value === pref)) {
          matched = region.key;
          break;
        }
      }
      setCity(matched || regions[0]?.key || "");
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Could not load account.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!city) {
      setAreas([]);
      return;
    }
    let cancelled = false;
    void getRegion(city)
      .then((detail) => {
        if (cancelled) return;
        const source =
          detail?.areas && detail.areas.length > 0
            ? detail.areas
            : (FALLBACK_AREAS[city] ?? []);
        setAreas(areaChoices(city, source));
      })
      .catch(() => {
        if (!cancelled) setAreas(areaChoices(city, FALLBACK_AREAS[city] ?? []));
      });
    return () => {
      cancelled = true;
    };
  }, [city]);

  const savedName = (me?.profile?.displayName ?? "").trim();
  const savedCommunity = (me?.profile?.preferredCommunity ?? "").trim();
  const areaChanged =
    community.trim().length > 0 && community.trim() !== savedCommunity;
  const profileDirty = displayName.trim() !== savedName || areaChanged;

  async function onVerifyNin(e: FormEvent) {
    e.preventDefault();
    setVerifyError(null);
    const token = getAccessToken();
    if (!token || me?.verificationLevels.L3_IDENTITY) return;
    const digits = nin.replace(/\D/g, "");
    if (!/^\d{11}$/.test(digits)) {
      setVerifyError("Enter your 11-digit NIN.");
      return;
    }
    setVerifyBusy(true);
    try {
      const result = await verifyNin(token, digits);
      setNin("");
      if (!result.identityVerifiedBadge) {
        setVerifyError("Identity check was not approved.");
        return;
      }
      setMe((current) =>
        current
          ? {
              ...current,
              identityVerifiedBadge: true,
              verificationLevels: {
                ...current.verificationLevels,
                L3_IDENTITY: true,
              },
            }
          : current,
      );
    } catch (err) {
      setNin("");
      setVerifyError(
        err instanceof ApiError ? err.message : "Identity check failed.",
      );
    } finally {
      setVerifyBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const token = getAccessToken();
    if (!token) return;

    if (!profileDirty) return;
    const name = displayName.trim();
    if (!name) {
      setSaveError("Display name is required");
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<MeResponse>("/me", {
        method: "PATCH",
        token,
        body: {
          displayName: name,
          ...(community.trim()
            ? { preferredCommunity: community.trim() }
            : {}),
        },
      });
      setMe(updated);
      setSaveOk(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setBusyAction("logout");
    const refreshToken = getRefreshToken();
    const leaving = window.location.pathname !== "/";
    clearTokens();
    void apiFetch("/auth/logout", {
      method: "POST",
      keepalive: true,
      body: refreshToken ? { refreshToken } : {},
    }).catch(() => undefined);
    if (leaving) window.location.replace("/");
  }

  async function requestDelete() {
    const token = getAccessToken();
    if (!token) return;
    if (
      !window.confirm(
        "Request account deletion? This signs you out and queues deletion.",
      )
    ) {
      return;
    }
    setBusyAction("delete");
    try {
      await apiFetch("/me/delete-request", { method: "POST", token });
      forceLandingRedirect();
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : "Could not request deletion.",
      );
      setBusyAction(null);
    }
  }

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 100% 0%, rgba(217,106,50,0.1), transparent 50%), linear-gradient(180deg, #FCFAF6, #F3F0EA)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 py-10 sm:px-8">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandPublic.logo} alt="ReWorth" className="h-8 w-auto" />
          </Link>
          <h1 className="text-sm font-medium text-[var(--rw-ink-muted)]">
            Account
          </h1>
        </header>

        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading account">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : loadError ? (
          <EmptyState
            title="Couldn’t load account"
            description={loadError}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : me ? (
          <div className="flex flex-col gap-10">
            <section
              className="flex items-center gap-4"
              aria-labelledby="account-hero"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandPublic.profileAvatar}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
              <div className="min-w-0">
                <h2
                  id="account-hero"
                  className="text-2xl font-semibold tracking-tight"
                >
                  {me.profile?.displayName ?? "Member"}
                </h2>
                <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                  {me.profile?.preferredCommunity ?? "Lagos"}
                  {me.identityVerifiedBadge ? " · Verified" : ""}
                </p>
              </div>
              {me.identityVerifiedBadge ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandPublic.verified}
                  alt="Verified"
                  className="ml-auto h-7 w-7"
                />
              ) : null}
            </section>

            <nav
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              aria-label="Account modules"
            >
              {ACCOUNT_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-w-0 items-center gap-2 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-3 text-sm font-semibold leading-tight text-[var(--rw-ink)] transition hover:border-[var(--rw-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brandPublic[item.icon]}
                    alt=""
                    className="h-7 w-7 shrink-0 object-contain"
                  />
                  <span className="min-w-0">{item.label}</span>
                </Link>
              ))}
            </nav>

            <section aria-labelledby="profile-heading">
              <h2
                id="profile-heading"
                className="mb-4 text-lg font-semibold tracking-tight"
              >
                Profile
              </h2>
              <form
                onSubmit={onSave}
                className="flex flex-col gap-6 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-6"
                noValidate
              >
                <Input
                  label="Display name"
                  name="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={saving}
                  required
                />
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  State
                  <select
                    className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setCommunity("");
                    }}
                    disabled={saving}
                  >
                    <option value="">Select a state</option>
                    {cities.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.displayName || c.key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Preferred area
                  <select
                    className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                    value={areas.some((area) => area.value === community) ? community : ""}
                    onChange={(e) => setCommunity(e.target.value)}
                    disabled={saving || !city}
                  >
                    <option value="">
                      {city ? "Select an area" : "Select a state first"}
                    </option>
                    {areas.map((area) => (
                      <option key={area.value} value={area.value}>
                        {area.label}
                      </option>
                    ))}
                  </select>
                </label>
                {saveError ? (
                  <p className="text-sm text-[var(--rw-error)]" role="alert">
                    {saveError}
                  </p>
                ) : null}
                {saveOk ? (
                  <p className="text-sm text-[var(--rw-success)]" role="status">
                    Profile saved.
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || !profileDirty}
                  aria-busy={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </form>
            </section>

            <section aria-labelledby="verify-heading">
              <h2
                id="verify-heading"
                className="mb-3 text-lg font-semibold tracking-tight"
              >
                Verification
              </h2>
              <VerificationBadges
                levels={me.verificationLevels}
                identityBadge={me.identityVerifiedBadge}
              />
              <div className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-6">
                {me.verificationLevels.L3_IDENTITY ? (
                  <p className="text-sm text-[var(--rw-ink)]">
                    Your NIN is verified. You are an L3 member.
                  </p>
                ) : (
                  <form onSubmit={onVerifyNin} className="flex flex-col gap-4" noValidate>
                    <Input
                      label="National Identification Number (NIN)"
                      name="nin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={11}
                      value={nin}
                      onChange={(e) => setNin(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      disabled={verifyBusy}
                      hint="11 digits. ReWorth keeps a hash of this number, not the number itself."
                    />
                    {verifyError ? (
                      <p className="text-sm text-[var(--rw-error)]" role="alert">
                        {verifyError}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={verifyBusy || nin.length !== 11}
                      aria-busy={verifyBusy}
                    >
                      {verifyBusy ? "Checking…" : "Verify identity"}
                    </Button>
                  </form>
                )}
              </div>
            </section>

            <section aria-labelledby="bank-heading">
              <h2
                id="bank-heading"
                className="mb-4 text-lg font-semibold tracking-tight"
              >
                Bank details
              </h2>
              {payout ? (
                <dl className="grid gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-6 text-sm">
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Name on account</dt>
                    <dd className="mt-0.5 font-medium">{payoutDisplayName(payout)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Bank</dt>
                    <dd className="mt-0.5 font-medium">{payout.bankName}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rw-ink-muted)]">Account number</dt>
                    <dd className="mt-0.5 font-medium tracking-wide">
                      {payout.accountNumberMasked}
                    </dd>
                  </div>
                </dl>
              ) : (
                <EmptyState
                  title="No bank account yet"
                  description="Bank details appear here after you save a payout account while selling."
                />
              )}
            </section>

            <section aria-labelledby="devices-heading">
              <h2
                id="devices-heading"
                className="mb-4 text-lg font-semibold tracking-tight"
              >
                Devices
              </h2>
              {!devices?.length ? (
                <EmptyState
                  title="No active devices"
                  description="Devices appear here after you sign in."
                />
              ) : (
                <ul className="divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]">
                  {devices.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-col gap-0.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{d.name}</p>
                        <p className="text-sm text-[var(--rw-ink-muted)]">
                          {d.platform} · last seen{" "}
                          {new Date(d.lastSeenAt).toLocaleString("en-NG")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="danger-heading"
              className="flex flex-col gap-3 border-t border-[var(--rw-border)] pt-8"
            >
              <h2 id="danger-heading" className="sr-only">
                Session and account
              </h2>
              <Button
                variant="secondary"
                onClick={() => void signOut()}
                disabled={busyAction !== null}
                aria-busy={busyAction === "logout"}
              >
                {busyAction === "logout" ? "Signing out…" : "Sign out"}
              </Button>
              <Button
                variant="danger"
                onClick={() => void requestDelete()}
                disabled={busyAction !== null}
                aria-busy={busyAction === "delete"}
              >
                {busyAction === "delete"
                  ? "Requesting…"
                  : "Request account deletion"}
              </Button>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
