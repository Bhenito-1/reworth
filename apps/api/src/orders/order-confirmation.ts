import { FulfilmentMethod } from '@prisma/client';

/** Delivery checkout without an offer or meetup agreement needs seller confirmation first. */
export function orderNeedsSellerConfirmation(input: {
  fulfilmentMethod: FulfilmentMethod;
  negotiated: boolean;
}): boolean {
  return (
    !input.negotiated && input.fulfilmentMethod === FulfilmentMethod.DELIVERY
  );
}