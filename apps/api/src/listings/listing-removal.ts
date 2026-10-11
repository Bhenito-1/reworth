/** Orders that still need the seller to finish them. */
export const ACTIVE_ORDER_STATUSES = [
  'CREATED',
  'PAYMENT_PENDING',
  'FUNDED',
  'IN_AUTHENTICATION',
  'SHIPPED',
  'HANDED_OVER',
  'DELIVERED',
  'RECEIVED',
  'DISPUTE_HOLD',
  'REFUND_REQUESTED',
] as const;

/**
 * Why a seller cannot take this listing off the marketplace.
 * Only a live listing can be removed. Accepted orders do not block removal;
 * the seller is warned that those orders still have to be fulfilled.
 */
export function sellerRemovalBlockReason(input: { status: string }): string | null {
  if (input.status === 'LIVE') return null;
  if (input.status === 'REMOVED') {
    return 'This listing is already off the marketplace.';
  }
  return 'Only a live listing can be removed from the marketplace.';
}
