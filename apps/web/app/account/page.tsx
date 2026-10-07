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
import { getRegion, listRegions, type RegionCity } from "../../lib/region";
import type { DeviceRow, MeResponse } from "../../lib/types";

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

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [profile, deviceRes, regions] = await Promise.all([
        apiFetch<MeResponse>("/me", { token }),
        apiFetch<{ devices: DeviceRow[] }>("/me/devices", { token }),
        listRegions().catch(() => [] as RegionCity[]),
      ]);
      setMe(profile);
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

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const token = getAccessToken();
    if (!token) return;

    const name = displayName.trim();
    if (!name) {
      setSaveError("Display name is required");
      return;
    }
    if (!city) {
      setSaveError("Select your state");
      return;
    }
    if (!community || !areas.some((area) => area.value === community)) {
      setSaveError("Select a preferred area in that state");
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<MeResponse>("/me", {
        method: "PATCH",
        token,
        body: {
          displayName: name,
          preferredCommunity: community,
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
            "radial-gradient(ellipse 60% 40% at 100% 0%, rgba(14,159,110,0.1), transparent 50%), linear-gradient(180deg, #FAF9F7, #F3F0EA)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 py-10 sm:px-8">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
          <nav
            aria-label="Account tools"
            className="mt-4 flex flex-wrap gap-x-4 gap-y-2"
          >
            <Link
              href="/ask"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Ask ReWorth
            </Link>
            <Link
              href="/room-scan"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Room scan
            </Link>
            <Link
              href="/worth"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Worth
            </Link>
            <Link
              href="/consign"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Consign
            </Link>
            <Link
              href="/pickup"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Pickup
            </Link>
            <Link
              href="/account/communities"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Communities
            </Link>
            <Link
              href="/sell/analytics"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Seller analytics
            </Link>
            <Link
              href="/pro"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Pro seller
            </Link>
            <Link
              href="/corporate"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Corporate
            </Link>
            <Link
              href="/partner"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Partner
            </Link>
            <Link
              href="/referrals"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Referrals
            </Link>
            <Link
              href="/inventory"
              className="text-sm font-medium text-[var(--rw-accent)] underline-offset-2 hover:underline"
            >
              Inventory
            </Link>
          </nav>
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
            </section>

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
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </form>
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
