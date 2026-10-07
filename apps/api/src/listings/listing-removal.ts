/** Orders that still need the listing to exist and stay unchanged. */
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

export type SellerRemovalInput = {
  status: string;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  activeOrders: number;
  openDisputes: number;
  openSwaps: number;
  openGiveaways: number;
  pendingIntents: number;
  openOffers: number;
};

/**
 * Why a seller cannot take this listing off the marketplace.
 * Null means a soft remove (status REMOVED) is allowed.
 * Sold-out listings stay in inventory and are never removable.
 */
export function sellerRemovalBlockReason(
  input: SellerRemovalInput,
): string | null {
  if (input.status === 'REMOVED') {
    return 'This listing is already off the marketplace.';
  }

  const fullySold =
    input.status === 'SOLD' ||
    (input.quantitySold > 0 &&
      input.quantityAvailable <= 0 &&
      input.quantityReserved <= 0);
  if (fullySold) {
    return 'This listing has sold out. It stays in your inventory for reference and cannot be deleted.';
  }

  if (input.quantityReserved > 0 || input.status === 'RESERVED') {
    return 'Units are reserved for an open order. You can remove the listing after that hold is released.';
  }

  if (input.activeOrders > 0) {
    return 'This listing has an active order. You can remove it after the order is finished or cancelled.';
  }

  if (input.openDisputes > 0) {
    return 'This listing has an open dispute. Resolve it before removing the listing.';
  }

  if (input.openSwaps > 0) {
    return 'This listing is part of an open swap. Finish or cancel the swap before removing it.';
  }

  if (input.openGiveaways > 0) {
    return 'Someone has claimed this giveaway. Resolve the claim before removing the listing.';
  }

  if (input.pendingIntents > 0) {
    return 'A buyer has a pending checkout on this listing. Wait until it expires or is cancelled.';
  }

  if (input.openOffers > 0) {
    return 'This listing has an open offer. Accept, decline, or wait for it to expire before removing it.';
  }

  return null;
}
