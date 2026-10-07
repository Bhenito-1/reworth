import { ConfigService } from '@nestjs/config';
import type {
  NameEnquiryInput,
  NameEnquiryResult,
  AccountNameEnquiry,
} from './nibss-name-enquiry.provider';

/**
 * Resolves an account name with Paystack GET /bank/resolve.
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

    const url = new URL('https://api.paystack.co/bank/resolve');
    url.searchParams.set('account_number', input.accountNumber);
    url.searchParams.set('bank_code', input.institutionCode);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { found: false };
    const body = (await response.json()) as {
      status?: boolean;
      data?: { account_name?: string };
    };
    const accountName = body.data?.account_name?.trim() ?? '';
    if (!body.status || !accountName) return { found: false };
    return { found: true, accountName };
  }
}
