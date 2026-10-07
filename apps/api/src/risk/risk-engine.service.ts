import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { Prisma, RiskLevel } from '@prisma/client';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { FRAUD, SUPPORT } from '../admin/admin-roles';
import { PrismaService } from '../prisma/prisma.service';
import { FraudRulesService } from '../listings/fraud-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DEFAULT_RULE_WEIGHTS,
  DEFAULT_THRESHOLDS,
  firesDeviceFingerprint,
  firesLocationJump,
  firesLowPrice,
  firesOffPlatformChat,
  firesRapidListing,
  firesRepeatedCancel,
  firesReportedUser,
  firesSuspiciousPayment,
  levelFromScore,
  maxRiskLevel,
  sumFiredWeights,
  type FiredRule,
  type RiskRuleCode,
} from './risk-rules.table';

export type RiskEngineResult = {
  level: RiskLevel;
  score: number;
  flags: string[];
  rulesFired: FiredRule[];
  forceUnderReview: boolean;
  riskEvents: Array<{
    kind: string;
    score: number;
    detail: Record<string, unknown>;
  }>;
};

@Injectable()
export class RiskEngineService {
  private readonly logger = new Logger(RiskEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FraudRulesService))
    private readonly fraud: FraudRulesService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  async evaluateOnPublish(
    listingId: string,
    sellerId: string,
  ): Promise<RiskEngineResult> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        images: true,
        category: true,
        subcategory: true,
        seller: { include: { profile: true, devices: true } },
      },
    });
    if (!listing || listing.sellerId !== sellerId) {
      return {
        level: 'LOW',
        score: 0,
        flags: [],
        rulesFired: [],
        forceUnderReview: false,
        riskEvents: [],
      };
    }

    const weights = await this.loadWeights();
    const thresholds = await this.loadThresholds();
    const fired: FiredRule[] = [];
    const riskEvents: RiskEngineResult['riskEvents'] = [];

    // 1–2: reuse FraudRulesService for duplicate image + estimate helper
    const fraud = await this.fraud.evaluateListing(listingId);
    if (fraud.flags.includes('DUPLICATE_IMAGE')) {
      const detail =
        fraud.riskEvents.find((e) => e.kind === 'DUPLICATE_IMAGE')?.detail ??
        {};
      fired.push({
        code: 'DUPLICATE_IMAGE',
        weight: weights.DUPLICATE_IMAGE,
        detail,
      });
      riskEvents.push({
        kind: 'DUPLICATE_IMAGE',
        score: weights.DUPLICATE_IMAGE,
        detail,
      });
    }

    const estimateLow = this.fraud.estimateLowKobo(listing);
    if (firesLowPrice(listing.priceKobo, estimateLow)) {
      const detail = {
        priceKobo: listing.priceKobo,
        estimatedLowKobo: estimateLow,
        thresholdKobo: Math.round(estimateLow * 0.3),
      };
      fired.push({
        code: 'LOW_PRICE',
        weight: weights.LOW_PRICE,
        detail,
      });
      riskEvents.push({
        kind: 'LOW_PRICE',
        score: weights.LOW_PRICE,
        detail,
      });
    }

    // 3. RAPID_LISTING
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const listingsLastHour = await this.prisma.listing.count({
      where: {
        sellerId,
        createdAt: { gte: hourAgo },
      },
    });
    if (firesRapidListing(listingsLastHour)) {
      const detail = { listingsLastHour };
      fired.push({
        code: 'RAPID_LISTING',
        weight: weights.RAPID_LISTING,
        detail,
      });
      riskEvents.push({
        kind: 'RAPID_LISTING',
        score: weights.RAPID_LISTING,
        detail,
      });
    }

    // 4. REPORTED_USER
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [openReports, reportsLast30d] = await Promise.all([
      this.prisma.report.count({
        where: { reportedUserId: sellerId, status: 'OPEN' },
      }),
      this.prisma.report.count({
        where: {
          reportedUserId: sellerId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);
    if (firesReportedUser({ openReports, reportsLast30d })) {
      const detail = { openReports, reportsLast30d };
      fired.push({
        code: 'REPORTED_USER',
        weight: weights.REPORTED_USER,
        detail,
      });
      riskEvents.push({
        kind: 'REPORTED_USER',
        score: weights.REPORTED_USER,
        detail,
      });
    }

    // 5. DEVICE_FINGERPRINT
    const deviceUsers = await this.countSharedDeviceUsers(sellerId);
    if (firesDeviceFingerprint(deviceUsers.maxShared)) {
      const detail = {
        maxShared: deviceUsers.maxShared,
        via: deviceUsers.via,
      };
      fired.push({
        code: 'DEVICE_FINGERPRINT',
        weight: weights.DEVICE_FINGERPRINT,
        detail,
      });
      riskEvents.push({
        kind: 'DEVICE_FINGERPRINT',
        score: weights.DEVICE_FINGERPRINT,
        detail,
      });
    }

    // 6. REPEATED_CANCEL
    const cancelledLast30d = await this.prisma.order.count({
      where: {
        status: 'CANCELLED',
        createdAt: { gte: thirtyDaysAgo },
        OR: [{ buyerId: sellerId }, { sellerId }],
      },
    });
    if (firesRepeatedCancel(cancelledLast30d)) {
      const detail = { cancelledLast30d };
      fired.push({
        code: 'REPEATED_CANCEL',
        weight: weights.REPEATED_CANCEL,
        detail,
      });
      riskEvents.push({
        kind: 'REPEATED_CANCEL',
        score: weights.REPEATED_CANCEL,
        detail,
      });
    }

    // 7. SUSPICIOUS_PAYMENT — new device + high listing price
    const newestDevice = await this.prisma.device.findFirst({
      where: { userId: sellerId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const deviceAgeMs = newestDevice
      ? Date.now() - newestDevice.createdAt.getTime()
      : null;
    const chargebackCount = await this.prisma.riskEvent.count({
      where: {
        userId: sellerId,
        kind: { contains: 'CHARGEBACK' },
      },
    });
    if (
      firesSuspiciousPayment({
        deviceAgeMs,
        amountKobo: listing.priceKobo,
        hasChargebackFlag: chargebackCount > 0,
      })
    ) {
      const detail = {
        deviceAgeMs,
        amountKobo: listing.priceKobo,
        chargebackCount,
      };
      fired.push({
        code: 'SUSPICIOUS_PAYMENT',
        weight: weights.SUSPICIOUS_PAYMENT,
        detail,
      });
      riskEvents.push({
        kind: 'SUSPICIOUS_PAYMENT',
        score: weights.SUSPICIOUS_PAYMENT,
        detail,
      });
    }

    // 8. OFF_PLATFORM_CHAT
    const chatScanCount = await this.prisma.riskEvent.count({
      where: {
        userId: sellerId,
        kind: { startsWith: 'CHAT_SCAN_' },
        createdAt: { gte: thirtyDaysAgo },
      },
    });
    if (firesOffPlatformChat(chatScanCount)) {
      const detail = { chatScanCount };
      fired.push({
        code: 'OFF_PLATFORM_CHAT',
        weight: weights.OFF_PLATFORM_CHAT,
        detail,
      });
      riskEvents.push({
        kind: 'OFF_PLATFORM_CHAT',
        score: weights.OFF_PLATFORM_CHAT,
        detail,
      });
    }

    // 9. LOCATION_JUMP
    if (
      firesLocationJump({
        listingCommunity: listing.community,
        preferredCommunity: listing.seller.profile?.preferredCommunity,
      })
    ) {
      const detail = {
        listingCommunity: listing.community,
        preferredCommunity: listing.seller.profile?.preferredCommunity ?? '',
      };
      fired.push({
        code: 'LOCATION_JUMP',
        weight: weights.LOCATION_JUMP,
        detail,
      });
      riskEvents.push({
        kind: 'LOCATION_JUMP',
        score: weights.LOCATION_JUMP,
        detail,
      });
    }

    const score = sumFiredWeights(fired);
    const level = levelFromScore(score, thresholds) as RiskLevel;
    const flags = fired.map((f) => f.code);
    const forceUnderReview = level === 'HIGH';

    await this.prisma.riskAssessment.create({
      data: {
        userId: sellerId,
        listingId,
        level,
        score,
        rulesFired: fired as unknown as Prisma.InputJsonValue,
      },
    });

    for (const ev of riskEvents) {
      await this.prisma.riskEvent.create({
        data: {
          userId: sellerId,
          listingId,
          kind: ev.kind,
          score: ev.score,
          detail: ev.detail as Prisma.InputJsonValue,
        },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: sellerId } });
    if (user) {
      if (level === 'HIGH') {
        await this.prisma.user.update({
          where: { id: sellerId },
          data: {
            riskLevel: 'HIGH',
            riskScore: score,
            enhancedVerificationRequired: true,
          },
        });
        await this.notifyHighRiskUser(sellerId, listingId, score, flags);
      } else if (level === 'MEDIUM') {
        const next = maxRiskLevel(
          user.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
          'MEDIUM',
        );
        await this.prisma.user.update({
          where: { id: sellerId },
          data: {
            riskLevel: next,
            riskScore: Math.max(user.riskScore, score),
          },
        });
      } else if (score > user.riskScore) {
        await this.prisma.user.update({
          where: { id: sellerId },
          data: { riskScore: score },
        });
      }
    }

    if (forceUnderReview) {
      await this.prisma.listing.update({
        where: { id: listingId },
        data: { riskFlags: flags },
      });
    }

    if (level === 'HIGH') {
      await this.alerts?.notify({
        roles: FRAUD,
        kind: 'RISK',
        title: 'Seller flagged high risk',
        body: `Risk score ${score}${flags.length ? `. Flags: ${flags.join(', ')}` : ''}.`,
        href: '/fraud',
        entityType: 'Listing',
        entityId: listingId,
      });
    }

    this.logger.log({
      listingId,
      sellerId,
      level,
      score,
      flags,
      forceUnderReview,
    });

    return {
      level,
      score,
      flags,
      rulesFired: fired,
      forceUnderReview,
      riskEvents,
    };
  }

  private async loadWeights(): Promise<
    Record<Exclude<RiskRuleCode, 'THRESHOLDS'>, number>
  > {
    const rows = await this.prisma.riskRule.findMany({
      where: { enabled: true },
    });
    const weights = { ...DEFAULT_RULE_WEIGHTS };
    for (const row of rows) {
      const code = row.code as Exclude<RiskRuleCode, 'THRESHOLDS'>;
      if (code in weights) {
        weights[code] = row.weight;
      }
    }
    return weights;
  }

  private async loadThresholds(): Promise<{ medium: number; high: number }> {
    const row = await this.prisma.riskRule.findUnique({
      where: { code: 'THRESHOLDS' },
    });
    if (row?.config && typeof row.config === 'object' && !Array.isArray(row.config)) {
      const cfg = row.config as { medium?: number; high?: number };
      return {
        medium: typeof cfg.medium === 'number' ? cfg.medium : DEFAULT_THRESHOLDS.medium,
        high: typeof cfg.high === 'number' ? cfg.high : DEFAULT_THRESHOLDS.high,
      };
    }
    return { ...DEFAULT_THRESHOLDS };
  }

  private async countSharedDeviceUsers(userId: string): Promise<{
    maxShared: number;
    via: string;
  }> {
    const devices = await this.prisma.device.findMany({
      where: { userId, revokedAt: null },
    });
    let maxShared = 1;
    let via = 'none';

    for (const d of devices) {
      if (d.fingerprint) {
        const peers = await this.prisma.device.findMany({
          where: {
            fingerprint: d.fingerprint,
            revokedAt: null,
          },
          select: { userId: true },
        });
        const distinct = new Set(peers.map((p) => p.userId)).size;
        if (distinct > maxShared) {
          maxShared = distinct;
          via = 'fingerprint';
        }
      } else {
        const peers = await this.prisma.device.findMany({
          where: {
            name: d.name,
            platform: d.platform,
            revokedAt: null,
          },
          select: { userId: true },
        });
        const distinct = new Set(peers.map((p) => p.userId)).size;
        if (distinct > maxShared) {
          maxShared = distinct;
          via = 'name+platform';
        }
      }
    }

    return { maxShared, via };
  }

  private async notifyHighRiskUser(
    userId: string,
    listingId: string,
    score: number,
    flags: string[],
  ): Promise<void> {
    try {
      const ticket = await this.prisma.supportTicket.create({
        data: {
          userId,
          subject: 'High risk user',
          status: 'OPEN',
        },
      });
      await this.alerts?.notify({
        roles: SUPPORT,
        kind: 'SUPPORT',
        title: 'Support ticket opened',
        body: 'A high-risk seller needs a look.',
        href: '/support',
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    } catch (err) {
      this.logger.warn({ err, userId }, 'Failed to create high-risk support ticket');
    }

    try {
      await this.notifications.notify({
        userId,
        category: 'VERIFICATION_UPDATE',
        title: 'Enhanced verification required',
        body: 'Your account was flagged for additional review. Please complete enhanced verification.',
        deepLink: `/listings/${listingId}`,
        meta: { score, flags },
        channels: ['IN_APP'],
      });
    } catch (err) {
      this.logger.warn({ err, userId }, 'Failed to notify high-risk user');
    }
  }
}
