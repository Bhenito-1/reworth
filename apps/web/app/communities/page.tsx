"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { sentenceCaseLabel } from "../../lib/listings";
import { getAccessToken } from "../../lib/auth";
import {
  listEstateCommunities,
  redeemCommunityInvite,
  type EstateCommunity,
} from "../../lib/estate-communities";

export default function CommunitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<EstateCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await listEstateCommunities({ limit: 50 }, token);
      setItems(res.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load communities",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRedeem(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setToast("Sign in to redeem an invite");
      router.push("/");
      return;
    }
    const code = inviteCode.trim();
    if (!code) {
      setToast("Enter an invite code");
      return;
    }
    setRedeemBusy(true);
    try {
      const membership = await redeemCommunityInvite(token, code);
      setToast("Invite redeemed — welcome");
      setInviteCode("");
      router.push(`/account/communities`);
      void membership;
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Redeem failed");
    } finally {
      setRedeemBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-end gap-4">
          <Link
            href="/account/communities"
            className="text-sm font-medium text-[var(--rw-accent)]"
          >
            My communities
          </Link>
        </header>

        <section className="rw-fade-up">
          <h1 className="text-3xl font-semibold tracking-tight">
            Estate communities
          </h1>
          <p className="mt-2 text-[var(--rw-ink-muted)]">
            Browse nearby estate and group marketplaces — verified members,
            local trust.
          </p>
        </section>

        <form
          onSubmit={(e) => void onRedeem(e)}
          className="mt-8 flex flex-col gap-3 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <Input
              label="Have an invite code?"
              name="inviteCode"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Paste code"
              disabled={redeemBusy}
            />
          </div>
          <Button type="submit" variant="primary" disabled={redeemBusy}>
            {redeemBusy ? "Redeeming…" : "Redeem"}
          </Button>
        </form>

        <section className="mt-10" aria-labelledby="comm-list">
          <h2 id="comm-list" className="text-lg font-semibold">
            Near you
          </h2>
          {loading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-20 w-full rounded-[var(--rw-radius-lg)]"
                  label="Loading community"
                />
              ))}
            </div>
          ) : error ? (
            <div className="mt-4">
              <EmptyState
                title="Couldn’t load communities"
                description={error}
                action={
                  <Button variant="secondary" onClick={() => void load()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--rw-ink-muted)]">
              No communities listed yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]">
              {items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/communities/${c.slug}`}
                    className="flex flex-col gap-1 px-4 py-4 hover:bg-[var(--rw-accent-muted)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold">
                        {c.name}
                        {c.verified ? (
                          <span className="ml-2 text-xs font-medium text-[var(--rw-accent)]">
                            Verified
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-[var(--rw-ink-muted)]">
                        {sentenceCaseLabel(c.type)} · {sentenceCaseLabel(c.privacy)}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-[var(--rw-accent)]">
                      View →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </main>
  );
}
