import { ConfigService } from '@nestjs/config';
import type {
  NameEnquiryInput,
  NameEnquiryResult,
  AccountNameEnquiry,
} from './nibss-name-enquiry.provider';

type Attempt = {
  found: boolean;
  accountName?: string;
  /** Auth failures must not continue into the transfer-recipient check. */
  stop?: boolean;
  message?: string;
};

/**
 * Resolves an account name with Paystack.
 * GET /bank/resolve fails for some live NUBAN banks (Ecobank, Zenith, and
 * others on the same switch) even when the account exists. A second resolve
 * covers bank timeouts. POST /transferrecipient uses Paystack's transfer
 * switch and returns the name in details.account_name.
 * A sk_test_ key is for local checks only and must not be used in production.
 */
export class PaystackAccountResolveAdapter implements AccountNameEnquiry {
  constructor(private readonly config: ConfigService) {}

  async enquire(input: NameEnquiryInput): Promise<NameEnquiryResult> {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
    if (!secret) {
      throw new Error(
        'PAYSTACK_SECRET_KEY is not set; use ACCOUNT_NAME_PROVIDER=mock for local checks without Paystack',
      );
    }
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      secret.startsWith('sk_test_')
    ) {
      throw new Error('A Paystack test secret cannot be used in production');
    }

    const first = await this.resolveAccount(
      secret,
      input.accountNumber,
      input.institutionCode,
    );
    if (first.found || first.stop) return toResult(first);

    const second = await this.resolveAccount(
      secret,
      input.accountNumber,
      input.institutionCode,
    );
    if (second.found || second.stop) return toResult(second);

    const recipient = await this.resolveViaTransferRecipient(
      secret,
      input.accountNumber,
      input.institutionCode,
    );
    if (recipient.found) return toResult(recipient);
    return {
      found: false,
      message: preferMessage(first.message, recipient.message),
    };
  }

  private async resolveAccount(
    secret: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<Attempt> {
    const url = new URL('https://api.paystack.co/bank/resolve');
    url.searchParams.set('account_number', accountNumber);
    url.searchParams.set('bank_code', bankCode);
    url.searchParams.set('currency', 'NGN');
    const response = await this.paystack(secret, url);
    const body = await readJson(response);
    const accountName = text(body?.data?.account_name);
    if (response.ok && body?.status && accountName) {
      return { found: true, accountName };
    }
    return {
      found: false,
      stop: response.status === 401 || response.status === 403,
      message: text(body?.message),
    };
  }

  private async resolveViaTransferRecipient(
    secret: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<Attempt> {
    const response = await this.paystack(
      secret,
      'https://api.paystack.co/transferrecipient',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'nuban',
          name: 'ReWorth account check',
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        }),
      },
    );
    const body = await readJson(response);
    const accountName = text(body?.data?.details?.account_name);
    if (response.ok && body?.status && accountName) {
      return { found: true, accountName };
    }
    return {
      found: false,
      message: text(body?.message),
    };
  }

  private paystack(
    secret: string,
    url: string | URL,
    init?: { method?: string; body?: string },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    return fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  }
}

function toResult(attempt: Attempt): NameEnquiryResult {
  if (attempt.found && attempt.accountName) {
    return { found: true, accountName: attempt.accountName };
  }
  return { found: false, message: attempt.message };
}

function preferMessage(primary?: string, secondary?: string): string | undefined {
  if (primary && !/could not resolve account name/i.test(primary)) return primary;
  return secondary || primary;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function readJson(response: Response): Promise<{
  status?: boolean;
  message?: string;
  data?: {
    account_name?: string;
    details?: { account_name?: string | null };
  };
} | null> {
  return (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: {
      account_name?: string;
      details?: { account_name?: string | null };
    };
  } | null;
}
