"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError, apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";

type ConsentChannel = "MARKETING" | "EMAIL";

type ConsentRow = {
  channel: ConsentChannel;
  granted: boolean;
  updatedAt: string | null;
};

const CHANNEL_LABEL: Record<ConsentChannel, string> = {
  MARKETING: "Marketing messages",
  EMAIL: "Email updates",
};

export default function PrivacySettingsPage() {
  const router = useRouter();
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      const res = await apiFetch<{ consents: ConsentRow[] }>("/me/consents", {
        token,
      });
      setConsents(res.consents);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleConsent(channel: ConsentChannel, granted: boolean) {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await apiFetch<{ consents: ConsentRow[] }>("/me/consents", {
        method: "PUT",
        token,
        body: { consents: [{ channel, granted }] },
      });
      setConsents(res.consents);
      setToast({ message: "Consent updated", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Update failed",
        tone: "error",
      });
    }
  }

  async function exportData() {
    const token = getAccessToken();
    if (!token) return;
    setExporting(true);
    try {
      const dump = await apiFetch<Record<string, unknown>>("/me/export", {
        token,
      });
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reworth-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ message: "Export downloaded", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Export failed",
        tone: "error",
      });
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    const ok = window.confirm(
      "Permanently delete your ReWorth account? Orders are retained in anonymised form.",
    );
    if (!ok) return;
    const token = getAccessToken();
    if (!token) return;
    setDeleting(true);
    try {
      await apiFetch("/me/delete-request", { method: "POST", token });
      setToast({ message: "Account deleted", tone: "success" });
      router.replace("/");
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Delete failed",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-sm text-neutral-500">
        <Link href="/settings/notifications" className="underline">
          Notification settings
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl tracking-tight text-neutral-900">
        Privacy
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Export your data, manage marketing consents, or delete your account
        (NDPR).
      </p>

      {loading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="mt-8 text-sm text-red-700">{error}</p>
      ) : (
        <section className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Consents
          </h2>
          {consents.map((row) => (
            <label
              key={row.channel}
              className="flex items-center justify-between gap-4 border-b border-neutral-200 py-3"
            >
              <span className="text-sm text-neutral-800">
                {CHANNEL_LABEL[row.channel]}
              </span>
              <input
                type="checkbox"
                checked={row.granted}
                onChange={(e) =>
                  void toggleConsent(row.channel, e.target.checked)
                }
                aria-label={CHANNEL_LABEL[row.channel]}
              />
            </label>
          ))}
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Your data
        </h2>
        <Button
          type="button"
          onClick={() => void exportData()}
          disabled={exporting}
        >
          {exporting ? "Preparing…" : "Download my data"}
        </Button>
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void deleteAccount()}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </section>

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
