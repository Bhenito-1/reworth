"use client";

import Link from "next/link";
import { brandPublic } from "../lib/brand";

/**
 * Guest entry — full composition from brand/landingpage.png.
 */
export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-white">
      <a
        href="#landing-cta"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--rw-accent)] focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to get started
      </a>

      <main
        className="relative mx-auto w-full max-w-5xl bg-white"
        aria-label="ReWorth welcome"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandPublic.landingPage}
          alt="ReWorth — Give what you own new value. Unlock value from quality pre-owned items."
          className="pointer-events-none block h-auto w-full select-none"
        />

        <nav className="absolute inset-0 z-10" aria-label="Landing actions">
          <Link
            href="/onboarding"
            id="landing-cta"
            className="absolute left-[5.5%] top-[32%] h-[4.5%] w-[14%] overflow-hidden rounded-full text-[0px] text-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rw-accent)]"
            aria-label="Get started"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="absolute left-[82%] top-[2.4%] h-[4.2%] w-[12%] overflow-hidden rounded-full text-[0px] text-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rw-accent)]"
            aria-label="Continue — log in"
          >
            Continue
          </Link>
          <Link
            href="/onboarding"
            className="absolute left-[21%] top-[32%] h-[4.5%] w-[13%] overflow-hidden rounded-full text-[0px] text-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rw-accent)]"
            aria-label="Learn more — create account"
          >
            Learn More
          </Link>
          <Link
            href="/onboarding"
            className="absolute left-[72%] top-[78.5%] h-[4.2%] w-[14%] overflow-hidden rounded-full text-[0px] text-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rw-accent)]"
            aria-label="Continue to ReWorth"
          >
            Continue
          </Link>
        </nav>
      </main>
    </div>
  );
}
