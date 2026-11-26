import type { MeetupProposalDto } from "./chat";

/** Who submitted this meetup row (opening suggestion or counter). */
export function meetupProposerId(meetup: MeetupProposalDto): string {
  if (meetup.proposedByUserId) return meetup.proposedByUserId;
  return meetup.parentId ? meetup.sellerId : meetup.buyerId;
}

export function meetupRecipientId(meetup: MeetupProposalDto): string {
  const proposer = meetupProposerId(meetup);
  return proposer === meetup.buyerId ? meetup.sellerId : meetup.buyerId;
}

export function canAcceptOrRejectMeetup(
  meetup: MeetupProposalDto,
  meId: string,
): boolean {
  return meetup.status === "PENDING" && meId === meetupRecipientId(meetup);
}

export function canCounterMeetup(
  meetup: MeetupProposalDto,
  meId: string,
): boolean {
  if (meetup.status !== "PENDING") return false;
  return meId !== meetupProposerId(meetup);
}

export function canWithdrawMeetup(
  meetup: MeetupProposalDto,
  meId: string,
): boolean {
  return (
    meetup.status === "PENDING" &&
    meId === meetup.buyerId &&
    meetup.parentId == null &&
    meetupProposerId(meetup) === meetup.buyerId
  );
}