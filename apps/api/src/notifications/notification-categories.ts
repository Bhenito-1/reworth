/** PRD §29 notification categories (string enum). */
export const NotificationCategory = {
  NEW_MESSAGE: 'NEW_MESSAGE',
  NEW_OFFER: 'NEW_OFFER',
  COUNTEROFFER: 'COUNTEROFFER',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_REJECTED: 'OFFER_REJECTED',
  ITEM_SOLD: 'ITEM_SOLD',
  ITEM_SAVED: 'ITEM_SAVED',
  PRICE_DROP: 'PRICE_DROP',
  SAVED_SEARCH_MATCH: 'SAVED_SEARCH_MATCH',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_RELEASED: 'PAYMENT_RELEASED',
  DELIVERY_UPDATE: 'DELIVERY_UPDATE',
  VERIFICATION_UPDATE: 'VERIFICATION_UPDATE',
  DISPUTE_UPDATE: 'DISPUTE_UPDATE',
  REVIEW_RECEIVED: 'REVIEW_RECEIVED',
  COMMUNITY_NEW_LISTING: 'COMMUNITY_NEW_LISTING',
  MOVING_SALE_UPDATE: 'MOVING_SALE_UPDATE',
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
} as const;

/** Categories enabled by default when the user has no preference row. */
export const DEFAULT_ON_CATEGORIES: ReadonlySet<string> = new Set([
  NotificationCategory.COMMUNITY_NEW_LISTING,
]);

export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const ALL_NOTIFICATION_CATEGORIES = Object.values(
  NotificationCategory,
) as NotificationCategory[];

/** Categories that cannot fully disable IN_APP. */
export const CRITICAL_CATEGORIES: ReadonlySet<string> = new Set([
  NotificationCategory.PAYMENT_RECEIVED,
  NotificationCategory.PAYMENT_RELEASED,
  NotificationCategory.DELIVERY_UPDATE,
  NotificationCategory.DISPUTE_UPDATE,
  NotificationCategory.ORDER_PLACED,
  NotificationCategory.ORDER_CONFIRMED,
  NotificationCategory.ORDER_REJECTED,
  NotificationCategory.ORDER_CANCELLED,
]);

export function isCriticalCategory(category: string): boolean {
  return (
    CRITICAL_CATEGORIES.has(category) ||
    category.startsWith('PAYMENT_') ||
    category === NotificationCategory.DELIVERY_UPDATE ||
    category === NotificationCategory.DISPUTE_UPDATE ||
    category.startsWith('ORDER_')
  );
}

export const PUSH_FREQUENCY_CAP_PER_HOUR = 10;
