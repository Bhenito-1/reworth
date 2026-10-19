import type { Metadata } from "next";
import Link from "next/link";
import { brandPublic } from "../../lib/brand";
import "./welcome.css";

export const metadata: Metadata = {
  title: "ReWorth — Give what you own new value",
  description:
    "Unlock value from quality pre-owned items. Buy, sell, and exchange with ease on ReWorth.",
  openGraph: {
    title: "ReWorth",
    description: "Give what you own new value.",
    images: [{ url: brandPublic.landingPage }],
  },
};

export default function WelcomePage() {
  return (
    <div className="welcome-root">
      <a href="#welcome-cta" className="welcome-skip">
        Skip to get started
      </a>

      <main className="welcome-landing" aria-label="ReWorth welcome">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandPublic.landingPage}
          alt="ReWorth — Give what you own new value. Unlock value from quality pre-owned items. Buy, sell and exchange with ease."
          className="welcome-landing-img"
        />

        {/* Hotspots over baked-in CTAs / nav in landingpage.png */}
        <nav className="welcome-hotspots" aria-label="Landing actions">
          <Link
            href="/#how"
            className="welcome-hotspot welcome-hotspot-how"
            aria-label="How it works"
          >
            How It Works
          </Link>
          <Link
            href="/"
            className="welcome-hotspot welcome-hotspot-why"
            aria-label="Why ReWorth"
          >
            Why ReWorth
          </Link>
          <Link
            href="/onboarding"
            className="welcome-hotspot welcome-hotspot-nav-continue"
            aria-label="Continue"
          >
            Continue
          </Link>
          <Link
            id="welcome-cta"
            href="/onboarding"
            className="welcome-hotspot welcome-hotspot-start"
            aria-label="Get started"
          >
            Get Started
          </Link>
          <Link
            href="/"
            className="welcome-hotspot welcome-hotspot-learn"
            aria-label="Learn more — browse marketplace"
          >
            Learn More
          </Link>
          <Link
            href="/onboarding"
            className="welcome-hotspot welcome-hotspot-bar-continue"
            aria-label="Continue to ReWorth"
          >
            Continue
          </Link>
        </nav>
      </main>
    </div>
  );
}
