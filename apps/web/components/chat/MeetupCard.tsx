"use client";

import { Button, Chip } from "@reworth/ui-web";
import { offerStatusLabel, type MeetupProposalDto } from "../../lib/chat";
import { formatProposalDeliveryDate } from "../../lib/dates";
import {
  canAcceptOrRejectMeetup,
  canCounterMeetup,
  canWithdrawMeetup,
} from "../../lib/meetup-actions";
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
  meetup: MeetupProposalDto;
  meId: string;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  onWithdraw?: () => void;
  onCheckout?: () => void;
};

export function MeetupCard({
  meetup,
  meId,
  busy,
  onAccept,
  onReject,
  onCounter,
  onWithdraw,
  onCheckout,
}: Props) {
  const pending = meetup.status === "PENDING";
  const accepted = meetup.status === "ACCEPTED";
  const showRespond = canAcceptOrRejectMeetup(meetup, meId);
  const showCounter = canCounterMeetup(meetup, meId);
  const showWithdraw = canWithdrawMeetup(meetup, meId);

  return (
    <article
      className={proposalCardClass}
      aria-label={`Meetup ${offerStatusLabel(String(meetup.status))}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={proposalLabelClass}>Meetup</p>
        <Chip
          selected={pending}
          className="pointer-events-none !min-h-0 shrink-0 !px-1.5 !py-0 !text-[10px]"
        >
          {offerStatusLabel(String(meetup.status))}
        </Chip>
      </div>
      <p className={proposalBodyClass}>{meetup.locationText}</p>
      {formatProposalDeliveryDate(meetup.proposedDeliveryDate) ? (
        <p className="mt-1 text-xs text-[var(--rw-ink-muted)]">
          Date: {formatProposalDeliveryDate(meetup.proposedDeliveryDate)}
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
                Decline
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
              Suggest another
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
      {accepted && meetup.buyerId === meId && meetup.orderIntentId ? (
        <Button
          className={`${proposalBtnClass} mt-2`}
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={onCheckout}
        >
          Checkout
        </Button>
      ) : null}
    </article>
  );
}