export type InitiatePaymentInput = {
  amountKobo: number;
  currency: 'NGN';
  reference: string;
  email: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
  /** Where Paystack sends the buyer after checkout. */
  callbackUrl?: string;
};

export type PaymentResult = {
  paymentId: string;
  reference: string;
  status: 'pending' | 'success' | 'failed';
  checkoutUrl?: string;
  /** Present when the provider reports the captured amount (kobo). */
  amountKobo?: number;
};

/** Seller bank account used to create or reuse a Paystack transfer recipient. */
export type ReleaseRecipient = {
  recipientCode?: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
};

export type ReleaseInput = {
  reference: string;
  amountKobo: number;
  idempotencyKey: string;
  /** Paystack transfer reference. Defaults to rel_{payment reference}. */
  transferReference?: string;
  recipient?: ReleaseRecipient;
};

export type RefundInput = {
  reference: string;
  amountKobo: number;
  idempotencyKey: string;
};

export type MoneyOpResult = {
  reference: string;
  amountKobo: number;
  status: 'released' | 'refunded' | 'partially_refunded' | 'pending';
  providerRef?: string;
  /** Set when a transfer recipient was created or reused. */
  recipientCode?: string;
};

export type ParsedWebhook = {
  event: string;
  reference: string;
  status: 'success' | 'failed' | 'pending';
};

/**
 * What the PSP knows about a seller transfer reference.
 * `not_found`: the PSP has no transfer with this reference (never created).
 */
export type TransferCheck = {
  status: 'success' | 'pending' | 'failed' | 'reversed' | 'not_found';
  /** Raw PSP status, for logs. */
  raw?: string;
};

/**
 * Thrown when the PSP answered and said no (HTTP error or `status: false`).
 * Any other error from release() (timeout, network) means the outcome is
 * unknown and the transfer may still have gone through.
 */
export class PspRejectedError extends Error {
  readonly rejected = true;
  constructor(message: string) {
    super(message);
    this.name = 'PspRejectedError';
  }
}

export function isPspRejection(err: unknown): boolean {
  return (err as { rejected?: unknown } | null)?.rejected === true;
}

/**
 * Seller transfer reference. Paystack accepts only lowercase letters, digits,
 * dashes and underscores, 16-50 characters; payment references are uppercase,
 * so they are lowercased here. `attempt` > 1 gives a retry its own reference.
 */
export function transferReferenceFor(
  paymentReference: string,
  attempt = 1,
): string {
  const base = `rel_${paymentReference.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
  const ref = attempt > 1 ? `${base}_${attempt}` : base;
  return ref.length < 16 ? ref.padEnd(16, '0') : ref.slice(0, 50);
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiatePaymentInput): Promise<PaymentResult>;
  verify(reference: string): Promise<PaymentResult>;
  release(input: ReleaseInput): Promise<MoneyOpResult>;
  refund(input: RefundInput): Promise<MoneyOpResult>;
  /** Looks up a seller transfer by our reference. Throws if the PSP cannot be reached. */
  verifyTransfer(transferReference: string): Promise<TransferCheck>;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
  parseWebhook(payload: unknown): ParsedWebhook;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** @deprecated Use InitiatePaymentInput + initiate() */
export type CreatePaymentInput = {
  amountKobo: number;
  currency: 'NGN';
  reference: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
};
