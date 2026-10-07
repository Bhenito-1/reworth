"use client";

import Link from "next/link";
import { Button } from "@reworth/ui-web";
import { OnboardingShell } from "../../components/OnboardingShell";
import { brandPublic } from "../../lib/brand";

const STEPS = [
  {
    title: "Sell fast",
    body: "Photograph an item, get an AI draft, and go live in about a minute.",
    icon: brandPublic.actionSell,
  },
  {
    title: "Local trust",
    body: "Trade with verified neighbours across Lekki, Ikoyi, VI, and nearby estates.",
    icon: brandPublic.verifiedSeller,
  },
  {
    title: "AI listing",
    body: "Titles, prices, and categories suggested for Lagos — you stay in control.",
    icon: brandPublic.actionOffer,
  },
];

/** New-user registration intro — email only. */
export default function OnboardingWelcomePage() {
  return (
    <OnboardingShell
      step={1}
      totalSteps={3}
      title="Create your ReWorth"
      subtitle="Lagos, your unused things are worth something."
      illustration={brandPublic.onboarding}
      illustrationAlt=""
    >
      <ol className="flex flex-col gap-5">
        {STEPS.map((item, index) => (
          <li
            key={item.title}
            className="rw-fade-up flex gap-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)]/70 bg-[var(--rw-bg-elevated)]/70 px-4 py-4 backdrop-blur-sm"
            style={{ animationDelay: `${0.08 * (index + 1)}s` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.icon}
              alt=""
              className="h-9 w-9 shrink-0 object-contain"
            />
            <div>
              <h2 className="text-base font-semibold text-[var(--rw-ink)] sm:text-lg">
                {item.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--rw-ink-muted)]">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-auto flex flex-col gap-3 pt-10">
        <Link href="/onboarding/email" className="block">
          <Button
            variant="primary"
            size="lg"
            className="w-full shadow-[var(--rw-shadow-sell)]"
            aria-label="Continue with email"
          >
            Continue with email
          </Button>
        </Link>
        <p className="text-center text-sm text-[var(--rw-ink-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--rw-accent)]">
            Log in
          </Link>
        </p>
        <Link
          href="/"
          className="text-center text-sm font-medium text-[var(--rw-ink-muted)] transition-colors hover:text-[var(--rw-ink)]"
        >
          Back
        </Link>
      </div>
    </OnboardingShell>
  );
}
