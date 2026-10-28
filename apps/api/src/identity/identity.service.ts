import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  VerificationLevel,
  VerificationStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashIdentifier } from '../auth/crypto.util';
import {
  IDENTITY_PROVIDER,
  type IdentityProvider,
} from './identity.provider';
import type { IdentityVerifyDto } from './dto/identity.dto';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
  ) {}

  private get pepper(): string {
    return this.config.get<string>('OTP_PEPPER') ?? 'dev-otp-pepper';
  }

  async listVerifications(userId: string) {
    const rows = await this.prisma.verification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        level: true,
        status: true,
        method: true,
        providerRef: true,
        // identifierHash intentionally omitted from default client response detail
        // but we return a boolean presence flag
        identifierHash: true,
        rejectionReason: true,
        verifiedAt: true,
        createdAt: true,
      },
    });

    return {
      verifications: rows.map((r) => ({
        id: r.id,
        level: r.level,
        status: r.status,
        method: r.method,
        providerRef: r.providerRef,
        hasIdentifierHash: Boolean(r.identifierHash),
        rejectionReason: r.rejectionReason,
        verifiedAt: r.verifiedAt,
        createdAt: r.createdAt,
      })),
    };
  }

  async verifyIdentity(userId: string, dto: IdentityVerifyDto, ip?: string) {
    // Guard: reject if mockReference looks like a raw Nigerian NIN/BVN pattern
    if (dto.mockReference && looksLikeRawGovId(dto.mockReference)) {
      throw new BadRequestException(
        'Raw government IDs are not accepted. Use mock provider references only.',
      );
    }

    const nin = dto.nin?.trim();
    if (nin && !looksLikeRawGovId(nin)) {
      throw new BadRequestException('Enter your 11-digit NIN.');
    }

    const result = await this.identity.verify({
      method: dto.method,
      mockOutcome: dto.mockOutcome,
      mockReference: dto.mockReference,
    });

    const identifierHash = hashIdentifier(
      nin ?? result.referenceForHash,
      this.pepper,
    );

    // Safety: never persist raw dto.mockReference if it somehow equals a gov ID shape
    if (
      dto.mockReference &&
      (identifierHash === dto.mockReference ||
        result.providerRef === dto.mockReference)
    ) {
      // Still OK if mockReference was already opaque; ensure we never store raw
    }

    const storedFields = {
      providerRef: result.providerRef,
      identifierHash,
      method: dto.method,
      rejectionReason: result.rejectionReason ?? null,
    };

    // Assert no raw NIN-like value lands in stored fields
    for (const v of Object.values(storedFields)) {
      if (typeof v === 'string' && looksLikeRawGovId(v)) {
        throw new BadRequestException('Refusing to store raw identity number');
      }
    }

    const status = result.success
      ? VerificationStatus.VERIFIED
      : VerificationStatus.REJECTED;

    const record = await this.prisma.verification.create({
      data: {
        userId,
        level: VerificationLevel.L3_IDENTITY,
        status,
        method: dto.method,
        providerRef: result.providerRef,
        identifierHash,
        rejectionReason: result.rejectionReason ?? null,
        verifiedAt: result.success ? new Date() : null,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      action: result.success ? 'L3_IDENTITY_VERIFIED' : 'L3_IDENTITY_REJECTED',
      entityType: 'Verification',
      entityId: record.id,
      afterJson: {
        method: dto.method,
        status,
        providerRef: result.providerRef,
        // Never include raw IDs or mockReference that could be raw
        hasIdentifierHash: true,
      },
      ip: ip ?? null,
    });

    return {
      id: record.id,
      level: record.level,
      status: record.status,
      method: record.method,
      identityVerifiedBadge: result.success,
      verifiedAt: record.verifiedAt,
    };
  }
}

/** Heuristic: Nigerian NIN (11 digits) or BVN (11 digits). */
export function looksLikeRawGovId(value: string): boolean {
  const digits = value.replace(/\s/g, '');
  return /^\d{11}$/.test(digits);
}
