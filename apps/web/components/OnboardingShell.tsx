import type { ReactNode } from "react";
import Link from "next/link";

type OnboardingShellProps = {
  children: ReactNode;
  step?: number;
  totalSteps?: number;
  title: string;
  subtitle?: string;
};

export function OnboardingShell({
  children,
  step,
  totalSteps = 4,
  title,
  subtitle,
}: OnboardingShellProps) {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(165deg, #FAF9F7 0%, #F5F2EC 45%, #E8F5EF 100%)",
        }}
      />
      <div
        aria-hidden
        className="rw-hero-glow pointer-events-none absolute -right-16 top-0 h-72 w-72 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(14,159,110,0.18) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-10 h-56 w-56 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(201,162,39,0.1) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-6 py-10 sm:px-8">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="group flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--rw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
          >
            <span
              className="inline-flex h-2 w-2 rounded-full bg-[var(--rw-accent)] transition-transform group-hover:scale-125"
              aria-hidden
            />
            ReWorth
          </Link>
          {step !== undefined ? (
            <p
              className="text-sm tabular-nums text-[var(--rw-ink-muted)]"
              aria-label={`Step ${step} of ${totalSteps}`}
            >
              {step} / {totalSteps}
            </p>
          ) : null}
        </header>

        {step !== undefined ? (
          <div
            className="mb-8 flex gap-1.5"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label="Onboarding progress"
          >
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={[
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  i < step ? "bg-[var(--rw-accent)]" : "bg-[var(--rw-border)]",
                ].join(" ")}
              />
            ))}
          </div>
        ) : null}

        <div className="rw-fade-up flex flex-1 flex-col">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--rw-ink)] sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--rw-ink-muted)]">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-8 flex flex-1 flex-col">{children}</div>
        </div>
      </div>
    </main>
  );
}
