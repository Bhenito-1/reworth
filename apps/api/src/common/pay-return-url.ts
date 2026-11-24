/**
 * Where Paystack sends the payer after checkout. The web `/pay/return` page
 * confirms the charge with `POST /payments/confirm`, which handles order
 * payments, boosts, featured slots and Seller Plus.
 *
 * Mock PSP has no hosted checkout, so it gets no callback URL.
 */
export function payReturnUrl(pspName: string): string | undefined {
  if (pspName !== 'paystack') return undefined;
  const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')[0]
    ?.trim()
    .replace(/\/$/, '');
  return origin ? `${origin}/pay/return` : undefined;
}

/** Reference prefixes for charges that are not order payments. */
export const NON_ORDER_CHARGE_PREFIXES = {
  BOOST: 'boost_',
  FEATURED: 'feat_',
  SELLER_PLUS: 'plus_',
} as const;

export type NonOrderChargePurpose = keyof typeof NON_ORDER_CHARGE_PREFIXES;

export function nonOrderChargePurpose(
  reference: string,
): NonOrderChargePurpose | null {
  for (const [purpose, prefix] of Object.entries(NON_ORDER_CHARGE_PREFIXES)) {
    if (reference.startsWith(prefix)) return purpose as NonOrderChargePurpose;
  }
  return null;
}

/** Result of confirming a boost, featured slot or Seller Plus charge. */
export type NonOrderChargeResult = {
  id: string;
  purpose: NonOrderChargePurpose;
  reference: string;
  amountKobo: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  ownerId: string;
  listingId?: string;
};
