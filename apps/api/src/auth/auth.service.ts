import { randomInt, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AdminRole,
  DevicePlatform,
  UserStatus,
  VerificationLevel,
  VerificationStatus,
} from '@prisma/client';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from '../providers/email.provider';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  hashPassword,
  hashWithPepper,
  newFamilyId,
  newRefreshTokenPlain,
  parseTtlToMs,
  verifyPassword,
} from './crypto.util';
import { renderTransactionalEmail, resolvePublicAppUrl } from '../providers/email-templates';
import type {
  DeviceDto,
  LoginDto,
  OAuthCallbackDto,
  RegisterDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';
import { suspendedAccountMessage } from './suspended-account';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000;
const SIGNUP_OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  private get refreshPepper(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret'
    );
  }

  private get accessTtl(): string {
    return this.config.get<string>('JWT_ACCESS_TTL') ?? '24h';
  }

  private get refreshTtl(): string {
    return this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';
  }

  async register(
    dto: RegisterDto,
  ): Promise<{ email: string; expiresInSeconds: number }> {
    const email = dto.email.trim().toLowerCase();
    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const displayName = dto.displayName?.trim() || email.split('@')[0];
    const code = String(randomInt(100000, 1000000));
    const passwordHash = await hashPassword(dto.password);
    const expiresAt = new Date(Date.now() + SIGNUP_OTP_TTL_MS);
    await this.prisma.emailSignupOtp.upsert({
      where: { email },
      create: {
        email,
        codeHash: hashWithPepper(code, this.otpPepper),
        passwordHash,
        displayName,
        attempts: 0,
        expiresAt,
      },
      update: {
        codeHash: hashWithPepper(code, this.otpPepper),
        passwordHash,
        displayName,
        attempts: 0,
        expiresAt,
      },
    });
    const message = renderTransactionalEmail({
      preview: 'Your ReWorth sign-up code',
      title: 'Confirm your email',
      greeting: `Hi ${displayName},`,
      paragraphs: [
        `Your sign-up code is ${code}. It expires in 10 minutes.`,
        'If you did not ask for this, you can ignore the email.',
      ],
      footerNote: 'Thanks,\nThe ReWorth Team',
    });
    await this.email.send({
      to: email,
      subject: 'Your ReWorth sign-up code',
      text: message.text,
      html: message.html,
      meta: { emailCategory: 'signup_otp' },
    });
    // shortcut: mock inbox logs the code, drop this when every env has a real mailbox
    if (this.email.name === 'mock-email') {
      this.logger.log(`signup otp for ${email}: ${code}`);
    }
    return { email, expiresInSeconds: SIGNUP_OTP_TTL_MS / 1000 };
  }

  async verifyEmailOtp(
    dto: VerifyEmailOtpDto,
    ip?: string,
  ): Promise<TokenPair & { userId: string }> {
    const email = dto.email.trim().toLowerCase();
    const row = await this.prisma.emailSignupOtp.findUnique({
      where: { email },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      if (row) {
        await this.prisma.emailSignupOtp.delete({ where: { email } });
      }
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (row.attempts >= SIGNUP_OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts. Request a new code.');
    }
    const given = Buffer.from(hashWithPepper(dto.code.trim(), this.otpPepper));
    const expected = Buffer.from(row.codeHash);
    const match =
      given.length === expected.length && timingSafeEqual(given, expected);
    if (!match) {
      await this.prisma.emailSignupOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.prisma.emailSignupOtp.delete({ where: { email } });
    const user = await this.createUserWithPassword({
      email,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
    });
    await this.sendWelcome(email, row.displayName, user.id);
    const tokens = await this.issueTokenPair(user.id, dto.device);
    await this.audit.log({
      actorUserId: user.id,
      action: 'REGISTER',
      entityType: 'User',
      entityId: user.id,
      afterJson: { email, method: 'email_otp' },
      ip: ip ?? null,
    });
    return { ...tokens, userId: user.id };
  }

  private get otpPepper(): string {
    return this.config.get<string>('OTP_PEPPER') ?? 'dev-otp-pepper';
  }

  private async sendWelcome(
    email: string,
    displayName: string,
    userId: string,
  ) {
    const appUrl = resolvePublicAppUrl(
      this.config.get<string>('EMAIL_APP_URL'),
      this.config.get<string>('APP_URL'),
      this.config.get<string>('WEB_ORIGIN'),
    );
    const welcome = renderTransactionalEmail({
      preview: 'Your account was created successfully.',
      title: 'Welcome to ReWorth',
      greeting: `Hi ${displayName},`,
      paragraphs: [
        'Your ReWorth account is ready. You can sign in anytime to browse listings near you, message buyers and sellers, and list items when you are ready.',
      ],
      cta: appUrl
        ? {
            label: 'Open ReWorth',
            url: appUrl,
          }
        : undefined,
      footerNote: 'Thanks,\nThe ReWorth Team',
      appUrl,
    });
    await this.email.send({
      to: email,
      subject: 'Welcome to ReWorth',
      text: welcome.text,
      html: welcome.html,
      meta: {
        emailCategory: 'welcome',
        entityRefId: `welcome-${userId}`,
      },
    });
  }

  async login(dto: LoginDto, ip?: string): Promise<TokenPair & { userId: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        suspendedAccountMessage(),
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account unavailable');
    }
    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokenPair(user.id, dto.device);
    await this.audit.log({
      actorUserId: user.id,
      actorRole: user.roles[0]?.role ?? null,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ip: ip ?? null,
    });
    return { ...tokens, userId: user.id };
  }

  async refresh(refreshToken: string, ip?: string): Promise<TokenPair> {
    const tokenHash = hashWithPepper(refreshToken, this.refreshPepper);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Reuse of a revoked/rotated token → revoke entire family
    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        actorUserId: existing.userId,
        action: 'REFRESH_REUSE_DETECTED',
        entityType: 'RefreshTokenFamily',
        entityId: existing.familyId,
        ip: ip ?? null,
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const plain = newRefreshTokenPlain();
    const newHash = hashWithPepper(plain, this.refreshPepper);
    const expiresAt = new Date(
      Date.now() + parseTtlToMs(this.refreshTtl, 30 * 86_400_000),
    );

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        deviceId: existing.deviceId,
        familyId: existing.familyId,
        tokenHash: newHash,
        expiresAt,
      },
    });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });

    const accessToken = await this.signAccess(existing.userId);
    return {
      accessToken,
      refreshToken: plain,
      expiresIn: this.accessTtl,
    };
  }

  async logout(refreshToken?: string, userId?: string, ip?: string) {
    if (refreshToken) {
      const tokenHash = hashWithPepper(refreshToken, this.refreshPepper);
      const existing = await this.prisma.refreshToken.findFirst({
        where: { tokenHash },
      });
      if (existing && !existing.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
        await this.audit.log({
          actorUserId: existing.userId,
          action: 'LOGOUT',
          entityType: 'RefreshToken',
          entityId: existing.id,
          ip: ip ?? null,
        });
      }
      return { ok: true };
    }
    if (userId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        actorUserId: userId,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: userId,
        ip: ip ?? null,
      });
    }
    return { ok: true };
  }

  async oauthCallback(
    provider: string,
    dto: OAuthCallbackDto,
    ip?: string,
  ): Promise<TokenPair & { userId: string }> {
    const p = provider.toLowerCase();
    if (p !== 'google' && p !== 'apple') {
      throw new BadRequestException('Unsupported OAuth provider');
    }
    if (!dto.idToken && !dto.code) {
      throw new BadRequestException('idToken or code required');
    }

    // Mock provider: configurable via env or token payload shape
    const mockEmail =
      this.config.get<string>(`OAUTH_MOCK_${p.toUpperCase()}_EMAIL`) ??
      `${p}.user@example.com`;
    const mockName =
      this.config.get<string>(`OAUTH_MOCK_${p.toUpperCase()}_NAME`) ??
      `${p} User`;

    let user = await this.prisma.user.findUnique({
      where: { email: mockEmail },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: mockEmail,
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
          profile: {
            create: {
              displayName: mockName,
              preferredCommunity: '',
            },
          },
          verifications: {
            create: {
              level: VerificationLevel.L2_EMAIL,
              status: VerificationStatus.VERIFIED,
              verifiedAt: new Date(),
            },
          },
        },
      });
    } else if (!user.emailVerifiedAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    const tokens = await this.issueTokenPair(user.id, dto.device);
    await this.audit.log({
      actorUserId: user.id,
      action: 'OAUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      afterJson: { provider: p },
      ip: ip ?? null,
    });
    return { ...tokens, userId: user.id };
  }

  async createUserWithPassword(input: {
    email: string;
    password?: string;
    /** Already argon2-hashed. Used after email OTP so the password is not stored twice. */
    passwordHash?: string;
    displayName?: string;
    roles?: AdminRole[];
  }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    if (!input.password && !input.passwordHash) {
      throw new BadRequestException('Password required');
    }
    const passwordHash =
      input.passwordHash ?? (await hashPassword(input.password!));
    return this.prisma.user.create({
      data: {
        email,
        emailVerifiedAt: new Date(),
        passwordHash,
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: input.displayName ?? email.split('@')[0],
            preferredCommunity: '',
          },
        },
        roles: input.roles?.length
          ? { create: input.roles.map((role) => ({ role })) }
          : undefined,
        verifications: {
          create: {
            level: VerificationLevel.L2_EMAIL,
            status: VerificationStatus.VERIFIED,
            verifiedAt: new Date(),
          },
        },
      },
      include: { roles: true, profile: true },
    });
  }

  private async issueTokenPair(
    userId: string,
    device?: DeviceDto,
  ): Promise<TokenPair> {
    let deviceId: string | undefined;
    if (device) {
      const created = await this.prisma.device.create({
        data: {
          userId,
          name: device.name,
          platform: device.platform ?? DevicePlatform.UNKNOWN,
          lastSeenAt: new Date(),
        },
      });
      deviceId = created.id;
    }

    const accessToken = await this.signAccess(userId);
    const plain = newRefreshTokenPlain();
    const tokenHash = hashWithPepper(plain, this.refreshPepper);
    const expiresAt = new Date(
      Date.now() + parseTtlToMs(this.refreshTtl, 30 * 86_400_000),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        deviceId,
        familyId: newFamilyId(),
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: plain,
      expiresIn: this.accessTtl,
    };
  }

  /** Public wrapper for admin session issuance after TOTP. */
  async issueSession(
    userId: string,
    device?: DeviceDto,
  ): Promise<TokenPair> {
    return this.issueTokenPair(userId, device);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async signAccessToken(userId: string): Promise<string> {
    return this.signAccess(userId);
  }

  private async signAccess(userId: string): Promise<string> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });
    const roleCodes = roles.map((r) => r.role);
    const isAdmin = roleCodes.length > 0;
    let totpVerified = false;
    if (isAdmin) {
      const totp = await this.prisma.adminTotp.findUnique({
        where: { userId },
        select: { verified: true, enabledAt: true },
      });
      totpVerified = Boolean(totp?.verified && totp.enabledAt);
    }
    return this.jwt.sign(
      {
        sub: userId,
        typ: 'access',
        roles: roleCodes,
        admin: isAdmin,
        totpVerified,
      },
      {
        secret:
          this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
        expiresIn: this.accessTtl,
      },
    );
  }
}
