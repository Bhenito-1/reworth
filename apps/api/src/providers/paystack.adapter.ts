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
    const recipient = input.recipient;
    if (!recipient?.accountNumber || !recipient.bankCode || !recipient.accountName) {
      throw new Error('Paystack release requires the seller bank account');
    }
    const recipientCode = await this.ensureRecipient(recipient);
    const transferReference =
      input.transferReference?.trim() || `rel_${input.reference}`;
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
        recipient: recipientCode,
        reference: transferReference,
        reason: 'ReWorth seller payout',
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { reference?: string; status?: string; transfer_code?: string };
    } | null;
    if (!res.ok || !json?.status || !json.data) {
      const detail = json?.message || (await Promise.resolve(''));
      throw new Error(
        `Paystack release failed: ${res.status} ${detail}`.trim(),
      );
    }
    const raw = (json.data.status ?? 'pending').toLowerCase();
    if (raw === 'failed' || raw === 'reversed') {
      throw new Error(`Paystack transfer ${raw}`);
    }
    return {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: raw === 'success' ? 'released' : 'pending',
      providerRef: json.data.reference || transferReference,
      recipientCode,
    };
  }

  private async ensureRecipient(input: {
    recipientCode?: string;
    accountName: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<string> {
    if (input.recipientCode) return input.recipientCode;
    const res = await fetch(`${this.baseUrl}/transferrecipient`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: input.accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: 'NGN',
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { recipient_code?: string };
    } | null;
    const code = json?.data?.recipient_code;
    if (!res.ok || !json?.status || !code) {
      throw new Error(
        `Paystack recipient failed: ${res.status} ${json?.message ?? ''}`.trim(),
      );
    }
    return code;
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
