import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findBank } from './banks';
import { namesMatch, splitAccountName, type LegalName } from './name-match';
import type { VerifyPayoutAccountDto } from './dto/verify-payout-account.dto';
import {
  ACCOUNT_NAME_ENQUIRY,
  type AccountNameEnquiry,
} from './nibss-name-enquiry.provider';

export type PayoutAccountView = {
  bankCode: string;
  bankName: string;
  accountNumberMasked: string;
  firstName: string;
  middleName: string;
  lastName: string;
  verifiedAt: string;
  verifiedWithBank?: boolean;
};

export type VerifyPayoutResponse = {
  ok: true;
  account: PayoutAccountView;
  warning?: string;
};

function maskAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  return `····${digits.slice(-4)}`;
}

function digitsOnly(accountNumber: string): string {
  return accountNumber.replace(/\D/g, '');
}

@Injectable()
export class SellerPayoutService {
  private readonly logger = new Logger(SellerPayoutService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(ACCOUNT_NAME_ENQUIRY)
    private readonly bankLookup?: AccountNameEnquiry,
  ) {}

  async current(userId: string): Promise<PayoutAccountView | null> {
    const row = await this.prisma.sellerPayoutAccount.findUnique({
      where: { userId },
    });
    if (!row) return null;
    return {
      bankCode: row.bankCode,
      bankName: row.bankName,
      accountNumberMasked: maskAccount(row.accountNumber),
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      verifiedAt: row.verifiedAt.toISOString(),
    };
  }

  async requireVerified(userId: string): Promise<void> {
    const row = await this.prisma.sellerPayoutAccount.findUnique({
      where: { userId },
      select: { verifiedAt: true },
    });
    if (!row?.verifiedAt) {
      throw new BadRequestException(
        'Verify a bank account before publishing.',
      );
    }
  }

  async verify(
    userId: string,
    dto: VerifyPayoutAccountDto,
  ): Promise<VerifyPayoutResponse> {
    const bank = findBank(dto.bankCode);
    if (!bank) {
      throw new BadRequestException('Choose a bank from the list.');
    }
    const accountNumber = digitsOnly(dto.accountNumber);
    if (accountNumber.length !== 10) {
      throw new BadRequestException('Enter a 10-digit account number.');
    }
    const entered: LegalName = {
      firstName: dto.firstName.trim(),
      middleName: (dto.middleName ?? '').trim(),
      lastName: dto.lastName.trim(),
    };
    if (!entered.firstName || !entered.lastName) {
      throw new BadRequestException('Enter your first and last name.');
    }

    let nibssAccountName = [entered.firstName, entered.middleName, entered.lastName]
      .filter(Boolean)
      .join(' ');
    let verifiedWithBank = false;
    let warning: string | undefined;

    if (this.bankLookup) {
      try {
        const enquiry = await this.bankLookup.enquire({
          accountNumber,
          institutionCode: bank.code,
        });
        if (enquiry.found) {
          const resolvedName = splitAccountName(enquiry.accountName);
          const resolvedDisplay = [
            resolvedName.firstName,
            resolvedName.middleName,
            resolvedName.lastName,
          ]
            .filter(Boolean)
            .join(' ');
          this.logger.log(
            `Paystack resolve · bank=${bank.name} (${bank.code}) · account_name=${enquiry.accountName} · order=${resolvedDisplay}`,
          );
          if (!namesMatch(entered, resolvedName)) {
            throw new BadRequestException(
              'Account name does not match this account number. Check spelling and middle name, or confirm the account number.',
            );
          }
          nibssAccountName = resolvedDisplay || enquiry.accountName;
          verifiedWithBank = true;
        } else if (enquiry.rateLimited) {
          warning =
            'Bank verification is temporarily unavailable.';
        } else {
          const detail =
            enquiry.message?.trim() ||
            'Could not verify this account. Check the bank and account number, then try again.';
          throw new BadRequestException(detail);
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(
          'Bank verification failed. Try again in a moment.',
        );
      }
    }

    const saved = await this.prisma.sellerPayoutAccount.upsert({
      where: { userId },
      create: {
        userId,
        bankCode: bank.code,
        bankName: bank.name,
        accountNumber,
        firstName: entered.firstName,
        middleName: entered.middleName,
        lastName: entered.lastName,
        nibssAccountName,
        verifiedAt: new Date(),
      },
      update: {
        bankCode: bank.code,
        bankName: bank.name,
        accountNumber,
        firstName: entered.firstName,
        middleName: entered.middleName,
        lastName: entered.lastName,
        nibssAccountName,
        verifiedAt: new Date(),
      },
    });

    return {
      ok: true,
      warning,
      account: {
        bankCode: saved.bankCode,
        bankName: saved.bankName,
        accountNumberMasked: maskAccount(saved.accountNumber),
        firstName: saved.firstName,
        middleName: saved.middleName,
        lastName: saved.lastName,
        verifiedAt: saved.verifiedAt.toISOString(),
        verifiedWithBank,
      },
    };
  }
}