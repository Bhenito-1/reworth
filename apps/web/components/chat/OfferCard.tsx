"use client";

import { formatNgn } from "@reworth/shared";
import { Button, Chip } from "@reworth/ui-web";
import {
  offerStatusLabel,
  type OfferDto,
} from "../../lib/chat";

type Props = {
  offer: OfferDto;
  meId: string;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  onWithdraw?: () => void;
  onCheckout?: () => void;
};

export function OfferCard({
  offer,
  meId,
  busy,
  onAccept,
  onReject,
  onCounter,
  onWithdraw,
  onCheckout,
}: Props) {
  const isSeller = meId === offer.sellerId;
  const isBuyer = meId === offer.buyerId;
  const pending = offer.status === "PENDING";
  const accepted = offer.status === "ACCEPTED";

  return (
    <article
      className="w-full min-w-0 max-w-sm rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] p-4 shadow-sm"
      aria-label={`Offer ${offerStatusLabel(String(offer.status))}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--rw-ink-muted)]">
            Offer
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatNgn({ amountKobo: offer.amountKobo })}
          </p>
        </div>
        <Chip selected={pending} className="pointer-events-none shrink-0">
          {offerStatusLabel(String(offer.status))}
        </Chip>
      </div>
      {offer.note ? (
        <p className="mt-2 text-sm text-[var(--rw-ink-muted)]">{offer.note}</p>
      ) : null}
      {pending ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {isSeller ? (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={onAccept}
              >
                Accept
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={onReject}
              >
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onCounter}
              >
                Counter
              </Button>
            </>
          ) : null}
          {isBuyer ? (
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={onWithdraw}
            >
              Withdraw
            </Button>
          ) : null}
        </div>
      ) : null}
      {accepted && isBuyer && onCheckout ? (
        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={onCheckout}
          >
            Checkout
          </Button>
        </div>
      ) : null}
    </article>
  );
}
