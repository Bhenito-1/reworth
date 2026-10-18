import { sellerRemovalBlockReason } from './listing-removal';

describe('sellerRemovalBlockReason', () => {
  it('allows a live listing', () => {
    expect(sellerRemovalBlockReason({ status: 'LIVE' })).toBeNull();
  });

  it('refuses a listing that is already removed', () => {
    expect(sellerRemovalBlockReason({ status: 'REMOVED' })).toMatch(/already off/i);
  });

  it('refuses sold, reserved, review, and rejected listings', () => {
    for (const status of ['SOLD', 'RESERVED', 'UNDER_REVIEW', 'REJECTED', 'EXPIRED', 'DRAFT']) {
      expect(sellerRemovalBlockReason({ status })).toMatch(/live listing/i);
    }
  });
});
