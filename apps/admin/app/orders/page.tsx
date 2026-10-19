"use client";

import { useState } from "react";
import { adminFetch } from "../../lib/api";
import {
  ActionButton,
  PageHeader,
  SimpleTable,
  StatusLine,
  useAdminQuery,
} from "../../components/AdminUi";
import { canSeeFinance, useAdminRoles } from "../../lib/auth";

type LifecycleStage = {
  id: string;
  label: string;
  description: string;
  state: "reached" | "current" | "upcoming" | "skipped";
};

type Res = {
  items: {
    id: string;
    status: string;
    statusLabel: string;
    totalKobo: number;
    listingTitle: string;
    buyerName: string | null;
    sellerName: string | null;
    paymentStatus: string | null;
    escrowLabel: string;
    deliveryStatus: string | null;
    lifecycle: LifecycleStage[];
  }[];
};

type Detail = {
  order: {
    id: string;
    status: string;
    statusLabel: string;
    fulfilmentMethod: string;
    totalKobo: number;
    amountKobo: number;
    protectionFeeKobo: number;
    deliveryFeeKobo: number;
    fundedAt: string | null;
    autoReleaseAt: string | null;
    completedAt: string | null;
    listing: { title: string; community: string; city: string | null };
    buyer: { id: string; displayName: string | null };
    seller: { id: string; displayName: string | null };
  };
  lifecycle: LifecycleStage[];
  escrow: {
    held: boolean;
    released: boolean;
    refunded: boolean;
    label: string;
    paymentStatus: string | null;
    payoutStatus: string | null;
  };
  payments: { id: string; status: string; reference: string; amountKobo: number }[];
  payouts: { id: string; netKobo: number; grossKobo: number; createdAt: string }[];
  refunds: { id: string; amountKobo: number; status: string; reason: string | null }[];
  events: { type: string; createdAt: string; actorUserId: string | null }[];
  deliveryShipment: {
    status: string;
    providerRef: string | null;
    events: { status: string; createdAt: string }[];
  } | null;
};

export default function OrdersPage() {
  const { data, error, loading, reload } = useAdminQuery<Res>("/admin/orders");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const finance = canSeeFinance(useAdminRoles());

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Orders"
        description="Escrow lifecycle — payment held until the buyer confirms receipt."
      />
      <StatusLine
        loading={loading}
        error={error}
        empty={!loading && !error && !data?.items.length}
      />
      {data?.items.length ? (
        <SimpleTable
          columns={[
            { key: "listingTitle", label: "Listing" },
            { key: "statusLabel", label: "Status" },
            { key: "escrowLabel", label: "Escrow" },
            { key: "totalKobo", label: "Total (kobo)" },
            { key: "buyerName", label: "Buyer" },
            { key: "sellerName", label: "Seller" },
          ]}
          rows={data.items}
          expandedId={expanded}
          onRowClick={async (row) => {
            const id = String(row.id);
            if (expanded === id) {
              setExpanded(null);
              setDetail(null);
              return;
            }
            setExpanded(id);
            setDetail(await adminFetch<Detail>(`/admin/orders/${id}`));
          }}
          renderExpanded={(row) => (
            <div className="space-y-4 text-sm">
              {detail && detail.order.id === row.id ? (
                <>
                  <div>
                    <h3 className="mb-2 font-semibold">Lifecycle</h3>
                    <ol className="space-y-1">
                      {detail.lifecycle.map((s) => (
                        <li
                          key={s.id}
                          className={
                            s.state === "current"
                              ? "font-semibold text-[var(--rw-accent)]"
                              : s.state === "reached"
                                ? "text-[var(--rw-fg)]"
                                : "text-[var(--rw-muted)]"
                          }
                        >
                          {s.state === "reached"
                            ? "✓"
                            : s.state === "current"
                              ? "●"
                              : "○"}{" "}
                          {s.label}
                          <span className="ml-2 text-xs font-normal text-[var(--rw-muted)]">
                            {s.description}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <h3 className="font-semibold">Escrow</h3>
                      <p>{detail.escrow.label}</p>
                      <p className="text-xs text-[var(--rw-muted)]">
                        Payment: {detail.escrow.paymentStatus ?? "—"} · Payout:{" "}
                        {detail.escrow.payoutStatus ?? "—"}
                      </p>
                      <p className="mt-2 text-xs">
                        Fulfilment: {detail.order.fulfilmentMethod}
                        {detail.deliveryShipment
                          ? ` · Courier: ${detail.deliveryShipment.status}`
                          : ""}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold">Parties</h3>
                      <p>
                        Buyer: {detail.order.buyer.displayName ?? detail.order.buyer.id}
                      </p>
                      <p>
                        Seller:{" "}
                        {detail.order.seller.displayName ?? detail.order.seller.id}
                      </p>
                      <p className="text-xs text-[var(--rw-muted)]">
                        Item ₦{(detail.order.amountKobo / 100).toLocaleString("en-NG")}{" "}
                        + protection ₦
                        {(detail.order.protectionFeeKobo / 100).toLocaleString("en-NG")}{" "}
                        + delivery ₦
                        {(detail.order.deliveryFeeKobo / 100).toLocaleString("en-NG")}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold">Events</h3>
                    <ul className="max-h-40 overflow-auto text-xs">
                      {detail.events.map((e, i) => (
                        <li key={`${e.type}-${i}`}>
                          {new Date(e.createdAt).toLocaleString("en-NG")} — {e.type}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {detail.payouts.length ? (
                    <div>
                      <h3 className="font-semibold">Seller payouts</h3>
                      <ul className="text-xs">
                        {detail.payouts.map((p) => (
                          <li key={p.id}>
                            Net ₦{(p.netKobo / 100).toLocaleString("en-NG")} ·{" "}
                            {new Date(p.createdAt).toLocaleString("en-NG")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[var(--rw-muted)]">Loading detail…</p>
              )}

              {finance ? (
                <ActionButton
                  label="Refund full (confirm)"
                  onClick={async () => {
                    await adminFetch(`/admin/orders/${row.id}/refund`, {
                      method: "POST",
                      body: {
                        amountKobo: row.totalKobo,
                        reason: "Admin refund",
                        confirm: true,
                      },
                    });
                    await reload();
                  }}
                />
              ) : null}
            </div>
          )}
        />
      ) : null}
    </div>
  );
}
