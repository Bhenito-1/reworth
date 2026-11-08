import { randomBytes } from 'crypto';

function refSuffix(bytes = 8): string {
  return randomBytes(bytes)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)
    .toUpperCase();
}

/** Human-readable unique order reference (also stored on Order.reference). */
export function newOrderReference(): string {
  return `RW-ORD-${refSuffix()}`;
}

/** Human-readable unique payment reference (PSP + Payment.reference). */
export function newPaymentReference(): string {
  return `RW-PAY-${refSuffix()}`;
}
