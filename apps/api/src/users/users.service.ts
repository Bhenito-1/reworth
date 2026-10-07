import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ConsentChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateConsentsDto } from './dto/consents.dto';

function deletedHash(userId: string, kind: string): string {
  return (
    'deleted_' +
    createHash('sha256')
      .update(`${kind}:${userId}`)
      .digest('hex')
      .slice(0, 24)
  );
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        verifications: {
          orderBy: { createdAt: 'desc' },
        },
        roles: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const profile = user.profile
      ? {
          displayName: user.profile.displayName,
          // Privacy: only expose fullName when showFullName is true
          fullName: user.profile.showFullName ? user.profile.fullName : null,
          avatarUrl: user.profile.avatarUrl,
          bio: user.profile.bio,
          birthYear: user.profile.birthYear,
          preferredCommunity: user.profile.preferredCommunity,
          language: user.profile.language,
          currency: user.profile.currency,
          showFullName: user.profile.showFullName,
          quietHoursStart: user.profile.quietHoursStart,
          quietHoursEnd: user.profile.quietHoursEnd,
        }
      : null;

    const levels = {
      L1_PHONE: user.verifications.some(
        (v) => v.level === 'L1_PHONE' && v.status === 'VERIFIED',
      ),
      L2_EMAIL: user.verifications.some(
        (v) => v.level === 'L2_EMAIL' && v.status === 'VERIFIED',
      ),
      L3_IDENTITY: user.verifications.some(
        (v) => v.level === 'L3_IDENTITY' && v.status === 'VERIFIED',
      ),
    };

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      status: user.status,
      riskLevel: user.riskLevel,
      riskScore: user.riskScore,
      enhancedVerificationRequired: user.enhancedVerificationRequired,
      phoneVerifiedAt: user.phoneVerifiedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      profile,
      verificationLevels: levels,
      identityVerifiedBadge: levels.L3_IDENTITY,
      roles: user.roles.map((r) => r.role),
      createdAt: user.createdAt,
    };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException('Profile not found');
    }

    const updated = await this.prisma.profile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName }
          : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.birthYear !== undefined ? { birthYear: dto.birthYear } : {}),
        ...(dto.preferredCommunity !== undefined
          ? { preferredCommunity: dto.preferredCommunity }
          : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.showFullName !== undefined
          ? { showFullName: dto.showFullName }
          : {}),
        ...(dto.quietHoursStart !== undefined
          ? { quietHoursStart: dto.quietHoursStart }
          : {}),
        ...(dto.quietHoursEnd !== undefined
          ? { quietHoursEnd: dto.quietHoursEnd }
          : {}),
      },
    });

    await this.audit.log({
      actorUserId: userId,
      action: 'PROFILE_UPDATED',
      entityType: 'Profile',
      entityId: updated.id,
      beforeJson: {
        displayName: existing.displayName,
        showFullName: existing.showFullName,
      },
      afterJson: {
        displayName: updated.displayName,
        showFullName: updated.showFullName,
      },
    });

    return this.getMe(userId);
  }

  async exportMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        addresses: true,
        devices: {
          where: { revokedAt: null },
          select: {
            id: true,
            name: true,
            platform: true,
            fingerprint: true,
            lastSeenAt: true,
            createdAt: true,
          },
        },
        consentRecords: true,
        listings: {
          select: {
            id: true,
            title: true,
            status: true,
            priceKobo: true,
            community: true,
            createdAt: true,
            publishedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        },
        ordersAsBuyer: {
          select: { id: true, status: true, totalKobo: true, createdAt: true },
          take: 200,
        },
        ordersAsSeller: {
          select: { id: true, status: true, totalKobo: true, createdAt: true },
          take: 200,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.audit.log({
      actorUserId: userId,
      action: 'USER_DATA_EXPORTED',
      entityType: 'User',
      entityId: userId,
    });

    return {
      exportedAt: new Date().toISOString(),
      profile: user.profile,
      contact: {
        phone: user.phone,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
      },
      addresses: user.addresses,
      listings: user.listings,
      orders: {
        asBuyer: user.ordersAsBuyer.map((o) => ({
          id: o.id,
          status: o.status,
          totalKobo: o.totalKobo,
          createdAt: o.createdAt,
        })),
        asSeller: user.ordersAsSeller.map((o) => ({
          id: o.id,
          status: o.status,
          totalKobo: o.totalKobo,
          createdAt: o.createdAt,
        })),
      },
      consents: user.consentRecords,
      devices: user.devices,
    };
  }

  async getConsents(userId: string) {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
    });
    const byChannel = new Map(rows.map((r) => [r.channel, r]));
    const channels: ConsentChannel[] = ['MARKETING', 'EMAIL'];
    return {
      consents: channels.map((channel) => {
        const row = byChannel.get(channel);
        return {
          channel,
          granted: row?.granted ?? false,
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    };
  }

  async updateConsents(userId: string, dto: UpdateConsentsDto) {
    for (const item of dto.consents) {
      await this.prisma.consentRecord.upsert({
        where: {
          userId_channel: { userId, channel: item.channel as ConsentChannel },
        },
        create: {
          userId,
          channel: item.channel as ConsentChannel,
          granted: item.granted,
        },
        update: { granted: item.granted },
      });
    }

    await this.audit.log({
      actorUserId: userId,
      action: 'CONSENTS_UPDATED',
      entityType: 'User',
      entityId: userId,
      afterJson: { consents: dto.consents } as unknown as Prisma.InputJsonValue,
    });

    return this.getConsents(userId);
  }

  async listDevices(userId: string) {
    const devices = await this.prisma.device.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        name: true,
        platform: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return { devices };
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: deviceId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      actorUserId: userId,
      action: 'DEVICE_REVOKED',
      entityType: 'Device',
      entityId: deviceId,
    });

    return { ok: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorUserId: userId,
      action: 'LOGOUT_ALL',
      entityType: 'User',
      entityId: userId,
    });
    return { ok: true };
  }

  async requestDelete(userId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, addresses: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const phonePseudo = deletedHash(userId, 'phone');
    const emailPseudo = `${deletedHash(userId, 'email')}@deleted.reworth.local`;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          phone: phonePseudo,
          email: emailPseudo,
          passwordHash: null,
          phoneVerifiedAt: null,
          emailVerifiedAt: null,
        },
      });

      if (user.profile) {
        await tx.profile.update({
          where: { userId },
          data: {
            displayName: 'Deleted User',
            fullName: null,
            avatarUrl: null,
            bio: null,
            showFullName: false,
          },
        });
      }

      // Scrub address PII; keep rows for FK integrity where needed
      await tx.address.updateMany({
        where: { userId },
        data: {
          line1: '[redacted]',
          line2: null,
          geoLat: null,
          geoLng: null,
          label: 'Deleted',
        },
      });

      // Clear private meetup addresses on seller listings
      await tx.listing.updateMany({
        where: { sellerId: userId },
        data: { addressPrivate: null },
      });

      // Null/redact address disclosures created by this user
      await tx.addressDisclosure.updateMany({
        where: { disclosedById: userId },
        data: { addressSnapshot: '[redacted]' },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.device.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.log({
      actorUserId: userId,
      action: 'USER_DELETED_PSEUDONYMISED',
      entityType: 'User',
      entityId: userId,
      beforeJson: {
        status: user.status,
        hadPhone: Boolean(user.phone),
        hadEmail: Boolean(user.email),
      },
      afterJson: { status: 'DELETED', pseudonymised: true },
      ip: ip ?? null,
    });

    return { ok: true, deleted: true, pseudonymised: true };
  }
}
