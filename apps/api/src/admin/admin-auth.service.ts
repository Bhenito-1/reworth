import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { DevicePlatform } from '@prisma/client';
import { generateSecret, generateURI, verify } from 'otplib';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from '../auth/crypto.util';
import { suspendedAccountMessage } from '../auth/suspended-account';
import type { AdminLoginDto, AdminTotpVerifyDto } from './dto/admin-ops.dto';

type AdminLoginResult =
  | {
      accessToken: string;
      refreshToken: string;
      expiresIn: string;
      userId: string;
      roles: string[];
      totpRequired?: false;
    }
  | {
      totpRequired: true;
      challengeToken: string;
      userId: string;
    };

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: AdminLoginDto, ip?: string): Promise<AdminLoginResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true, adminTotp: true },
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
    if (!user.roles.length) {
      throw new ForbiddenException('Admin role required');
    }

    const totpEnabled = Boolean(
      user.adminTotp?.verified && user.adminTotp.enabledAt,
    );
    if (totpEnabled) {
      const challengeToken = await this.jwt.signAsync(
        {
          sub: user.id,
          typ: 'admin_totp_challenge',
        },
        {
          secret:
            this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
          expiresIn: '5m',
        },
      );
      await this.audit.log({
        actorUserId: user.id,
        actorRole: user.roles[0]?.role ?? null,
        action: 'ADMIN_LOGIN_TOTP_REQUIRED',
        entityType: 'User',
        entityId: user.id,
        ip: ip ?? null,
      });
      return { totpRequired: true, challengeToken, userId: user.id };
    }

    const tokens = await this.auth.issueSession(user.id, {
      name: 'ReWorth Admin',
      platform: DevicePlatform.WEB,
    });
    await this.audit.log({
      actorUserId: user.id,
      actorRole: user.roles[0]?.role ?? null,
      action: 'ADMIN_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ip: ip ?? null,
    });
    return {
      ...tokens,
      userId: user.id,
      roles: user.roles.map((r) => r.role),
      totpRequired: false,
    };
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!user?.roles.length) {
      throw new ForbiddenException('Admin role required');
    }
    const secret = generateSecret();
    await this.prisma.adminTotp.upsert({
      where: { userId },
      create: { userId, secret, verified: false, enabledAt: null },
      update: { secret, verified: false, enabledAt: null },
    });
    const label = user.email ?? userId;
    const otpauthUrl = generateURI({
      issuer: 'ReWorth Admin',
      label,
      secret,
    });
    await this.audit.log({
      actorUserId: userId,
      actorRole: user.roles[0]?.role ?? null,
      action: 'ADMIN_TOTP_SETUP',
      entityType: 'AdminTotp',
      entityId: userId,
    });
    return { secret, otpauthUrl };
  }

  async verifyTotp(
    dto: AdminTotpVerifyDto,
    actorUserId?: string,
    ip?: string,
  ) {
    let userId = actorUserId;
    let completingLogin = false;

    if (dto.challengeToken) {
      let payload: { sub?: string; typ?: string };
      try {
        payload = await this.jwt.verifyAsync(dto.challengeToken, {
          secret:
            this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
        });
      } catch {
        throw new UnauthorizedException('Invalid or expired challenge');
      }
      if (payload.typ !== 'admin_totp_challenge' || !payload.sub) {
        throw new UnauthorizedException('Invalid challenge token');
      }
      userId = payload.sub;
      completingLogin = true;
    }

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const row = await this.prisma.adminTotp.findUnique({ where: { userId } });
    if (!row) {
      throw new UnauthorizedException('TOTP not set up');
    }

    const result = await verify({ secret: row.secret, token: dto.code });
    if (!result.valid) {
      throw new UnauthorizedException('Invalid authenticator code');
    }

    if (!row.verified || !row.enabledAt) {
      await this.prisma.adminTotp.update({
        where: { userId },
        data: { verified: true, enabledAt: new Date() },
      });
      await this.audit.log({
        actorUserId: userId,
        action: 'ADMIN_TOTP_ENABLED',
        entityType: 'AdminTotp',
        entityId: userId,
        ip: ip ?? null,
      });
    }

    if (completingLogin) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { roles: true },
      });
      if (!user?.roles.length) {
        throw new ForbiddenException('Admin role required');
      }
      const tokens = await this.auth.issueSession(userId, {
        name: 'ReWorth Admin',
        platform: DevicePlatform.WEB,
      });
      await this.audit.log({
        actorUserId: userId,
        actorRole: user.roles[0]?.role ?? null,
        action: 'ADMIN_LOGIN',
        entityType: 'User',
        entityId: userId,
        ip: ip ?? null,
      });
      return {
        ...tokens,
        userId,
        roles: user.roles.map((r) => r.role),
      };
    }

    return { ok: true, enabled: true };
  }
}
