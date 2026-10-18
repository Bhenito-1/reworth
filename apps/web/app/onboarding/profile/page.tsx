"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@reworth/ui-web";
import { OnboardingShell } from "../../../components/OnboardingShell";
import { apiFetch, ApiError } from "../../../lib/api";
import { areaChoices, FALLBACK_AREAS, FALLBACK_STATES, type AreaChoice } from "../../../lib/areas";
import { getAccessToken } from "../../../lib/auth";
import { getRegion, listRegions, type RegionCity } from "../../../lib/region";
import type { MeResponse } from "../../../lib/types";

const selectClass =
  "w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-sm text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]";

export default function OnboardingProfilePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [states, setStates] = useState<RegionCity[]>([...FALLBACK_STATES]);
  const [stateKey, setStateKey] = useState("");
  const [areas, setAreas] = useState<AreaChoice[]>([]);
  const [community, setCommunity] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    apiFetch<MeResponse>("/me", { token })
      .then((me) => {
        if (me.profile?.displayName) setDisplayName(me.profile.displayName);
        if (me.profile?.bio) setBio(me.profile.bio);
        const pref = me.profile?.preferredCommunity?.trim();
        if (pref) setCommunity(pref);
      })
      .catch(() => {
        /* keep empty form */
      })
      .finally(() => setBooting(false));
    void listRegions()
      .then((regions) => {
        if (regions.length > 0) setStates(regions);
      })
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    if (!stateKey) {
      setAreas([]);
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
        setAreas(areaChoices(stateKey, source));
      })
      .catch(() => {
        if (!cancelled) setAreas(areaChoices(stateKey, FALLBACK_AREAS[stateKey] ?? []));
      });
    return () => {
      cancelled = true;
    };
  }, [stateKey]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const name = displayName.trim();
    if (name.length < 1) {
      setError("Choose a display name");
      return;
    }
    if (!stateKey) {
      setError("Select your state");
      return;
    }
    if (!community || !areas.some((area) => area.value === community)) {
      setError("Select a preferred area in that state");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }

    setLoading(true);
    try {
      await apiFetch<MeResponse>("/me", {
        method: "PATCH",
        token,
        body: {
          displayName: name,
          preferredCommunity: community,
          bio: bio.trim() || null,
        },
      });
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save profile.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <OnboardingShell step={3} totalSteps={3} title="Your profile" subtitle="Loading…">
        <p className="text-[var(--rw-ink-muted)]" role="status">
          Loading…
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={3}
      totalSteps={3}
      title="Customise your profile"
      subtitle="Name, bio, and the area you want to shop in."
    >
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-8" noValidate>
        <Input
          label="Display name"
          name="displayName"
          autoComplete="nickname"
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={loading}
          required
        />

        <Input
          label="Bio (optional)"
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          disabled={loading}
          hint="A short line about you"
        />

        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--rw-ink)]">
          State
          <select
            className={selectClass}
            value={stateKey}
            disabled={loading}
            onChange={(e) => {
              setStateKey(e.target.value);
              setCommunity("");
            }}
          >
            <option value="">Select a state</option>
            {states.map((item) => (
              <option key={item.key} value={item.key}>
                {item.displayName || item.key}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--rw-ink)]">
          Preferred area
          <select
            className={selectClass}
            value={areas.some((area) => area.value === community) ? community : ""}
            disabled={loading || !stateKey}
            onChange={(e) => setCommunity(e.target.value)}
          >
            <option value="">
              {stateKey ? "Select an area" : "Select a state first"}
            </option>
            {areas.map((area) => (
              <option key={area.value} value={area.value}>
                {area.label}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p className="text-sm text-[var(--rw-error)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Saving…" : "Enter ReWorth"}
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}
