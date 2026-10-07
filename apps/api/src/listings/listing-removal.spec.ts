import { sellerRemovalBlockReason } from './listing-removal';

const open = {
  status: 'LIVE',
  quantityAvailable: 2,
  quantityReserved: 0,
  quantitySold: 0,
  activeOrders: 0,
  openDisputes: 0,
  openSwaps: 0,
  openGiveaways: 0,
  pendingIntents: 0,
  openOffers: 0,
};

describe('sellerRemovalBlockReason', () => {
  it('allows a live listing with stock and no open activity', () => {
    expect(sellerRemovalBlockReason(open)).toBeNull();
  });

  it('blocks a sold-out listing so it stays in inventory', () => {
    expect(
      sellerRemovalBlockReason({
        ...open,
        status: 'SOLD',
        quantityAvailable: 0,
        quantitySold: 2,
      }),
    ).toMatch(/sold out/i);
  });

  it('blocks when every unit has been sold even if status is still live', () => {
    expect(
      sellerRemovalBlockReason({
        ...open,
        quantityAvailable: 0,
        quantitySold: 3,
      }),
    ).toMatch(/sold out/i);
  });

  it('blocks reserved units and an active order', () => {
    expect(
      sellerRemovalBlockReason({ ...open, quantityReserved: 1 }),
    ).toMatch(/reserved/i);
    expect(
      sellerRemovalBlockReason({ ...open, status: 'RESERVED', quantityAvailable: 0 }),
    ).toMatch(/reserved/i);
    expect(
      sellerRemovalBlockReason({ ...open, activeOrders: 1 }),
    ).toMatch(/active order/i);
  });

  it('blocks disputes, swaps, giveaways, and pending checkouts', () => {
    expect(sellerRemovalBlockReason({ ...open, openDisputes: 1 })).toMatch(/dispute/i);
    expect(sellerRemovalBlockReason({ ...open, openSwaps: 1 })).toMatch(/swap/i);
    expect(sellerRemovalBlockReason({ ...open, openGiveaways: 1 })).toMatch(/giveaway/i);
    expect(sellerRemovalBlockReason({ ...open, pendingIntents: 1 })).toMatch(/checkout/i);
    expect(sellerRemovalBlockReason({ ...open, openOffers: 1 })).toMatch(/offer/i);
  });
});
