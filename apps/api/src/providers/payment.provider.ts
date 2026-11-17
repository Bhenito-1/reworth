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

export type ReleaseInput = {
  reference: string;
  amountKobo: number;
  idempotencyKey: string;
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
};

export type ParsedWebhook = {
  event: string;
  reference: string;
  status: 'success' | 'failed' | 'pending';
};

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiatePaymentInput): Promise<PaymentResult>;
  verify(reference: string): Promise<PaymentResult>;
  release(input: ReleaseInput): Promise<MoneyOpResult>;
  refund(input: RefundInput): Promise<MoneyOpResult>;
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
