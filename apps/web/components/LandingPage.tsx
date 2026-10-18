"use client";

import Link from "next/link";

const WAYS = [
  { title: "Buy", body: "Find something you want." },
  { title: "Sell", body: "List what you no longer need." },
  { title: "Swap", body: "Trade with someone else." },
  { title: "Give away", body: "Pass it on for free." },
] as const;

/**
 * Guest entry. Paper on one side, ink on the other.
 */
export function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 py-6 text-[var(--rw-ink)] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-5 flex items-center gap-2.5 px-1">
          <span
            className="h-2 w-2 rounded-full bg-[var(--rw-accent)]"
            aria-hidden
          />
          <p className="text-base font-semibold tracking-tight">ReWorth</p>
        </header>

        <div className="grid overflow-hidden rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] shadow-[var(--rw-shadow-float)] lg:grid-cols-2">
          <section className="flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-14">
            <p className="text-sm font-medium text-[var(--rw-accent)]">
              Buy, sell, swap, or give away
            </p>
            <h1 className="mt-4 max-w-[12ch] text-[2.35rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Your unused things are worth something.
            </h1>
            <p className="mt-5 max-w-sm text-[length:var(--rw-type-body)] leading-relaxed text-[var(--rw-ink-muted)]">
              A marketplace for the things you no longer need.
            </p>
            <div className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--rw-radius)] bg-[var(--rw-accent)] px-6 py-3.5 text-lg text-white hover:bg-[var(--rw-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2"
              >
                Log in
              </Link>
              <Link
                href="/onboarding"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-6 py-3.5 text-lg hover:bg-[var(--rw-accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2"
              >
                Create account
              </Link>
            </div>
          </section>

          <ul
            className="flex flex-col justify-center bg-[var(--rw-ink)] px-6 py-8 text-[var(--rw-bg)] sm:px-12 sm:py-10"
            aria-label="What you can do on ReWorth"
          >
            {WAYS.map((way, index) => (
              <li
                key={way.title}
                className="rw-fade-up border-b border-[color-mix(in_srgb,var(--rw-bg)_16%,transparent)] py-5 last:border-b-0"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <p className="text-[length:var(--rw-type-meta)] font-medium text-[var(--rw-accent)]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {way.title}
                </p>
                <p className="mt-1 text-[length:var(--rw-type-body-sm)] leading-relaxed text-[color-mix(in_srgb,var(--rw-bg)_72%,transparent)]">
                  {way.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
