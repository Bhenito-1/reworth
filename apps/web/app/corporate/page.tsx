"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import { Button, EmptyState, Input, Skeleton, Toast } from "@reworth/ui-web";
import { ApiError } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  applyCorporate,
  completeRelocationProject,
  createRelocationProject,
  downloadRelocationInvoice,
  getMyCorporate,
  getRelocationProject,
  intakeRelocationItems,
  listRelocationProjects,
  PROJECT_STATUS_ORDER,
  projectStatusLabel,
  type CorporateAccount,
  type RelocationProject,
} from "../../lib/corporate";
import { listRegions, type RegionCity } from "../../lib/region";

export default function CorporatePage() {
  const router = useRouter();
  const [account, setAccount] = useState<CorporateAccount | null>(null);
  const [projects, setProjects] = useState<RelocationProject[]>([]);
  const [selected, setSelected] = useState<RelocationProject | null>(null);
  const [cities, setCities] = useState<RegionCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "info" | "success" | "warn" | "error";
  } | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [billingContact, setBillingContact] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  const [projTitle, setProjTitle] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [cityFrom, setCityFrom] = useState("Lagos");
  const [cityTo, setCityTo] = useState("Lagos");
  const [intakeText, setIntakeText] = useState("");

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [me, regions] = await Promise.all([
        getMyCorporate(token),
        listRegions().catch(() => [] as RegionCity[]),
      ]);
      setAccount(me);
      setCities(regions);
      if (me && ["APPROVED", "ACTIVE"].includes(String(me.status))) {
        const list = await listRelocationProjects(token);
        setProjects(list);
      } else {
        setProjects([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load corporate workspace",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onApply(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    if (!companyName.trim() || !billingContact.trim() || !billingEmail.trim()) {
      setToast({ message: "Company, contact, and email are required", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const res = await applyCorporate(token, {
        companyName: companyName.trim(),
        billingContact: billingContact.trim(),
        billingEmail: billingEmail.trim(),
      });
      setAccount(res);
      setToast({ message: "Application submitted", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Apply failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onCreateProject(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    if (!projTitle.trim() || !employeeName.trim() || !deadline) {
      setToast({ message: "Title, employee, and deadline required", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const created = await createRelocationProject(token, {
        title: projTitle.trim(),
        employeeName: employeeName.trim(),
        deadline: new Date(deadline).toISOString(),
        cityFrom,
        cityTo,
      });
      setProjects((prev) => [created, ...prev]);
      setSelected(created);
      setProjTitle("");
      setEmployeeName("");
      setDeadline("");
      setToast({ message: "Project created", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Create failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function openProject(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      const detail = await getRelocationProject(token, id);
      setSelected(detail);
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not load project",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onIntake(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !selected) return;
    const lines = intakeText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      setToast({ message: "Add at least one item title (one per line)", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const updated = await intakeRelocationItems(token, selected.id, {
        items: lines.map((title) => ({ title })),
      });
      setSelected(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setIntakeText("");
      setToast({ message: `Intake saved · ${lines.length} item(s)`, tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Intake failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    const token = getAccessToken();
    if (!token || !selected) return;
    setBusy(true);
    try {
      const updated = await completeRelocationProject(token, selected.id);
      setSelected(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setToast({ message: "Project marked complete", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Complete failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onInvoice() {
    const token = getAccessToken();
    if (!token || !selected) return;
    setBusy(true);
    try {
      await downloadRelocationInvoice(
        token,
        selected.id,
        selected.invoiceNumber
          ? `${selected.invoiceNumber}.pdf`
          : undefined,
      );
      setToast({ message: "Invoice download started", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Invoice unavailable",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const workspaceReady =
    account && ["APPROVED", "ACTIVE"].includes(String(account.status));

  const timelineStatuses = PROJECT_STATUS_ORDER;
  const currentIdx = selected
    ? timelineStatuses.indexOf(selected.status as (typeof timelineStatuses)[number])
    : -1;

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-8">
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
          Corporate relocation
        </h1>
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">
          Bulk dispose of household or office assets with a coordinator
          workspace — intake, list, fulfil, report, invoice.
        </p>

        {loading ? (
          <div className="mt-8 space-y-4" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="mt-8">
            <EmptyState
              title="Couldn’t load workspace"
              description={error}
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            <section
              className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5"
              aria-labelledby="corp-status"
            >
              <h2 id="corp-status" className="text-lg font-semibold">
                Account
              </h2>
              {account ? (
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="text-[var(--rw-ink-muted)]">Company · </span>
                    <span className="font-medium">{account.companyName}</span>
                  </p>
                  <p>
                    <span className="text-[var(--rw-ink-muted)]">Status · </span>
                    <span className="font-medium">{account.status}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                  Apply for a corporate account to open the relocation workspace.
                </p>
              )}
            </section>

            {!account || account.status === "REJECTED" ? (
              <section aria-labelledby="corp-apply">
                <h2 id="corp-apply" className="text-lg font-semibold">
                  Apply
                </h2>
                <form
                  onSubmit={onApply}
                  className="mt-4 flex flex-col gap-4"
                  noValidate
                >
                  <Input
                    label="Company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <Input
                    label="Billing contact"
                    value={billingContact}
                    onChange={(e) => setBillingContact(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <Input
                    label="Billing email"
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {busy ? "Submitting…" : "Submit application"}
                  </Button>
                </form>
              </section>
            ) : null}

            {account &&
            ["APPLIED"].includes(String(account.status)) ? (
              <p className="text-sm text-[var(--rw-ink-muted)]" role="status">
                Application pending ops review. You’ll unlock projects once
                approved.
              </p>
            ) : null}

            {workspaceReady ? (
              <>
                <section aria-labelledby="corp-projects">
                  <h2 id="corp-projects" className="text-lg font-semibold">
                    Projects
                  </h2>
                  {!projects.length ? (
                    <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">
                      No relocation projects yet.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-[var(--rw-border)] rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)]">
                      {projects.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-[var(--rw-accent-muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                            onClick={() => void openProject(p.id)}
                          >
                            <span className="font-medium">{p.title}</span>
                            <span className="text-sm text-[var(--rw-ink-muted)]">
                              {p.employeeName} · {projectStatusLabel(p.status)} ·{" "}
                              {p.cityFrom} → {p.cityTo}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="corp-create">
                  <h2 id="corp-create" className="text-lg font-semibold">
                    Create project
                  </h2>
                  <form
                    onSubmit={onCreateProject}
                    className="mt-4 flex flex-col gap-4"
                    noValidate
                  >
                    <Input
                      label="Title"
                      value={projTitle}
                      onChange={(e) => setProjTitle(e.target.value)}
                      hint="e.g. Lekki → Abuja — Adeola move"
                      required
                      disabled={busy}
                    />
                    <Input
                      label="Employee name"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      required
                      disabled={busy}
                    />
                    <Input
                      label="Deadline"
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      required
                      disabled={busy}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        From city
                        <select
                          className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-base"
                          value={cityFrom}
                          onChange={(e) => setCityFrom(e.target.value)}
                          disabled={busy}
                        >
                          {(cities.length
                            ? cities
                            : [{ key: "Lagos", displayName: "Lagos" }]
                          ).map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.displayName || c.key}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        To city
                        <select
                          className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-3 py-2.5 text-base"
                          value={cityTo}
                          onChange={(e) => setCityTo(e.target.value)}
                          disabled={busy}
                        >
                          {(cities.length
                            ? cities
                            : [{ key: "Lagos", displayName: "Lagos" }]
                          ).map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.displayName || c.key}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <Button type="submit" variant="primary" disabled={busy}>
                      Create project
                    </Button>
                  </form>
                </section>

                {selected ? (
                  <section
                    className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-5"
                    aria-labelledby="corp-detail"
                  >
                    <h2 id="corp-detail" className="text-lg font-semibold">
                      {selected.title}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--rw-ink-muted)]">
                      {selected.employeeName} ·{" "}
                      {projectStatusLabel(selected.status)}
                    </p>

                    <ol className="mt-6 flex flex-wrap gap-2" aria-label="Timeline">
                      {timelineStatuses.map((s, i) => {
                        const done = currentIdx >= 0 && i <= currentIdx;
                        return (
                          <li
                            key={s}
                            className={[
                              "rounded-[var(--rw-radius)] px-2.5 py-1 text-xs font-medium",
                              done
                                ? "bg-[var(--rw-accent-muted)] text-[var(--rw-ink)]"
                                : "border border-[var(--rw-border)] text-[var(--rw-ink-muted)]",
                            ].join(" ")}
                          >
                            {projectStatusLabel(s)}
                          </li>
                        );
                      })}
                    </ol>

                    {selected.items?.length ? (
                      <ul className="mt-6 space-y-1 text-sm">
                        {selected.items.map((item) => (
                          <li key={item.id}>
                            {item.title}
                            {item.listingId ? (
                              <Link
                                href={`/listings/${item.listingId}`}
                                className="ml-2 text-[var(--rw-accent)] underline-offset-2 hover:underline"
                              >
                                listing
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {["DRAFT", "INTAKE"].includes(String(selected.status)) ? (
                      <form onSubmit={onIntake} className="mt-6 space-y-3">
                        <label
                          htmlFor="intake-items"
                          className="block text-sm font-medium"
                        >
                          Intake items (one title per line)
                        </label>
                        <textarea
                          id="intake-items"
                          rows={6}
                          value={intakeText}
                          onChange={(e) => setIntakeText(e.target.value)}
                          disabled={busy}
                          placeholder={"55 TV\n3-seater sofa\nDining table"}
                          className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
                        />
                        <Button type="submit" variant="primary" disabled={busy}>
                          Save intake
                        </Button>
                      </form>
                    ) : null}

                    {selected.completionReport ? (
                      <div className="mt-6 rounded-[var(--rw-radius)] border border-[var(--rw-border)] p-4 text-sm">
                        <p className="font-semibold">Completion report</p>
                        <ul className="mt-2 space-y-1 text-[var(--rw-ink-muted)]">
                          {selected.completionReport.itemsTotal != null ? (
                            <li>
                              Items · {selected.completionReport.itemsTotal}
                            </li>
                          ) : null}
                          {selected.completionReport.itemsSold != null ? (
                            <li>Sold · {selected.completionReport.itemsSold}</li>
                          ) : null}
                          {selected.completionReport.itemsDonated != null ? (
                            <li>
                              Donated · {selected.completionReport.itemsDonated}
                            </li>
                          ) : null}
                          {selected.completionReport.gmvKobo != null ? (
                            <li>
                              GMV ·{" "}
                              {formatNgn({
                                amountKobo: selected.completionReport.gmvKobo,
                              })}
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-3">
                      {selected.status !== "COMPLETED" &&
                      selected.status !== "CANCELLED" ? (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void onComplete()}
                        >
                          Mark complete
                        </Button>
                      ) : null}
                      {selected.status === "COMPLETED" ||
                      selected.invoiceNumber ||
                      selected.invoicePdfKey ? (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() => void onInvoice()}
                        >
                          Download invoice
                        </Button>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
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
