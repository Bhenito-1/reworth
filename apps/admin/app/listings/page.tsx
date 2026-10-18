"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../../lib/api";
import {
  ActionButton,
  PageHeader,
  SimpleTable,
  StatusLine,
  useAdminQuery,
} from "../../components/AdminUi";

type ListRes = {
  items: {
    id: string;
    title: string;
    status: string;
    priceKobo: number;
    community: string;
    sellerName: string | null;
    riskFlags: string[];
    moderationDecision: string | null;
    imageScore: number | null;
    riskScore: number | null;
  }[];
};

type DetailRes = {
  listing: {
    id: string;
    title: string;
    description: string;
    status: string;
    priceKobo: number;
    condition: string;
    brand: string | null;
    model: string | null;
    city: string | null;
    riskFlags: string[];
    category: { name: string; slug: string } | null;
    seller: {
      id: string;
      displayName: string | null;
      email: string | null;
      riskScore: number;
    };
    images: {
      id: string;
      status: string;
      sortOrder: number;
      variants: { original?: string; w640?: { webp?: string } };
      originalKey: string;
      sizeBytes: number | null;
    }[];
  };
  latestModeration: {
    id: string;
    listingId: string;
    imageScore: number;
    riskScore: number;
    riskLevel: string;
    signals: unknown;
    decision: string;
    policyViolations: string[];
    rejectionReason: string | null;
    imageFitScore: number;
    readyImageCount: number;
    detail: unknown;
    assessedAt: string;
  } | null;
  moderationHistory: DetailRes["latestModeration"][];
  riskAssessments: {
    id: string;
    level: string;
    score: number;
    rulesFired: unknown;
    createdAt: string;
  }[];
};

const TABS = [
  { id: "UNDER_REVIEW", label: "Under review" },
  { id: "LIVE", label: "Live listings" },
  { id: "REMOVED", label: "Removed" },
  { id: "REJECTED", label: "Rejected" },
  { id: "DRAFT", label: "Draft" },
] as const;

const TAB_HINT: Record<(typeof TABS)[number]["id"], string> = {
  UNDER_REVIEW:
    "Listings that needed a check as soon as they were published.",
  LIVE: "On the marketplace. Remove or flag one to hide it until you decide.",
  REMOVED:
    "Hidden from buyers. Put it back on the marketplace, or reject it.",
  REJECTED: "Closed. No further action.",
  DRAFT: "Not published yet.",
};

function imageSrc(
  img: DetailRes["listing"]["images"][number],
): string | null {
  const v = img.variants;
  if (!v) return null;
  return (
    v.w640?.webp ??
    (typeof v.original === "string" ? v.original : null) ??
    null
  );
}

