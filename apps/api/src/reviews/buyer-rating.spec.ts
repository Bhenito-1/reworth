import { aggregateBuyerRatings } from './buyer-rating';

describe('aggregateBuyerRatings', () => {
  it('counts separate orders from the same buyer separately', () => {
    const result = aggregateBuyerRatings([
      { buyerId: 'buyer-1', orderId: 'o1', score: 5 },
      { buyerId: 'buyer-1', orderId: 'o2', score: 3 },
    ]);
    expect(result.count).toBe(2);
    expect(result.average).toBe(4);
  });

  it('counts each item in one checkout, even from the same buyer', () => {
    const result = aggregateBuyerRatings([
      { buyerId: 'buyer-1', orderId: 'o1', checkoutId: 'cart-1', score: 5 },
      { buyerId: 'buyer-1', orderId: 'o2', checkoutId: 'cart-1', score: 3 },
    ]);
    expect(result.count).toBe(2);
    expect(result.average).toBe(4);
  });

  it('keeps one score when the same order is rated once', () => {
    const result = aggregateBuyerRatings([
      { buyerId: 'buyer-1', orderId: 'o1', score: 5 },
    ]);
    expect(result.count).toBe(1);
    expect(result.average).toBe(5);
  });
});
