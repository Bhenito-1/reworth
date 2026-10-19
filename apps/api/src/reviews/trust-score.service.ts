import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { VerificationLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { aggregateBuyerRatings } from './buyer-rating';
import {
  computeTrustScore,
  median,
  publicTrustBadge,
  type TrustScoreInputs,
  type VerificationTier,
} from './trust-score.compute';

export type TrustScoreBreakdownDto = {
  userId: string;
  score: number;
  tier: 'TOP_SELLER' | 'TRUSTED' | null;
  publicBadge: 'Top Seller' | 'Trusted' | null;
  completionRate: number;
  avgRating: number | null;
  medianResponseMinutes: number | null;
  cancellationRate: number;
  disputeRate: number;
  accountAgeDays: number;
  verificationPoints: number;
  components: {
    completion: number;
    avgRating: number;
    medianResponse: number;
    cancellation: number;
    dispute: number;
    accountAge: number;
    verification: number;
  };
  computedAt: Date;
};

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recompute(
    userId: string,
    reason = 'recompute',
  ): Promise<TrustScoreBreakdownDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        verifications: {
          where: { status: 'VERIFIED' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const inputs = await this.gatherInputs(userId, user.createdAt, user.verifications);
    const result = computeTrustScore(inputs);

    const existing = await this.prisma.trustScore.findUnique({
      where: { userId },
    });

    const row = await this.prisma.trustScore.upsert({
      where: { userId },
      create: {
        userId,
        score: result.score,
        tier: result.tier,
        completionRate: inputs.completionRate,
        avgRating: inputs.avgRating,
        medianResponseMinutes: inputs.medianResponseMinutes,
        cancellationRate: inputs.cancellationRate,
        disputeRate: inputs.disputeRate,
        accountAgeDays: inputs.accountAgeDays,
        verificationPoints: result.verificationPoints,
        computedAt: new Date(),
      },
      update: {
        score: result.score,
        tier: result.tier,
        completionRate: inputs.completionRate,
        avgRating: inputs.avgRating,
        medianResponseMinutes: inputs.medianResponseMinutes,
        cancellationRate: inputs.cancellationRate,
        disputeRate: inputs.disputeRate,
        accountAgeDays: inputs.accountAgeDays,
        verificationPoints: result.verificationPoints,
        computedAt: new Date(),
      },
    });

    if (!existing || existing.score !== result.score || existing.tier !== result.tier) {
      await this.prisma.trustScoreHistory.create({
        data: {
          userId,
          score: result.score,
          tier: result.tier,
          reason,
        },
      });
    }

    return this.toBreakdown(row.userId, {
      score: result.score,
      tier: result.tier,
      completionRate: inputs.completionRate,
      avgRating: inputs.avgRating,
      medianResponseMinutes: inputs.medianResponseMinutes,
      cancellationRate: inputs.cancellationRate,
      disputeRate: inputs.disputeRate,
      accountAgeDays: inputs.accountAgeDays,
      verificationPoints: result.verificationPoints,
      components: result.components,
      computedAt: row.computedAt,
    });
  }

  async getBreakdown(userId: string): Promise<TrustScoreBreakdownDto> {
    const row = await this.prisma.trustScore.findUnique({ where: { userId } });
    if (!row) {
      return this.recompute(userId, 'lazy_init');
    }
    return this.toBreakdown(userId, {
      score: row.score,
      tier: (row.tier as 'TOP_SELLER' | 'TRUSTED' | null) ?? null,
      completionRate: row.completionRate,
      avgRating: row.avgRating,
      medianResponseMinutes: row.medianResponseMinutes,
      cancellationRate: row.cancellationRate,
      disputeRate: row.disputeRate,
      accountAgeDays: row.accountAgeDays,
      verificationPoints: row.verificationPoints,
      components: computeTrustScore({
        completionRate: row.completionRate,
        avgRating: row.avgRating,
        medianResponseMinutes: row.medianResponseMinutes,
        cancellationRate: row.cancellationRate,
        disputeRate: row.disputeRate,
        accountAgeDays: row.accountAgeDays,
        verificationLevel: this.pointsToLevel(row.verificationPoints),
      }).components,
      computedAt: row.computedAt,
    });
  }

  async recomputeMany(reason = 'daily_cron'): Promise<number> {
    const participants = await this.prisma.order.findMany({
      where: {
        status: { in: ['COMPLETED', 'CANCELLED', 'DISPUTE_HOLD', 'REFUND_ISSUED'] },
      },
      select: { buyerId: true, sellerId: true },
      distinct: ['buyerId', 'sellerId'],
    });
    const ids = new Set<string>();
    for (const o of participants) {
      ids.add(o.buyerId);
      ids.add(o.sellerId);
    }
    const existing = await this.prisma.trustScore.findMany({
      select: { userId: true },
    });
    for (const t of existing) ids.add(t.userId);

    let count = 0;
    for (const userId of ids) {
      try {
        await this.recompute(userId, reason);
        count++;
      } catch (err) {
        this.logger.warn(
          `Trust recompute failed for ${userId}: ${(err as Error).message}`,
        );
      }
    }
    return count;
  }

  private async gatherInputs(
    userId: string,
    createdAt: Date,
    verifications: { level: VerificationLevel }[],
  ): Promise<TrustScoreInputs> {
    const [completed, cancelled, disputedOrders, ratingRows, samples] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            status: 'COMPLETED',
            OR: [{ buyerId: userId }, { sellerId: userId }],
          },
        }),
        this.prisma.order.count({
          where: {
            status: 'CANCELLED',
            OR: [{ buyerId: userId }, { sellerId: userId }],
          },
        }),
        this.prisma.order.count({
          where: {
            OR: [{ buyerId: userId }, { sellerId: userId }],
            disputes: { some: {} },
          },
        }),
        this.prisma.review.findMany({
          where: { revieweeId: userId, status: 'PUBLISHED' },
          select: {
            transactionExperience: true,
            reviewerId: true,
            order: { select: { id: true, buyerId: true, checkoutId: true } },
          },
        }),
        this.prisma.chatResponseSample.findMany({
          where: {
            sellerId: userId,
            firstReplyAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
          select: { latencyMinutes: true },
        }),
      ]);

    const denom = completed + cancelled;
    const completionRate = denom === 0 ? 1 : completed / denom;
    const cancellationRate = denom === 0 ? 0 : cancelled / denom;
    const disputeRate = denom === 0 ? 0 : disputedOrders / denom;

    const accountAgeDays = Math.max(
      0,
      Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const buyerRatings = ratingRows.filter(
      (row) => row.reviewerId === row.order.buyerId,
    );
    const avgRating = aggregateBuyerRatings(
      buyerRatings.map((row) => ({
        buyerId: row.order.buyerId,
        orderId: row.order.id,
        checkoutId: row.order.checkoutId,
        score: row.transactionExperience,
      })),
    ).average;

    return {
      completionRate,
      avgRating,
      medianResponseMinutes: median(samples.map((s) => s.latencyMinutes)),
      cancellationRate,
      disputeRate,
      accountAgeDays,
      verificationLevel: this.highestVerification(verifications),
    };
  }

  private highestVerification(
    verifications: { level: VerificationLevel }[],
  ): VerificationTier {
    const levels = new Set(verifications.map((v) => v.level));
    if (levels.has('L3_IDENTITY')) return 'L3_IDENTITY';
    if (levels.has('L2_EMAIL')) return 'L2_EMAIL';
    if (levels.has('L1_PHONE')) return 'L1_PHONE';
    return null;
  }

  private pointsToLevel(points: number): VerificationTier {
    if (points >= 100) return 'L3_IDENTITY';
    if (points >= 60) return 'L2_EMAIL';
    if (points >= 30) return 'L1_PHONE';
    return null;
  }

  private toBreakdown(
    userId: string,
    data: {
      score: number;
      tier: 'TOP_SELLER' | 'TRUSTED' | null;
      completionRate: number;
      avgRating: number | null;
      medianResponseMinutes: number | null;
      cancellationRate: number;
      disputeRate: number;
      accountAgeDays: number;
      verificationPoints: number;
      components: TrustScoreBreakdownDto['components'];
      computedAt: Date;
    },
  ): TrustScoreBreakdownDto {
    return {
      userId,
      score: data.score,
      tier: data.tier,
      publicBadge: publicTrustBadge(data.tier),
      completionRate: data.completionRate,
      avgRating: data.avgRating,
      medianResponseMinutes: data.medianResponseMinutes,
      cancellationRate: data.cancellationRate,
      disputeRate: data.disputeRate,
      accountAgeDays: data.accountAgeDays,
      verificationPoints: data.verificationPoints,
      components: data.components,
      computedAt: data.computedAt,
    };
  }
}
