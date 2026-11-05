/**
 * Chat SYSTEM body when a seller accepts an offer — buyer completes checkout at agreed price.
 */

export const OFFER_CHECKOUT_KIND = 'OFFER_CHECKOUT' as const;

export type OfferCheckoutPayload = {
  v: 1;
  kind: typeof OFFER_CHECKOUT_KIND;
  offerId: string;
  orderIntentId: string;
  listingId: string;
  amountKobo: number;
  buyerId: string;
};

export function encodeOfferCheckout(input: {
  offerId: string;
  orderIntentId: string;
  listingId: string;
  amountKobo: number;
  buyerId: string;
}): string {
  const payload: OfferCheckoutPayload = {
    v: 1,
    kind: OFFER_CHECKOUT_KIND,
    offerId: input.offerId,
    orderIntentId: input.orderIntentId,
    listingId: input.listingId,
    amountKobo: input.amountKobo,
    buyerId: input.buyerId,
  };
  return JSON.stringify(payload);
}

export function parseOfferCheckout(
  body: string | null | undefined,
): OfferCheckoutPayload | null {
  if (!body?.trim().startsWith('{')) return null;
  try {
    const raw = JSON.parse(body) as Partial<OfferCheckoutPayload>;
    if (raw?.kind !== OFFER_CHECKOUT_KIND || raw.v !== 1) return null;
    if (
      typeof raw.offerId !== 'string' ||
      typeof raw.orderIntentId !== 'string' ||
      typeof raw.listingId !== 'string' ||
      typeof raw.buyerId !== 'string' ||
      typeof raw.amountKobo !== 'number' ||
      !Number.isFinite(raw.amountKobo) ||
      raw.amountKobo < 1
    ) {
      return null;
    }
    return {
      v: 1,
      kind: OFFER_CHECKOUT_KIND,
      offerId: raw.offerId,
      orderIntentId: raw.orderIntentId,
      listingId: raw.listingId,
      amountKobo: Math.floor(raw.amountKobo),
      buyerId: raw.buyerId,
    };
  } catch {
    return null;
  }
}

export function offerCheckoutPreview(
  body: string | null | undefined,
): string | null {
  return parseOfferCheckout(body) ? 'Complete your order' : null;
}
