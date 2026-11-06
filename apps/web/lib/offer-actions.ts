import type { OfferDto } from "./chat";

/** Who submitted this offer row (opening bid or counter). */
export function offerProposerId(offer: OfferDto): string {
  if (offer.proposedByUserId) return offer.proposedByUserId;
  return offer.parentOfferId ? offer.sellerId : offer.buyerId;
}

export function offerRecipientId(offer: OfferDto): string {
  const proposer = offerProposerId(offer);
  return proposer === offer.buyerId ? offer.sellerId : offer.buyerId;
}

export function canWithdrawOffer(offer: OfferDto, meId: string): boolean {
  return (
    offer.status === "PENDING" &&
    meId === offer.buyerId &&
    offer.parentOfferId == null &&
    offerProposerId(offer) === offer.buyerId
  );
}

export function canCounterOffer(offer: OfferDto, meId: string): boolean {
  if (offer.status !== "PENDING") return false;
  const proposer = offerProposerId(offer);
  if (meId === proposer) return false;
  // Only the seller counters a buyer's opening offer.
  return proposer === offer.buyerId && meId === offer.sellerId;
}

export function canAcceptOrRejectOffer(offer: OfferDto, meId: string): boolean {
  if (offer.status !== "PENDING") return false;
  return meId === offerRecipientId(offer);
}
