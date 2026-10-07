import type {
  NameEnquiryInput,
  NameEnquiryResult,
  AccountNameEnquiry,
} from './nibss-name-enquiry.provider';

/**
 * Deterministic stand-in used when ACCOUNT_NAME_PROVIDER=mock.
 * GTBank (058) 0123456789 resolves to ADEWALE CHINEDU OKONKWO.
 */
const FIXTURES: Record<string, string> = {
  '058:0123456789': 'ADEWALE CHINEDU OKONKWO',
};

export class MockNibssNameEnquiry implements AccountNameEnquiry {
  async enquire(input: NameEnquiryInput): Promise<NameEnquiryResult> {
    const key = `${input.institutionCode}:${input.accountNumber}`;
    const accountName = FIXTURES[key];
    if (!accountName) return { found: false };
    return { found: true, accountName };
  }
}
