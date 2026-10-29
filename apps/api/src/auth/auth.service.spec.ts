import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminRole, DevicePlatform } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER } from '../providers/email.provider';
import { AuthService } from './auth.service';
import { hashWithPepper } from './crypto.util';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  const refreshPepper = 'test-refresh-secret';
  const email = {
    name: 'mock-email',
    send: jest.fn().mockResolvedValue({ messageId: '1', status: 'sent' }),
  };

  function buildPrismaMock() {
    return {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emailSignupOtp: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      verification: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      device: { create: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      adminTotp: { findUnique: jest.fn().mockResolvedValue(null) },
    };
  }

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                JWT_REFRESH_SECRET: refreshPepper,
                JWT_ACCESS_SECRET: 'access-secret',
                JWT_ACCESS_TTL: '15m',
                JWT_REFRESH_TTL: '30d',
                OAUTH_MOCK_GOOGLE_EMAIL: 'google.user@example.com',
                OAUTH_MOCK_GOOGLE_NAME: 'Google User',
              };
              return map[key];
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('access.jwt'),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(null) },
        },
        { provide: EMAIL_PROVIDER, useValue: email },
      ],
    }).compile();

    service = new AuthService(
      prisma as never,
      module.get(JwtService),
      module.get(ConfigService),
      module.get(AuditService),
      email as never,
    );

    jest.clearAllMocks();
    email.send.mockResolvedValue({ messageId: '1', status: 'sent' });
  });

  describe('refresh rotation + reuse', () => {
    it('rotates refresh token and revokes old', async () => {
      const plain = 'old-refresh-token-value';
      const tokenHash = hashWithPepper(plain, refreshPepper);
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        deviceId: null,
        familyId: 'fam1',
        tokenHash,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt2' });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.userRole.findMany.mockResolvedValue([]);

      const result = await service.refresh(plain);
      expect(result.accessToken).toBe('access.jwt');
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).not.toBe(plain);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt1' },
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
            replacedById: 'rt2',
          }),
        }),
      );
    });

    it('revokes entire family on reuse of revoked token', async () => {
      const plain = 'stolen-refresh';
      const tokenHash = hashWithPepper(plain, refreshPepper);
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        familyId: 'fam-reuse',
        tokenHash,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.refresh(plain)).rejects.toThrow(/reuse/i);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-reuse', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('OAuth mock', () => {
    it('creates user via google mock callback', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u-oauth',
        email: 'google.user@example.com',
      });
      prisma.device.create.mockResolvedValue({ id: 'd1' });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      prisma.userRole.findMany.mockResolvedValue([]);

      const result = await service.oauthCallback('google', {
        idToken: 'mock-id-token',
        device: { name: 'Chrome', platform: DevicePlatform.WEB },
      });

      expect(result.userId).toBe('u-oauth');
      expect(result.accessToken).toBe('access.jwt');
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('register email OTP', () => {
    it('emails a code and does not create the account yet', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.emailSignupOtp.upsert.mockResolvedValue({});

      const result = await service.register({
        email: 'new@reworth.ng',
        password: 'password123',
        displayName: 'Ada',
      });

      expect(result).toEqual({
        email: 'new@reworth.ng',
        expiresInSeconds: 600,
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      const sent = email.send.mock.calls[0][0] as { text: string; to: string };
      expect(sent.to).toBe('new@reworth.ng');
      expect(sent.text).toMatch(/\b\d{6}\b/);
    });

    it('rejects a wrong code and counts the attempt', async () => {
      prisma.emailSignupOtp.findUnique.mockResolvedValue({
        email: 'new@reworth.ng',
        codeHash: hashWithPepper('111111', 'dev-otp-pepper'),
        passwordHash: 'stored',
        displayName: 'Ada',
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.verifyEmailOtp({ email: 'new@reworth.ng', code: '222222' }),
      ).rejects.toThrow(/invalid or expired code/i);
      expect(prisma.emailSignupOtp.update).toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the account and session when the code matches', async () => {
      prisma.emailSignupOtp.findUnique.mockResolvedValue({
        email: 'new@reworth.ng',
        codeHash: hashWithPepper('111111', 'dev-otp-pepper'),
        passwordHash: 'stored-hash',
        displayName: 'Ada',
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u-reg',
        email: 'new@reworth.ng',
        profile: { displayName: 'Ada' },
        roles: [],
      });
      prisma.device.create.mockResolvedValue({ id: 'd1' });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      prisma.userRole.findMany.mockResolvedValue([]);

      const result = await service.verifyEmailOtp({
        email: 'new@reworth.ng',
        code: '111111',
        device: { name: 'Phone', platform: DevicePlatform.IOS },
      });

      expect(result.userId).toBe('u-reg');
      expect(result.accessToken).toBe('access.jwt');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'stored-hash' }),
        }),
      );
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Welcome to ReWorth' }),
      );
    });
  });
});

describe('RBAC finance guard behaviour', () => {
  it('documents Support cannot hit finance (RolesGuard)', () => {
    const supportRoles: AdminRole[] = [AdminRole.CUSTOMER_SUPPORT];
    const required: AdminRole[] = [AdminRole.FINANCE, AdminRole.SUPER_ADMIN];
    const has =
      supportRoles.includes(AdminRole.SUPER_ADMIN) ||
      required.some((r) => supportRoles.includes(r));
    expect(has).toBe(false);
  });
});
