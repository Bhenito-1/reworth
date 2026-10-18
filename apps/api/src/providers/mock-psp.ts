import { createHmac } from 'crypto';
import type {
  InitiatePaymentInput,
  MoneyOpResult,
  ParsedWebhook,
  PaymentProvider,
  PaymentResult,
  RefundInput,
  ReleaseInput,
} from './payment.provider';

type StoredPayment = PaymentResult & {
  amountKobo: number;
  email: string;
  metadata?: Record<string, string>;
  releasedKobo: number;
  refundedKobo: number;
};

/**
 * Deterministic mock PSP for local/CI.
 * Stores by reference; release/refund idempotent via idempotencyKey map;
 * webhook replay-safe (simulateWebhookSuccess is a no-op if already success).
 */
export class MockPsp implements PaymentProvider {
  readonly name = 'mock-psp';
  private readonly store = new Map<string, StoredPayment>();
  private readonly idempotency = new Map<string, MoneyOpResult | PaymentResult>();
  private readonly webhookSecret: string;

  constructor(webhookSecret = 'mock-webhook-secret') {
    this.webhookSecret = webhookSecret;
  }

  async initiate(input: InitiatePaymentInput): Promise<PaymentResult> {
    const idemKey = `initiate:${input.idempotencyKey}`;
    const cached = this.idempotency.get(idemKey);
    if (cached && 'checkoutUrl' in cached) {
      return cached as PaymentResult;
    }

    const existing = this.store.get(input.reference);
    if (existing) {
      return {
        paymentId: existing.paymentId,
        reference: existing.reference,
        status: existing.status,
        checkoutUrl: existing.checkoutUrl,
      };
    }

    const paymentId = `pay_mock_${input.reference}`;
    const result: StoredPayment = {
      paymentId,
      reference: input.reference,
      status: 'pending',
      checkoutUrl: `https://mock-psp.local/checkout/${input.reference}`,
      amountKobo: input.amountKobo,
      email: input.email,
      metadata: input.metadata,
      releasedKobo: 0,
      refundedKobo: 0,
    };
    this.store.set(input.reference, result);
    const publicResult: PaymentResult = {
      paymentId,
      reference: input.reference,
      status: 'pending',
      checkoutUrl: result.checkoutUrl,
    };
    this.idempotency.set(idemKey, publicResult);
    return publicResult;
  }

  async verify(reference: string): Promise<PaymentResult> {
    const existing = this.store.get(reference);
    if (!existing) {
      return { paymentId: 'unknown', reference, status: 'failed' };
    }
    return {
      paymentId: existing.paymentId,
      reference: existing.reference,
      status: existing.status,
      checkoutUrl: existing.checkoutUrl,
    };
  }

  async release(input: ReleaseInput): Promise<MoneyOpResult> {
    const idemKey = `release:${input.idempotencyKey}`;
    const cached = this.idempotency.get(idemKey) as MoneyOpResult | undefined;
    if (cached) return cached;

    const payment = this.store.get(input.reference);
    if (!payment || payment.status !== 'success') {
      throw new Error(`Cannot release: payment ${input.reference} not funded`);
    }

    payment.releasedKobo += input.amountKobo;
    const result: MoneyOpResult = {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: 'released',
      providerRef: `rel_mock_${input.idempotencyKey}`,
    };
    this.idempotency.set(idemKey, result);
    return result;
  }

  async refund(input: RefundInput): Promise<MoneyOpResult> {
    const idemKey = `refund:${input.idempotencyKey}`;
    const cached = this.idempotency.get(idemKey) as MoneyOpResult | undefined;
    if (cached) return cached;

    const payment = this.store.get(input.reference);
    if (!payment || payment.status !== 'success') {
      throw new Error(`Cannot refund: payment ${input.reference} not funded`);
    }

    payment.refundedKobo += input.amountKobo;
    const fullyRefunded = payment.refundedKobo >= payment.amountKobo;
    const result: MoneyOpResult = {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: fullyRefunded ? 'refunded' : 'partially_refunded',
      providerRef: `rfnd_mock_${input.idempotencyKey}`,
    };
    this.idempotency.set(idemKey, result);
    return result;
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha512', this.webhookSecret)
      .update(body)
      .digest('hex');
    return expected === signature || signature === 'mock-ok';
  }

  parseWebhook(payload: unknown): ParsedWebhook {
    const p = payload as {
      event?: string;
      data?: { reference?: string; status?: string };
      reference?: string;
      status?: string;
    };
    const reference = p.data?.reference ?? p.reference ?? '';
    const rawStatus = (p.data?.status ?? p.status ?? 'pending').toLowerCase();
    const status: ParsedWebhook['status'] =
      rawStatus === 'success' || rawStatus === 'successful'
        ? 'success'
        : rawStatus === 'failed'
          ? 'failed'
          : 'pending';
    return {
      event: p.event ?? 'charge.success',
      reference,
      status,
    };
  }

  /**
   * The database is the record of a successful charge. Mock memory is
   * per process and can miss a payment another instance already accepted.
   */
  ensureFunded(input: {
    reference: string;
    amountKobo: number;
    email?: string;
  }): void {
    const existing = this.store.get(input.reference);
    if (existing) {
      if (existing.status !== 'success') existing.status = 'success';
      return;
    }
    this.store.set(input.reference, {
      paymentId: `pay_mock_${input.reference}`,
      reference: input.reference,
      status: 'success',
      checkoutUrl: `https://mock-psp.local/checkout/${input.reference}`,
      amountKobo: input.amountKobo,
      email: input.email ?? 'buyer@reworth.local',
      releasedKobo: 0,
      refundedKobo: 0,
    });
  }

  /** Test helper: mark payment successful (idempotent / replay-safe). */
  simulateWebhookSuccess(reference: string): PaymentResult {
    const existing = this.store.get(reference);
    if (!existing) {
      throw new Error(`Unknown reference: ${reference}`);
    }
    if (existing.status === 'success') {
      return {
        paymentId: existing.paymentId,
        reference: existing.reference,
        status: 'success',
        checkoutUrl: existing.checkoutUrl,
      };
    }
    existing.status = 'success';
    this.store.set(reference, existing);
    return {
      paymentId: existing.paymentId,
      reference: existing.reference,
      status: 'success',
      checkoutUrl: existing.checkoutUrl,
    };
  }

  /** @deprecated Prefer initiate() */
  async createPayment(input: {
    amountKobo: number;
    currency: 'NGN';
    reference: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentResult> {
    return this.initiate({
      amountKobo: input.amountKobo,
      currency: input.currency,
      reference: input.reference,
      email: input.customerEmail ?? 'buyer@reworth.local',
      metadata: input.metadata,
      idempotencyKey: `legacy:${input.reference}`,
    });
  }

  /** @deprecated Prefer verify() */
  async verifyPayment(reference: string): Promise<PaymentResult> {
    return this.verify(reference);
  }

  getStored(reference: string): StoredPayment | undefined {
    return this.store.get(reference);
  }
}
