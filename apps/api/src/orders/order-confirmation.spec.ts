import { FulfilmentMethod } from '@prisma/client';
import { orderNeedsSellerConfirmation } from './order-confirmation';

describe('orderNeedsSellerConfirmation', () => {
  it('requires confirmation for delivery buy-now', () => {
    expect(
      orderNeedsSellerConfirmation({
        fulfilmentMethod: FulfilmentMethod.DELIVERY,
        negotiated: false,
      }),
    ).toBe(true);
  });

  it('skips confirmation for meetup', () => {
    expect(
      orderNeedsSellerConfirmation({
        fulfilmentMethod: FulfilmentMethod.MEET_POINT,
        negotiated: false,
      }),
    ).toBe(false);
  });

  it('skips confirmation for offers and checkout intents', () => {
    expect(
      orderNeedsSellerConfirmation({
        fulfilmentMethod: FulfilmentMethod.DELIVERY,
        negotiated: true,
      }),
    ).toBe(false);
  });
});