import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityMethod, VerificationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashIdentifier } from '../auth/crypto.util';
import { IDENTITY_PROVIDER } from './identity.provider';
import { IdentityService, looksLikeRawGovId } from './identity.service';
import { MockIdentityProvider } from './mock-identity.provider';

describe('IdentityService L3', () => {
  const pepper = 'test-otp-pepper';
  const rawNin = '12345678901';
  let prisma: {
    verification: { create: jest.Mock; findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: IdentityService;

  beforeEach(() => {
    prisma = {
      verification: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(null) };
    service = new IdentityService(
      prisma as never,
      audit as unknown as AuditService,
      {
        get: (k: string) => (k === 'OTP_PEPPER' ? pepper : undefined),
      } as ConfigService,
      new MockIdentityProvider(),
    );
  });

  it('detects raw NIN/BVN shape', () => {
    expect(looksLikeRawGovId(rawNin)).toBe(true);
    expect(looksLikeRawGovId('mock_ref_abc')).toBe(false);
  });

  it('rejects raw government ID as mockReference', async () => {
    await expect(
      service.verifyIdentity('u1', {
        method: IdentityMethod.NIN,
        mockReference: rawNin,
        mockOutcome: 'success',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores identifierHash !== raw and audit omits raw NIN', async () => {
    prisma.verification.create.mockImplementation(async ({ data }) => ({
      id: 'v1',
      ...data,
    }));

    const result = await service.verifyIdentity('u1', {
      method: IdentityMethod.NIN,
      mockOutcome: 'success',
    });

    expect(result.status).toBe(VerificationStatus.VERIFIED);
    expect(result.identityVerifiedBadge).toBe(true);

    const created = prisma.verification.create.mock.calls[0][0].data;
    expect(created.identifierHash).toBeTruthy();
    expect(created.identifierHash).not.toBe(rawNin);
    expect(created.identifierHash).not.toEqual(
      hashIdentifier(rawNin, pepper),
    );
    expect(JSON.stringify(created)).not.toContain(rawNin);

    const auditPayload = audit.log.mock.calls[0][0];
    expect(JSON.stringify(auditPayload)).not.toContain(rawNin);
    expect(auditPayload.afterJson.hasIdentifierHash).toBe(true);
  });

  it('hashes a submitted NIN and never stores the raw number', async () => {
    prisma.verification.create.mockImplementation(async ({ data }) => ({
      id: 'v2',
      ...data,
    }));

    const result = await service.verifyIdentity('u1', {
      method: IdentityMethod.NIN,
      nin: rawNin,
    });

    expect(result.level).toBe('L3_IDENTITY');
    expect(result.status).toBe(VerificationStatus.VERIFIED);
    expect(result.identityVerifiedBadge).toBe(true);

    const created = prisma.verification.create.mock.calls[0][0].data;
    expect(created.identifierHash).toBe(hashIdentifier(rawNin, pepper));
    expect(JSON.stringify(created)).not.toContain(rawNin);
    expect(JSON.stringify(audit.log.mock.calls[0][0])).not.toContain(rawNin);
    expect(JSON.stringify(result)).not.toContain(rawNin);
  });
});

describe('MockIdentityProvider', () => {
  it('returns opaque providerRef', async () => {
    const provider = new MockIdentityProvider();
    const res = await provider.verify({ method: 'BVN', mockOutcome: 'success' });
    expect(res.providerRef).toMatch(/^mock_bvn_/);
    expect(looksLikeRawGovId(res.providerRef)).toBe(false);
  });
});

// silence unused import lint in some configs
void IDENTITY_PROVIDER;
