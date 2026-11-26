"use client";

import { formatNgn } from "@reworth/shared";
import { Button, Chip } from "@reworth/ui-web";
import {
  canAcceptOrRejectOffer,
  canCounterOffer,
  canWithdrawOffer,
  offerProposerId,
} from "../../lib/offer-actions";
import {
  offerStatusLabel,
  type OfferDto,
} from "../../lib/chat";
import { OFFER_MULTI_UNIT_HINT_SELLER } from "../../lib/offer-copy";
import {
  proposalActionsClass,
  proposalBodyClass,
  proposalBtnClass,
  proposalCardClass,
  proposalLabelClass,
  proposalLinkActionClass,
  proposalLinkMutedClass,
  proposalPrimaryRowClass,
} from "./proposal-card";

type Props = {
  offer: OfferDto;
  meId: string;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  onWithdraw?: () => void;
};

export function OfferCard({
  offer,
  meId,
  busy,
  onAccept,
  onReject,
  onCounter,
  onWithdraw,
}: Props) {
  const isBuyer = meId === offer.buyerId;
  const pending = offer.status === "PENDING";
  const proposerId = offerProposerId(offer);
  const showRespond = canAcceptOrRejectOffer(offer, meId);
  const showCounter = canCounterOffer(offer, meId);
  const showWithdraw = canWithdrawOffer(offer, meId);
  const showSellerMultiUnitNote =
    !isBuyer && pending && showRespond && proposerId === offer.buyerId;
  const heading =
    proposerId === offer.sellerId && pending ? "Counter offer" : "Offer";

  return (
    <article
      className={proposalCardClass}
      aria-label={`Offer ${offerStatusLabel(String(offer.status))}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={proposalLabelClass}>{heading}</p>
        <Chip
          selected={pending}
          className="pointer-events-none !min-h-0 shrink-0 !px-1.5 !py-0 !text-[10px]"
        >
          {offerStatusLabel(String(offer.status))}
        </Chip>
      </div>
      <p className={`${proposalBodyClass} tabular-nums text-lg font-semibold tracking-tight`}>
        {formatNgn({ amountKobo: offer.amountKobo })}
      </p>
      {offer.note ? (
        <p className="mt-1 text-xs leading-snug text-[var(--rw-ink-muted)]">
          {offer.note}
        </p>
      ) : null}
      {showSellerMultiUnitNote ? (
        <p className="mt-1 text-xs leading-snug text-[var(--rw-ink-muted)]">
          {OFFER_MULTI_UNIT_HINT_SELLER}
        </p>
      ) : null}
      {pending ? (
        <div className={proposalActionsClass}>
          {showRespond ? (
            <div className={proposalPrimaryRowClass}>
              <Button
                variant="primary"
                size="sm"
                className={proposalBtnClass}
                disabled={busy}
                onClick={onAccept}
              >
                Accept
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`${proposalBtnClass} !border !border-[var(--rw-border)]`}
                disabled={busy}
                onClick={onReject}
              >
                Reject
              </Button>
            </div>
          ) : null}
          {showCounter ? (
            <button
              type="button"
              className={proposalLinkActionClass}
              disabled={busy}
              onClick={onCounter}
            >
              Counter
            </button>
          ) : null}
          {showWithdraw ? (
            <button
              type="button"
              className={proposalLinkMutedClass}
              disabled={busy}
              onClick={onWithdraw}
            >
              Withdraw
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}