import {
  encodeOfferCheckout,
  parseOfferCheckout,
} from './offer-checkout';

describe('offer checkout chat payload', () => {
  it('round-trips checkout link metadata', () => {
    const raw = encodeOfferCheckout({
      offerId: 'offer-1',
      orderIntentId: 'intent-1',
      listingId: 'listing-1',
      amountKobo: 125_000_00,
      buyerId: 'buyer-1',
    });
    const parsed = parseOfferCheckout(raw);
    expect(parsed?.orderIntentId).toBe('intent-1');
    expect(parsed?.amountKobo).toBe(125_000_00);
  });

  it('rejects invalid payloads', () => {
    expect(parseOfferCheckout('hello')).toBeNull();
  });
});
