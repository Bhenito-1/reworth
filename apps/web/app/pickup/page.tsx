"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { sentenceCaseLabel } from "../../lib/listings";
import { getAccessToken } from "../../lib/auth";
import {
  bookManagedPickup,
  formatWatRange,
  generateWatPickupSlots,
  listMyManagedPickups,
} from "../../lib/platform-services";
import type { ManagedPickup, ManagedPickupSlot } from "../../lib/types";

export default function ManagedPickupPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<ManagedPickupSlot[]>([]);
  const [bookings, setBookings] = useState<ManagedPickup[]>([]);
  const [selected, setSelected] = useState<ManagedPickupSlot | null>(null);
  const [address, setAddress] = useState("");
  const [photoAddon, setPhotoAddon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [slotList, mine] = await Promise.all([
        Promise.resolve(generateWatPickupSlots(10)),
        listMyManagedPickups(token).catch(() => [] as ManagedPickup[]),
      ]);
      setSlots(slotList);
      setBookings(Array.isArray(mine) ? mine : []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load pickup slots",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onBook(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !selected) {
      setToast({ message: "Choose a WAT slot", tone: "warn" });
      return;
    }
    const line = address.trim();
    if (!line) {
      setToast({ message: "Enter a pickup address", tone: "warn" });
      return;
    }
    setSubmitting(true);
    try {
      await bookManagedPickup(token, {
        slotStartAt: selected.slotStartAt,
        slotEndAt: selected.slotEndAt,
        addressLine: line,
        city: "Lagos",
        photoAddon,
      });
      setToast({ message: "Pickup booked", tone: "success" });
      setSelected(null);
      setAddress("");
      setPhotoAddon(false);
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Booking failed",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32vh]"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 20% 0%, rgba(14,159,110,0.12), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/account"
            className="text-sm font-medium text-[var(--rw-ink-muted)] underline-offset-2 hover:underline"
          >
            ← Account
          </Link>
          <span className="text-xl font-semibold tracking-tight">ReWorth</span>
        </header>

        <h1 className="text-2xl font-semibold tracking-tight">
          Managed pickup
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Book a Lagos partner slot (Africa/Lagos · WAT). Optional photo add-on
          for listing capture on collection.
        </p>

        {loading ? (
          <div className="mt-8 flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <EmptyState
            title="Slots unavailable"
            description={error}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <form
              onSubmit={(e) => void onBook(e)}
              className="mt-8 flex flex-col gap-5"
            >
              <fieldset>
                <legend className="text-sm font-semibold">Available slots</legend>
                {slots.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
                    No open slots right now. Check again later.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {slots.map((slot) => {
                      const key = `${slot.slotStartAt}-${slot.slotEndAt}`;
                      const selectedKey = selected
                        ? `${selected.slotStartAt}-${selected.slotEndAt}`
                        : "";
                      const unavailable = slot.available === false;
                      return (
                        <li key={key}>
                          <label
                            className={[
                              "flex cursor-pointer items-center gap-3 rounded-[var(--rw-radius)] border px-4 py-3 text-sm",
                              key === selectedKey
                                ? "border-[var(--rw-accent)] bg-[var(--rw-accent-muted)]/40"
                                : "border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90",
                              unavailable ? "opacity-50" : "",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="slot"
                              disabled={unavailable}
                              checked={key === selectedKey}
                              onChange={() => setSelected(slot)}
                              className="accent-[var(--rw-accent)]"
                            />
                            <span>
                              {slot.label ||
                                formatWatRange(
                                  slot.slotStartAt,
                                  slot.slotEndAt,
                                )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>

              <Input
                label="Pickup address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Estate / street, Lagos"
                required
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={photoAddon}
                  onChange={(e) => setPhotoAddon(e.target.checked)}
                  className="accent-[var(--rw-accent)]"
                />
                Photo add-on (partner captures listing photos)
              </label>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting || !selected}
                >
                  {submitting ? "Booking…" : "Book pickup"}
                </Button>
                <Link href="/consign">
                  <Button type="button" variant="secondary">
                    Consign instead
                  </Button>
                </Link>
                <Link href="/room-scan">
                  <Button type="button" variant="ghost">
                    Room scan
                  </Button>
                </Link>
              </div>
            </form>

            <section className="mt-12" aria-labelledby="bookings-heading">
              <h2 id="bookings-heading" className="text-lg font-semibold">
                Your bookings
              </h2>
              {bookings.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                  No pickups booked yet.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {bookings.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]/90 px-4 py-3 text-sm"
                    >
                      <p className="font-medium">
                        {formatWatRange(b.slotStartAt, b.slotEndAt)}
                      </p>
                      <p className="mt-1 text-[var(--rw-ink-muted)]">
                        {sentenceCaseLabel(b.status)} · {b.addressLine}
                        {b.photoAddon ? " · photo add-on" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </main>
  );
}
