function toOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Web origins the app is served from (WEB_ORIGIN, comma-separated; APP_URL). */
export function allowedWebOrigins(): string[] {
  const list = [
    ...(process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    process.env.APP_URL ?? '',
  ]
    .map(toOrigin)
    .filter((o): o is string => Boolean(o));
  return [...new Set(list)];
}

/**
 * Where Paystack sends the payer after checkout. The web `/pay/return` page
 * confirms the charge with `POST /payments/confirm`, which handles order
 * payments, boosts, featured slots and Seller Plus.
 *
 * `requestOrigin` is the browser's Origin header on the request that started
 * the checkout. The login lives in that site's localStorage, so the payer must
 * come back to the same origin (www.reworth.com.ng vs the vercel.app address
 * are different sites). It is used only when it is one of our own web
 * origins; otherwise (mobile, curl, unknown) the first WEB_ORIGIN entry.
 *
 * Mock PSP has no hosted checkout, so it gets no callback URL.
 */
export function payReturnUrl(
  pspName: string,
  requestOrigin?: string | null,
): string | undefined {
  if (pspName !== 'paystack') return undefined;
  const allowed = allowedWebOrigins();
  const wanted = toOrigin(requestOrigin);
  const origin = wanted && allowed.includes(wanted) ? wanted : allowed[0];
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
