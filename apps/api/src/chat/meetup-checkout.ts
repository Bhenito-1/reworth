export const MEETUP_CHECKOUT_KIND = 'MEETUP_CHECKOUT' as const;

export type MeetupCheckoutPayload = {
  v: 1;
  kind: typeof MEETUP_CHECKOUT_KIND;
  meetupProposalId: string;
  orderIntentId: string;
  listingId: string;
  buyerId: string;
  locationText: string;
};

export function encodeMeetupCheckout(input: {
  meetupProposalId: string;
  orderIntentId: string;
  listingId: string;
  buyerId: string;
  locationText: string;
}): string {
  const payload: MeetupCheckoutPayload = {
    v: 1,
    kind: MEETUP_CHECKOUT_KIND,
    meetupProposalId: input.meetupProposalId,
    orderIntentId: input.orderIntentId,
    listingId: input.listingId,
    buyerId: input.buyerId,
    locationText: input.locationText.trim(),
  };
  return JSON.stringify(payload);
}

export function parseMeetupCheckout(
  body: string | null | undefined,
): MeetupCheckoutPayload | null {
  if (!body?.trim().startsWith('{')) return null;
  try {
    const raw = JSON.parse(body) as Partial<MeetupCheckoutPayload>;
    if (raw?.kind !== MEETUP_CHECKOUT_KIND || raw.v !== 1) return null;
    if (
      typeof raw.meetupProposalId !== 'string' ||
      typeof raw.orderIntentId !== 'string' ||
      typeof raw.listingId !== 'string' ||
      typeof raw.buyerId !== 'string' ||
      typeof raw.locationText !== 'string' ||
      !raw.locationText.trim()
    ) {
      return null;
    }
    return {
      v: 1,
      kind: MEETUP_CHECKOUT_KIND,
      meetupProposalId: raw.meetupProposalId,
      orderIntentId: raw.orderIntentId,
      listingId: raw.listingId,
      buyerId: raw.buyerId,
      locationText: raw.locationText.trim(),
    };
  } catch {
    return null;
  }
}

export function meetupCheckoutPreview(
  body: string | null | undefined,
): string | null {
  return parseMeetupCheckout(body) ? 'Complete checkout' : null;
}