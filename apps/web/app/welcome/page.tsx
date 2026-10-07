import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { brandPublic } from "../../lib/brand";
import "./welcome.css";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-welcome",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReWorth — Lagos, your unused things are worth something",
  description:
    "Buy, sell, swap, or give away locally in Lagos. Photograph an item and list it in about 60 seconds — with buyer protection and trusted meetups.",
  openGraph: {
    title: "ReWorth",
    description: "Lagos, your unused things are worth something.",
    images: [{ url: brandPublic.landingPage }],
  },
};

export default function WelcomePage() {
  return (
    <div className={`${display.variable} welcome-root`}>
      <a href="#how" className="welcome-skip">
        Skip to content
      </a>

      {/* ── Hero: brand asset `landing-page.png` as full-bleed plane ── */}
      <header className="welcome-hero">
        <div className="welcome-hero-media" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brandPublic.landingPage}
            alt=""
            className="welcome-hero-img"
          />
          <div className="welcome-hero-veil" />
        </div>

        <nav className="welcome-nav">
          <Link href="/welcome" className="welcome-nav-brand">
            ReWorth
          </Link>
          <div className="welcome-nav-actions">
            <Link href="/" className="welcome-link-quiet">
              Browse
            </Link>
            <Link href="/onboarding" className="welcome-btn-secondary">
              Sign in
            </Link>
          </div>
        </nav>

        <div className="welcome-hero-copy">
          <p className="welcome-brand-mark welcome-anim-1">ReWorth</p>
          <h1 className="welcome-headline welcome-anim-2">
            Lagos, your unused things are worth something.
          </h1>
          <p className="welcome-lede welcome-anim-3">
            Buy · sell · swap · give away — trusted recommerce for Lekki, Ikoyi,
            Victoria Island, and nearby estates.
          </p>
          <div className="welcome-cta welcome-anim-4">
            <Link href="/onboarding" className="welcome-btn-primary">
              Get started
            </Link>
            <Link href="/sell" className="welcome-btn-ghost">
              Start selling
            </Link>
          </div>
          <p className="welcome-platforms welcome-anim-5">
            Primary on iOS &amp; Android · Web companion for browse &amp; checkout
          </p>
        </div>
      </header>

      {/* ── How it works ── */}
      <section id="how" className="welcome-section welcome-how">
        <div className="welcome-section-inner">
          <p className="welcome-eyebrow">Sell in about 60 seconds</p>
          <h2 className="welcome-section-title">
            Photograph it. List it. Get it gone.
          </h2>
          <p className="welcome-section-lede">
            AI helps draft your listing from a photo — then neighbours nearby can
            offer, chat, and meet safely.
          </p>

          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-num">1</span>
              <div>
                <h3>Snap</h3>
                <p>Take a photo of what you no longer need.</p>
              </div>
            </li>
            <li>
              <span className="welcome-step-num">2</span>
              <div>
                <h3>Polish</h3>
                <p>ReWorth drafts title, price range, and details.</p>
              </div>
            </li>
            <li>
              <span className="welcome-step-num">3</span>
              <div>
                <h3>Go live</h3>
                <p>Publish to your community — buy, swap, or give away.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* ── Trust ── */}
      <section className="welcome-section welcome-trust" aria-labelledby="trust-heading">
        <div className="welcome-section-inner">
          <p className="welcome-eyebrow">Built on trust</p>
          <h2 id="trust-heading" className="welcome-section-title">
            Protection that feels local, not corporate.
          </h2>
          <p className="welcome-section-lede">
            Escrow-shaped payments, verified sellers, and safe meetup guidance —
            so Lagos recommerce feels premium, not like a classifieds dump.
          </p>

          <ul className="welcome-trust-row">
            {(
              [
                [brandPublic.buyerProtection, "Buyer protection"],
                [brandPublic.securePayment, "Secure payment"],
                [brandPublic.verifiedSeller, "Verified sellers"],
                [brandPublic.safeMeetup, "Safe meetups"],
              ] as const
            ).map(([src, label]) => (
              <li key={label}>
                <Image src={src} alt="" width={72} height={72} />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Place ── */}
      <section className="welcome-section welcome-place">
        <div className="welcome-place-grid">
          <div className="welcome-place-copy">
            <p className="welcome-eyebrow">Lagos-first</p>
            <h2 className="welcome-section-title">
              Your estate. Your radius. Your things.
            </h2>
            <p className="welcome-section-lede">
              Discover near Lekki, Ikoyi, VI, Oniru, VGC, Chevron, Ajah — and expand
              city by city without losing the neighbourhood feel.
            </p>
            <Link href="/" className="welcome-btn-primary">
              Browse Lagos listings
            </Link>
          </div>
          <div className="welcome-place-visual">
            <Image
              src={brandPublic.onboarding}
              alt="ReWorth onboarding — list unused items from your phone"
              width={720}
              height={900}
              className="welcome-place-img"
              sizes="(max-width: 768px) 100vw, 44vw"
            />
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="welcome-close">
        <div className="welcome-close-inner">
          <Image
            src={brandPublic.logo}
            alt=""
            width={120}
            height={32}
            className="welcome-close-logo"
          />
          <h2 className="welcome-close-title">Ready when you are.</h2>
          <p className="welcome-close-lede">
            Join ReWorth and turn what you are not using into someone&apos;s next
            favourite find.
          </p>
          <div className="welcome-cta">
            <Link href="/onboarding" className="welcome-btn-primary">
              Create your account
            </Link>
            <Link href="/sell" className="welcome-btn-ghost welcome-btn-ghost-on-navy">
              List an item
            </Link>
          </div>
        </div>
      </section>

      <footer className="welcome-footer">
        <p>© {new Date().getFullYear()} ReWorth</p>
        <nav aria-label="Footer">
          <Link href="/">Marketplace</Link>
          <Link href="/ask">Ask ReWorth</Link>
          <Link href="/onboarding">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
