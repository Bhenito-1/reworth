import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findBank } from './banks';
import type { LegalName } from './name-match';
import type { VerifyPayoutAccountDto } from './dto/verify-payout-account.dto';

export type PayoutAccountView = {
  bankCode: string;
  bankName: string;
  accountNumberMasked: string;
  firstName: string;
  middleName: string;
  lastName: string;
  verifiedAt: string;
};

export type VerifyPayoutResponse = { ok: true; account: PayoutAccountView };

function maskAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  return `····${digits.slice(-4)}`;
}

@Injectable()
export class SellerPayoutService {
  constructor(private readonly prisma: PrismaService) {}

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
    const entered: LegalName = {
      firstName: dto.firstName.trim(),
      middleName: (dto.middleName ?? '').trim(),
      lastName: dto.lastName.trim(),
    };
    if (!entered.firstName || !entered.lastName) {
      throw new BadRequestException('Enter your first and last name.');
    }

    const enteredName = [entered.firstName, entered.middleName, entered.lastName]
      .filter(Boolean)
      .join(' ');

    const saved = await this.prisma.sellerPayoutAccount.upsert({
      where: { userId },
      create: {
        userId,
        bankCode: bank.code,
        bankName: bank.name,
        accountNumber: dto.accountNumber,
        firstName: entered.firstName,
        middleName: entered.middleName,
        lastName: entered.lastName,
        nibssAccountName: enteredName,
        verifiedAt: new Date(),
      },
      update: {
        bankCode: bank.code,
        bankName: bank.name,
        accountNumber: dto.accountNumber,
        firstName: entered.firstName,
        middleName: entered.middleName,
        lastName: entered.lastName,
        nibssAccountName: enteredName,
        verifiedAt: new Date(),
      },
    });

    return {
      ok: true,
      account: {
        bankCode: saved.bankCode,
        bankName: saved.bankName,
        accountNumberMasked: maskAccount(saved.accountNumber),
        firstName: saved.firstName,
        middleName: saved.middleName,
        lastName: saved.lastName,
        verifiedAt: saved.verifiedAt.toISOString(),
      },
    };
  }
}