export default function ListingsPage() {
  const [status, setStatus] = useState("UNDER_REVIEW");
  const { data, error, loading, reload } = useAdminQuery<ListRes>(
    `/admin/listings?status=${status}`,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailRes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    setMessage("");
    setDecisionError(null);
  }, [expanded]);

  async function openDetail(id: string) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    setDetail(null);
    setDetailError(null);
    if (!next) return;
    setDetailLoading(true);
    try {
      const res = await adminFetch<DetailRes>(`/admin/listings/${id}`);
      setDetail(res);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Listings"
        description="Under review is the publish queue. Live listings can be taken off the marketplace. Removed listings can go back up or be rejected."
      />
      <div className="sticky top-0 z-10 -mx-6 mb-4 border-b border-[var(--rw-border)] bg-[var(--rw-bg)] px-6 pb-3 sm:-mx-8 sm:px-8">
        <div
          className="flex gap-2 overflow-x-auto"
          role="tablist"
          aria-label="Listing status"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={status === tab.id}
              className={`shrink-0 rounded-[var(--rw-radius)] px-3 py-1.5 text-sm ${
                status === tab.id
                  ? "bg-[var(--rw-accent)] text-white"
                  : "border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]"
              }`}
              onClick={() => setStatus(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-sm text-[var(--rw-muted)]">
        {TAB_HINT[status as (typeof TABS)[number]["id"]]}
      </p>
      <StatusLine
        loading={loading}
        error={error}
        empty={!loading && !error && !data?.items.length}
      />
      {data?.items.length ? (
        <SimpleTable
          columns={[
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "moderationDecision", label: "Decision" },
            { key: "imageScore", label: "Image" },
            { key: "riskScore", label: "Risk" },
            { key: "sellerName", label: "Seller" },
          ]}
          rows={data.items}
          expandedId={expanded}
          onRowClick={(row) => void openDetail(String(row.id))}
          renderExpanded={(row) => {
            const listingStatus = String(row.status);
            const canDecide =
              listingStatus === "UNDER_REVIEW" || listingStatus === "REMOVED";
            const onMarketplace = listingStatus === "LIVE";
            return (
            <div className="space-y-4">
              {canDecide ? (
              <form
                className="space-y-2"
                onSubmit={(event) => event.preventDefault()}
              >
                <label
                  htmlFor={`review-note-${row.id}`}
                  className="block text-sm font-medium"
                >
                  Message to the seller
                </label>
                <textarea
                  id={`review-note-${row.id}`}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={
                    listingStatus === "REMOVED"
                      ? "Tell them why this is going back up, or why it is rejected."
                      : "Tell them why this was approved or rejected."
                  }
                  className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2 text-sm"
                />
                {decisionError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {decisionError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                <ActionButton
                  label={
                    deciding
                      ? "Sending…"
                      : listingStatus === "REMOVED"
                        ? "Put back"
                        : "Approve"
                  }
                  variant="primary"
                  onClick={async () => {
                    setDecisionError(null);
                    setDeciding(true);
                    try {
                      await adminFetch(`/admin/listings/${row.id}/approve`, {
                        method: "POST",
                        body: { note: message.trim() || undefined },
                      });
                      setMessage("");
                      await reload();
                    } catch (err) {
                      setDecisionError(
                        err instanceof Error ? err.message : "Could not approve",
                      );
                    } finally {
                      setDeciding(false);
                    }
                  }}
                />
                <ActionButton
                  label="Reject"
                  onClick={async () => {
                    const reason = message.trim();
                    if (reason.length < 3) {
                      setDecisionError(
                        "Write at least a short reason before rejecting.",
                      );
                      return;
                    }
                    setDecisionError(null);
                    setDeciding(true);
                    try {
                      await adminFetch(`/admin/listings/${row.id}/reject`, {
                        method: "POST",
                        body: { reason },
                      });
                      setMessage("");
                      await reload();
                    } catch (err) {
                      setDecisionError(
                        err instanceof Error ? err.message : "Could not reject",
                      );
                    } finally {
                      setDeciding(false);
                    }
                  }}
                />
                </div>
              </form>
              ) : null}
              {onMarketplace ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => event.preventDefault()}
                >
                  <label
                    htmlFor={`hold-note-${row.id}`}
                    className="block text-sm font-medium"
                  >
                    Reason for a flag
                  </label>
                  <textarea
                    id={`hold-note-${row.id}`}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Required when you flag a listing. Remove can stay blank."
                    className="w-full rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-2 text-sm"
                  />
                  {decisionError ? (
                    <p className="text-sm text-red-600" role="alert">
                      {decisionError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      label="Remove from marketplace"
                      onClick={async () => {
                        setDecisionError(null);
                        try {
                          await adminFetch(`/admin/listings/${row.id}/remove`, {
                            method: "POST",
                          });
                          setMessage("");
                          setExpanded(null);
                          setStatus("REMOVED");
                        } catch (err) {
                          setDecisionError(
                            err instanceof Error ? err.message : "Could not remove",
                          );
                        }
                      }}
                    />
                    <ActionButton
                      label="Flag and hold"
                      variant="primary"
                      onClick={async () => {
                        const reason = message.trim();
                        if (reason.length < 3) {
                          setDecisionError(
                            "Write a short reason before flagging this listing.",
                          );
                          return;
                        }
                        setDecisionError(null);
                        try {
                          await adminFetch(`/admin/listings/${row.id}/flag`, {
                            method: "POST",
                            body: { reason },
                          });
                          setMessage("");
                          setExpanded(null);
                          setStatus("REMOVED");
                        } catch (err) {
                          setDecisionError(
                            err instanceof Error ? err.message : "Could not flag",
                          );
                        }
                      }}
                    />
                    <ActionButton
                      label="Feature 7d"
                      onClick={async () => {
                        await adminFetch(`/admin/listings/${row.id}/feature`, {
                          method: "POST",
                          body: { days: 7, feeKobo: 0 },
                        });
                        await reload();
                      }}
                    />
                    <ActionButton
                      label="Extend +14d"
                      onClick={async () => {
                        await adminFetch(`/admin/listings/${row.id}/extend-expiry`, {
                          method: "POST",
                          body: { days: 14 },
                        });
                        await reload();
                      }}
                    />
                  </div>
                </form>
              ) : null}

              {detailLoading ? (
                <p className="text-sm text-[var(--rw-muted)]">Loading detail…</p>
              ) : null}
              {detailError ? (
                <p className="text-sm text-red-600">{detailError}</p>
              ) : null}

              {detail && detail.listing.id === row.id ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <h3 className="font-semibold">Listing</h3>
                    <p>
                      <span className="text-[var(--rw-muted)]">Title:</span>{" "}
                      {detail.listing.title}
                    </p>
                    <p>
                      <span className="text-[var(--rw-muted)]">Category:</span>{" "}
                      {detail.listing.category?.name ?? "—"}
                    </p>
                    <p>
                      <span className="text-[var(--rw-muted)]">Price:</span>{" "}
                      ₦{(detail.listing.priceKobo / 100).toLocaleString("en-NG")}
                    </p>
                    <p>
                      <span className="text-[var(--rw-muted)]">Condition:</span>{" "}
                      {detail.listing.condition}
                    </p>
                    <p>
                      <span className="text-[var(--rw-muted)]">Seller:</span>{" "}
                      {detail.listing.seller.displayName ?? "—"} (risk{" "}
                      {detail.listing.seller.riskScore})
                    </p>
                    <p className="whitespace-pre-wrap text-[var(--rw-muted)]">
                      {detail.listing.description}
                    </p>
                    {detail.listing.riskFlags?.length ? (
                      <p>
                        Flags: {detail.listing.riskFlags.join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2 text-sm">
                    <h3 className="font-semibold">Moderation outcome</h3>
                    {detail.latestModeration ? (
                      <>
                        <p>
                          Decision:{" "}
                          <strong>{detail.latestModeration.decision}</strong>
                        </p>
                        <p>
                          Image score: {detail.latestModeration.imageScore} · Fit:{" "}
                          {detail.latestModeration.imageFitScore} · Ready photos:{" "}
                          {detail.latestModeration.readyImageCount}
                        </p>
                        <p>
                          Risk score: {detail.latestModeration.riskScore} (
                          {detail.latestModeration.riskLevel})
                        </p>
                        {detail.latestModeration.rejectionReason ? (
                          <p className="text-red-700">
                            Rejection: {detail.latestModeration.rejectionReason}
                          </p>
                        ) : null}
                        {detail.latestModeration.policyViolations?.length ? (
                          <p>
                            Violations:{" "}
                            {detail.latestModeration.policyViolations.join(", ")}
                          </p>
                        ) : (
                          <p>No policy violations</p>
                        )}
                        <p className="text-xs text-[var(--rw-muted)]">
                          Signals:{" "}
                          {Array.isArray(detail.latestModeration.signals)
                            ? detail.latestModeration.signals.join(", ")
                            : JSON.stringify(detail.latestModeration.signals)}
                        </p>
                        <p className="text-xs text-[var(--rw-muted)]">
                          Assessed{" "}
                          {new Date(
                            detail.latestModeration.assessedAt,
                          ).toLocaleString("en-NG")}
                        </p>
                      </>
                    ) : (
                      <p className="text-[var(--rw-muted)]">
                        No ListingModeration record yet.
                      </p>
                    )}

                    {detail.riskAssessments?.length ? (
                      <div className="pt-2">
                        <h4 className="font-medium">Risk assessments</h4>
                        <ul className="list-disc pl-4">
                          {detail.riskAssessments.map((r) => (
                            <li key={r.id}>
                              {r.level} · score {r.score} ·{" "}
                              {new Date(r.createdAt).toLocaleString("en-NG")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="md:col-span-2">
                    <h3 className="mb-2 font-semibold">Images</h3>
                    <div className="flex flex-wrap gap-3">
                      {detail.listing.images.length === 0 ? (
                        <p className="text-sm text-[var(--rw-muted)]">
                          No images attached
                        </p>
                      ) : (
                        detail.listing.images.map((img) => {
                          const src = imageSrc(img);
                          return (
                            <div
                              key={img.id}
                              className="w-36 overflow-hidden rounded border border-[var(--rw-border)]"
                            >
                              {src ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={src}
                                  alt=""
                                  className="h-28 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-28 items-center justify-center bg-[var(--rw-surface)] text-xs text-[var(--rw-muted)]">
                                  No URL
                                </div>
                              )}
                              <div className="p-1 text-[10px] leading-tight">
                                {img.status} · {img.sizeBytes ?? 0}b
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            );
          }}
        />
      ) : null}
    </div>
  );
}
