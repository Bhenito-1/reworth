export const ACCOUNT_NAME_ENQUIRY = Symbol('ACCOUNT_NAME_ENQUIRY');

export type NameEnquiryInput = {
  accountNumber: string;
  institutionCode: string;
};

export type NameEnquiryResult =
  | { found: true; accountName: string }
  | { found: false };

export interface AccountNameEnquiry {
  enquire(input: NameEnquiryInput): Promise<NameEnquiryResult>;
}
