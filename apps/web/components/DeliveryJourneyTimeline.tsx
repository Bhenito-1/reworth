import {
  DELIVERY_JOURNEY_STEPS,
  formatDeliveryEta,
  journeyStepIndex,
  type DeliveryShipment,
} from "../lib/delivery";

type Props = {
  shipment: DeliveryShipment;
  role: "buyer" | "seller";
};

export function DeliveryJourneyTimeline({ shipment, role }: Props) {
  const current = journeyStepIndex(shipment.status);
  const failed = shipment.status === "FAILED";
  const eta = formatDeliveryEta(shipment.etaFrom, shipment.etaTo);

  return (
    <section
      className="rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4"
      aria-label={`Delivery journey · ${shipment.status}`}
    >
      <h2 className="text-base font-semibold text-[var(--rw-ink)]">
        Your delivery
      </h2>
      <p className="mt-1 text-sm font-semibold text-[var(--rw-accent)]">{eta}</p>
      {failed ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {shipment.failureReason?.trim() ||
            "Something went wrong with delivery. Open a dispute from this order if needed."}
        </p>
      ) : null}

      <ol className="mt-4 space-y-0">
        {DELIVERY_JOURNEY_STEPS.map((step, index) => {
          const done = !failed && index < current;
          const active = !failed && index === current;
          const upcoming = failed || index > current;
          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex w-4 flex-col items-center">
                <span
                  className={[
                    "mt-1 h-3 w-3 rounded-full border-2",
                    done || active
                      ? "border-[var(--rw-accent)] bg-[var(--rw-accent)]"
                      : "border-[var(--rw-border)] bg-[var(--rw-bg)]",
                    active ? "scale-110" : "",
                  ].join(" ")}
                />
                {index < DELIVERY_JOURNEY_STEPS.length - 1 ? (
                  <span
                    className={[
                      "my-1 w-0.5 flex-1",
                      done ? "bg-[var(--rw-accent)]" : "bg-[var(--rw-border)]",
                    ].join(" ")}
                  />
                ) : null}
              </div>
              <div className="min-h-14 flex-1 pb-4">
                <p
                  className={[
                    "text-sm font-semibold",
                    upcoming
                      ? "text-[var(--rw-ink-muted)]"
                      : "text-[var(--rw-ink)]",
                  ].join(" ")}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--rw-ink-muted)]">
                  {role === "buyer" ? step.buyerHint : step.sellerHint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {shipment.events?.length ? (
        <div className="mt-2 border-t border-[var(--rw-border)] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
            Updates
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--rw-ink-muted)]">
            {shipment.events
              .slice()
              .reverse()
              .slice(0, 4)
              .map((e) => (
                <li key={e.id}>
                  {new Date(e.createdAt).toLocaleString("en-NG")} ·{" "}
                  {e.status.replace(/_/g, " ")}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
