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

/**
 * Paystack HTTP adapter. Requires PAYSTACK_SECRET_KEY.
 * Phase 5 tests use MockPsp — this adapter is production-shaped stub.
 */
export class PaystackAdapter implements PaymentProvider {
  readonly name = 'paystack';
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(secretKey?: string, webhookSecret?: string) {
    const key = secretKey ?? process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      throw new Error(
        'PaystackAdapter requires PAYSTACK_SECRET_KEY; use PAYMENTS_PROVIDER=mock for local/CI',
      );
    }
    this.secretKey = key;
    this.webhookSecret =
      webhookSecret ?? process.env.PAYSTACK_WEBHOOK_SECRET ?? key;
  }

  async initiate(input: InitiatePaymentInput): Promise<PaymentResult> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        amount: input.amountKobo,
        currency: input.currency,
        reference: input.reference,
        email: input.email,
        metadata: input.metadata,
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paystack initiate failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      data: { reference: string; access_code: string; authorization_url: string };
    };
    return {
      paymentId: json.data.access_code,
      reference: json.data.reference,
      status: 'pending',
      checkoutUrl: json.data.authorization_url,
    };
  }

  async verify(reference: string): Promise<PaymentResult> {
    const res = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );
    if (!res.ok) {
      return { paymentId: 'unknown', reference, status: 'failed' };
    }
    const json = (await res.json()) as {
      data: { id: number; reference: string; status: string; amount?: number };
    };
    const status =
      json.data.status === 'success'
        ? 'success'
        : json.data.status === 'failed'
          ? 'failed'
          : 'pending';
    return {
      paymentId: String(json.data.id),
      reference: json.data.reference,
      status,
      amountKobo:
        typeof json.data.amount === 'number' ? json.data.amount : undefined,
    };
  }

  async release(input: ReleaseInput): Promise<MoneyOpResult> {
    // Paystack transfer / settlement release — product-specific; stub shape for Phase 5
    const res = await fetch(`${this.baseUrl}/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        source: 'balance',
        amount: input.amountKobo,
        reference: `rel_${input.reference}_${input.idempotencyKey}`,
        reason: 'ReWorth escrow release',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paystack release failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { data: { reference: string } };
    return {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: 'released',
      providerRef: json.data.reference,
    };
  }

  async refund(input: RefundInput): Promise<MoneyOpResult> {
    const res = await fetch(`${this.baseUrl}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        transaction: input.reference,
        amount: input.amountKobo,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paystack refund failed: ${res.status} ${text}`);
    }
    return {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: 'refunded',
      providerRef: `paystack_refund_${input.idempotencyKey}`,
    };
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha512', this.webhookSecret)
      .update(body)
      .digest('hex');
    return expected === signature;
  }

  parseWebhook(payload: unknown): ParsedWebhook {
    const p = payload as {
      event?: string;
      data?: { reference?: string; status?: string };
    };
    const rawStatus = (p.data?.status ?? 'pending').toLowerCase();
    const status: ParsedWebhook['status'] =
      rawStatus === 'success'
        ? 'success'
        : rawStatus === 'failed'
          ? 'failed'
          : 'pending';
    return {
      event: p.event ?? 'charge.success',
      reference: p.data?.reference ?? '',
      status,
    };
  }
}
