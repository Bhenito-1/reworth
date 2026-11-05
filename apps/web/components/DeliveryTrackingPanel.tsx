"use client";

import Link from "next/link";
import {
  formatDeliveryEta,
  shipmentStatusLabel,
  type DeliveryShipment,
} from "../lib/delivery";

type Corridor = {
  sellerLabel: string;
  buyerLabel: string;
  distanceKm: number | null;
};

type Props = {
  shipment: DeliveryShipment;
  corridor: Corridor;
  role: "buyer" | "seller";
  orderId: string;
  canDispute?: boolean;
};

/**
 * Delivery journey D3 — web companion (corridor summary + help; no live GPS).
 */
export function DeliveryTrackingPanel({
  shipment,
  corridor,
  role,
  orderId,
  canDispute,
}: Props) {
  const eta = formatDeliveryEta(shipment.etaFrom, shipment.etaTo);
  const failed = shipment.status === "FAILED";

  return (
    <section
      className="mt-4 rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
      aria-label="Delivery map and help"
    >
      <h2 className="text-base font-semibold text-[var(--rw-ink)]">
        Map & help
      </h2>
      <p className="mt-1 text-sm font-medium text-[var(--rw-accent)]">
        {shipmentStatusLabel(shipment.status)} · {eta}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
            Seller corridor
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--rw-ink)]">
            {corridor.sellerLabel}
          </p>
        </div>
        <div className="rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
            {role === "buyer" ? "Your area" : "Buyer corridor"}
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--rw-ink)]">
            {corridor.buyerLabel}
          </p>
        </div>
      </div>

      {corridor.distanceKm != null ? (
        <p className="mt-3 text-xs text-[var(--rw-ink-muted)]">
          About {corridor.distanceKm.toFixed(1)} km corridor · exact homes stay
          private (PRD §20). Live rider GPS comes later.
        </p>
      ) : (
        <p className="mt-3 text-xs text-[var(--rw-ink-muted)]">
          Exact homes stay private. Live rider GPS comes later — status updates
          stay on your order timeline.
        </p>
      )}

      <div className="mt-4 rounded-[var(--rw-radius)] border border-[var(--rw-border)] bg-[var(--rw-bg)] px-3 py-3">
        <p className="text-sm font-semibold text-[var(--rw-ink)]">
          {failed ? "Delivery needs attention" : "Item not moving?"}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--rw-ink-muted)]">
          {failed
            ? shipment.failureReason?.trim() ||
              "Payment stays protected until this is resolved."
            : "If nothing changes for a full day after “Rider assigned”, open a dispute from this order."}
        </p>
        {canDispute ? (
          <Link
            href={`/orders/${orderId}?dispute=1`}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[var(--rw-radius)] bg-[var(--rw-ink)] px-4 text-sm font-semibold text-white"
          >
            Open a dispute
          </Link>
        ) : null}
      </div>
    </section>
  );
}
