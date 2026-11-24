import { createHmac, timingSafeEqual } from 'crypto';
import {
  PspRejectedError,
  transferReferenceFor,
  type InitiatePaymentInput,
  type MoneyOpResult,
  type ParsedWebhook,
  type PaymentProvider,
  type PaymentResult,
  type RefundInput,
  type ReleaseInput,
  type TransferCheck,
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
    // Paystack signs webhooks with the secret key; there is no separate
    // webhook secret. An empty PAYSTACK_WEBHOOK_SECRET (as shipped in
    // .env.example / .env.staging) must fall back to the key, not sign with "".
    this.webhookSecret =
      webhookSecret?.trim() || process.env.PAYSTACK_WEBHOOK_SECRET?.trim() || key;
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
      throw new PspRejectedError('Paystack release requires the seller bank account');
    }
    const recipientCode = await this.ensureRecipient(recipient);
    const transferReference =
      input.transferReference?.trim() || transferReferenceFor(input.reference);
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
      // Paystack answered: a 4xx/`status:false` is a definite no. A 5xx may
      // still have created the transfer, so treat it as unknown.
      const detail = `Paystack release failed: ${res.status} ${json?.message ?? ''}`.trim();
      if (res.status >= 500) throw new Error(detail);
      throw new PspRejectedError(detail);
    }
    const raw = (json.data.status ?? 'pending').toLowerCase();
    if (raw === 'failed' || raw === 'reversed') {
      throw new PspRejectedError(`Paystack transfer ${raw}`);
    }
    return {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: raw === 'success' ? 'released' : 'pending',
      providerRef: json.data.reference || transferReference,
      recipientCode,
    };
  }

  /**
   * GET /transfer/verify/:reference. Paystack documents `success`, `pending`
   * and `otp`; `failed`, `reversed` and the rest are mapped defensively.
   * A 404 (or "not found" message) means Paystack never created it.
   */
  async verifyTransfer(transferReference: string): Promise<TransferCheck> {
    const res = await fetch(
      `${this.baseUrl}/transfer/verify/${encodeURIComponent(transferReference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { status?: string };
    } | null;
    // Paystack does not document the "no such transfer" response. 400/404/422
    // (unknown or malformed reference) mean it holds no transfer under it;
    // auth, rate-limit and server errors mean we cannot tell, so throw.
    if ([400, 404, 422].includes(res.status)) {
      return { status: 'not_found', raw: json?.message };
    }
    if (!res.ok || !json?.status || !json.data) {
      throw new Error(
        `Paystack transfer verify failed: ${res.status} ${json?.message ?? ''}`.trim(),
      );
    }
    const raw = (json.data.status ?? '').toLowerCase();
    const status: TransferCheck['status'] =
      raw === 'success'
        ? 'success'
        : raw === 'reversed'
          ? 'reversed'
          : ['failed', 'rejected', 'abandoned', 'blocked'].includes(raw)
            ? 'failed'
            : 'pending';
    return { status, raw };
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
      const detail = `Paystack recipient failed: ${res.status} ${json?.message ?? ''}`.trim();
      if (res.status >= 500) throw new Error(detail);
      throw new PspRejectedError(detail);
    }
    return code;
  }

  /**
   * Paystack queues refunds: the API answers `pending`/`processing` and the
   * outcome arrives later as `refund.processed` / `refund.failed` webhooks.
   * Only `processed` counts as refunded here.
   */
  async refund(input: RefundInput): Promise<MoneyOpResult> {
    const res = await fetch(`${this.baseUrl}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.reference,
        amount: input.amountKobo,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { id?: number | string; status?: string };
    } | null;
    if (!res.ok || !json?.status || !json.data) {
      throw new Error(
        `Paystack refund failed: ${res.status} ${json?.message ?? ''}`.trim(),
      );
    }
    const raw = (json.data.status ?? 'pending').toLowerCase();
    if (raw === 'failed') {
      throw new Error('Paystack refund failed');
    }
    return {
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: raw === 'processed' ? 'refunded' : 'pending',
      providerRef:
        json.data.id != null ? String(json.data.id) : undefined,
    };
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha512', this.webhookSecret)
      .update(body)
      .digest('hex');
    return safeEqualHex(expected, signature);
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

/** Constant-time compare so the signature cannot be guessed byte by byte. */
export function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given ?? '', 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
