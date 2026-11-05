"use client";

import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../../lib/api";

export default function SupportPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setError("");
    const form = new FormData(formElement);
    try {
      await apiFetch<{ success: boolean }>("/support", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          message: form.get("message"),
        },
      });
      setSubmitted(true);
      formElement.reset();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many requests. Please wait a moment and try again."
          : "We couldn’t send your request. Please try again shortly.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] px-4 pb-8 pt-4 text-[var(--rw-ink)]">
        <div className="mx-auto max-w-2xl">
          <section className="rounded-3xl border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5 shadow-sm sm:p-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--rw-accent)]">We’re here to help</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Contact support</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--rw-ink-muted)]">
              Tell us what you need help with. Our team will reply to your email.
            </p>

            {submitted ? (
              <div role="status" className="mt-7 rounded-2xl bg-[var(--rw-accent-muted)] p-5 text-sm leading-6">
                Your request has been sent. We’ll get back to you by email as soon as we can.
                <button type="button" onClick={() => setSubmitted(false)} className="mt-3 block font-semibold text-[var(--rw-accent)] underline">
                  Send another request
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="support-name" className="mb-1.5 block text-sm font-medium">Your name</label>
                  <input id="support-name" name="name" required minLength={1} maxLength={100} autoComplete="name" className="min-h-12 w-full rounded-xl border border-[var(--rw-border)] bg-white px-4 text-sm outline-none focus:border-[var(--rw-accent)] focus:ring-2 focus:ring-[var(--rw-accent)]/20" />
                </div>
                <div>
                  <label htmlFor="support-email" className="mb-1.5 block text-sm font-medium">Email address</label>
                  <input id="support-email" name="email" type="email" required maxLength={254} autoComplete="email" className="min-h-12 w-full rounded-xl border border-[var(--rw-border)] bg-white px-4 text-sm outline-none focus:border-[var(--rw-accent)] focus:ring-2 focus:ring-[var(--rw-accent)]/20" />
                </div>
                <div>
                  <label htmlFor="support-message" className="mb-1.5 block text-sm font-medium">How can we help?</label>
                  <textarea id="support-message" name="message" required minLength={10} maxLength={5000} rows={4} className="w-full resize-y rounded-xl border border-[var(--rw-border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--rw-accent)] focus:ring-2 focus:ring-[var(--rw-accent)]/20" />
                  <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">Please include at least 10 characters.</p>
                </div>
                {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
                <button type="submit" disabled={submitting} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--rw-accent)] px-5 text-sm font-semibold text-[var(--rw-on-accent)] hover:bg-[var(--rw-accent-hover)] disabled:cursor-wait disabled:opacity-60">
                  {submitting ? "Sending…" : "Send support request"}
                </button>
              </form>
            )}
          </section>
        </div>
    </main>
  );
}
