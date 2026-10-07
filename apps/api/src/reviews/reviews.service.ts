import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ChatScanService } from '../chat/chat-scan.service';
import { ListingStatus } from '@prisma/client';
import { toPublicListing, type PublicListingDto } from '../listings/public-listing.mapper';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateReviewDto,
  ReplyReviewDto,
  ReportReviewDto,
} from './dto/reviews.dto';
import { publicTrustBadge } from './trust-score.compute';
import { TrustScoreService } from './trust-score.service';

const REVIEW_BLOCKLIST = [
  'whatsapp',
  'pay outside',
  'bank transfer only',
  'send money first',
  'off platform',
];

export type ReviewDto = {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  overall: number;
  accuracy: number;
  communication: number;
  punctuality: number;
  transactionExperience: number;
  body: string | null;
  photoKeys: string[];
  status: ReviewStatus;
  reply: string | null;
  repliedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  reviewer?: { id: string; displayName: string; avatarUrl: string | null };
};

export type PublicProfileDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  memberSince: number;
  identityVerified: boolean;
  successfulTransactions: number;
  avgRating: number | null;
  reviewCount: number;
  trustTier: 'Top Seller' | 'Trusted' | null;
  usuallyRespondsWithinMinutes: number | null;
  activeListings: PublicListingDto[];
  isFollowing: boolean | null;
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly trust: TrustScoreService,
    @Optional() private readonly chatScan?: ChatScanService,
  ) {}

  async createForOrder(
    orderId: string,
    reviewerId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'COMPLETED') {
      throw new ForbiddenException('Can only review completed orders');
    }
    if (reviewerId !== order.buyerId && reviewerId !== order.sellerId) {
      throw new ForbiddenException('Only order parties can review');
    }

    const revieweeId =
      reviewerId === order.buyerId ? order.sellerId : order.buyerId;

    const existing = await this.prisma.review.findUnique({
      where: {
        orderId_reviewerId: { orderId, reviewerId },
      },
    });
    if (existing) {
      throw new ForbiddenException('Already reviewed this order');
    }

    this.assertSubRatings(dto);
    await this.assertBodyClean(dto.body);

    const created = await this.prisma.review.create({
      data: {
        orderId,
        reviewerId,
        revieweeId,
        overall: dto.overall,
        accuracy: dto.accuracy,
        communication: dto.communication,
        punctuality: dto.punctuality,
        transactionExperience: dto.transactionExperience,
        body: dto.body?.trim() || null,
        photoKeys: dto.photoKeys ?? [],
        status: ReviewStatus.PENDING_MUTUAL,
      },
    });

    const counterpart = await this.prisma.review.findUnique({
      where: {
        orderId_reviewerId: { orderId, reviewerId: revieweeId },
      },
    });

    if (counterpart && counterpart.status === ReviewStatus.PENDING_MUTUAL) {
      const publishedAt = new Date();
      await this.prisma.review.updateMany({
        where: { orderId, status: ReviewStatus.PENDING_MUTUAL },
        data: { status: ReviewStatus.PUBLISHED, publishedAt },
      });

      await this.notifications.notify({
        userId: order.buyerId,
        category: NotificationCategory.REVIEW_RECEIVED,
        title: 'Reviews published',
        body: 'Both sides left a review — they are now visible on your profiles.',
        deepLink: `reworth://orders/${orderId}/reviews`,
        meta: { orderId },
      });
      await this.notifications.notify({
        userId: order.sellerId,
        category: NotificationCategory.REVIEW_RECEIVED,
        title: 'Reviews published',
        body: 'Both sides left a review — they are now visible on your profiles.',
        deepLink: `reworth://orders/${orderId}/reviews`,
        meta: { orderId },
      });

      await Promise.all([
        this.trust.recompute(order.buyerId, 'review_published'),
        this.trust.recompute(order.sellerId, 'review_published'),
      ]);

      const refreshed = await this.prisma.review.findUniqueOrThrow({
        where: { id: created.id },
      });
      return this.toDto(refreshed);
    }

    await this.notifications.notify({
      userId: revieweeId,
      category: NotificationCategory.REVIEW_RECEIVED,
      title: 'Review waiting',
      body: 'The other party left a review. Leave yours to unlock mutual publication.',
      deepLink: `reworth://orders/${orderId}/reviews`,
      meta: { orderId, reviewId: created.id },
    });

    return this.toDto(created);
  }

  async reply(
    reviewId: string,
    userId: string,
    dto: ReplyReviewDto,
  ): Promise<ReviewDto> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.revieweeId !== userId) {
      throw new ForbiddenException('Only the reviewee can reply');
    }
    if (review.reply != null) {
      throw new ConflictException('Reply already submitted');
    }
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Reply text required');
    if (text.length > 200) {
      throw new BadRequestException('Reply must be ≤200 characters');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { reply: text, repliedAt: new Date() },
    });
    return this.toDto(updated);
  }

  async report(
    reviewId: string,
    reporterId: string,
    dto: ReportReviewDto,
  ): Promise<{ id: string; reviewId: string }> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.status !== ReviewStatus.PUBLISHED) {
      throw new ForbiddenException('Can only report published reviews');
    }

    const row = await this.prisma.reviewReport.create({
      data: {
        reviewId,
        reporterId,
        reason: dto.reason.trim(),
      },
    });
    return { id: row.id, reviewId: row.reviewId };
  }

  async listPublishedForUser(userId: string): Promise<ReviewDto[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const rows = await this.prisma.review.findMany({
      where: { revieweeId: userId, status: ReviewStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: {
        reviewer: { include: { profile: true } },
      },
    });
    return rows.map((r) => this.toDto(r));
  }

  async getPublicProfile(
    userId: string,
    viewerId?: string | null,
  ): Promise<PublicProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        verifications: { where: { status: 'VERIFIED' } },
        trustScore: true,
      },
    });
    if (
      !user ||
      user.deletedAt ||
      user.status === 'DELETED' ||
      user.status === 'SUSPENDED'
    ) {
      throw new NotFoundException('User not found');
    }

    const [successfulTransactions, reviewAgg, listings, follow] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            status: 'COMPLETED',
            OR: [{ buyerId: userId }, { sellerId: userId }],
          },
        }),
        this.prisma.review.aggregate({
          where: { revieweeId: userId, status: ReviewStatus.PUBLISHED },
          _avg: { overall: true },
          _count: { _all: true },
        }),
        this.prisma.listing.findMany({
          where: {
            sellerId: userId,
            status: { in: [ListingStatus.LIVE, ListingStatus.RESERVED] },
          },
          orderBy: { publishedAt: 'desc' },
          take: 24,
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' } },
            seller: {
              include: {
                profile: true,
                verifications: true,
                trustScore: true,
                _count: {
                  select: {
                    reviewsReceived: {
                      where: { status: ReviewStatus.PUBLISHED },
                    },
                  },
                },
              },
            },
          },
        }),
        viewerId
          ? this.prisma.sellerFollow.findUnique({
              where: {
                followerId_sellerId: {
                  followerId: viewerId,
                  sellerId: userId,
                },
              },
            })
          : Promise.resolve(null),
      ]);

    const avgRating =
      reviewAgg._count._all > 0
        ? Math.round((reviewAgg._avg.overall ?? 0) * 10) / 10
        : null;

    const trustTier = publicTrustBadge(user.trustScore?.tier ?? null);
    const usuallyRespondsWithinMinutes =
      user.trustScore?.medianResponseMinutes != null
        ? Math.round(user.trustScore.medianResponseMinutes)
        : null;

    return {
      id: user.id,
      displayName: user.profile?.displayName ?? 'Member',
      avatarUrl: user.profile?.avatarUrl ?? null,
      memberSince: user.createdAt.getFullYear(),
      identityVerified: user.verifications.some(
        (v) => v.level === 'L3_IDENTITY',
      ),
      successfulTransactions,
      avgRating,
      reviewCount: reviewAgg._count._all,
      trustTier,
      usuallyRespondsWithinMinutes,
      activeListings: listings.map((l) => toPublicListing(l)),
      isFollowing: viewerId ? !!follow : null,
    };
  }

  private assertSubRatings(dto: CreateReviewDto) {
    const fields: (keyof CreateReviewDto)[] = [
      'overall',
      'accuracy',
      'communication',
      'punctuality',
      'transactionExperience',
    ];
    for (const key of fields) {
      const v = dto[key];
      if (typeof v !== 'number' || v < 1 || v > 5 || !Number.isInteger(v)) {
        throw new BadRequestException(`${String(key)} must be an integer 1–5`);
      }
    }
  }

  private async assertBodyClean(body?: string) {
    if (!body?.trim()) return;
    const lower = body.toLowerCase();
    for (const kw of REVIEW_BLOCKLIST) {
      if (lower.includes(kw)) {
        throw new BadRequestException('Review body contains prohibited content');
      }
    }
    if (this.chatScan) {
      const hit = await this.chatScan.scan(body);
      if (hit) {
        throw new BadRequestException('Review body contains prohibited content');
      }
    }
  }

  private toDto(
    r: {
      id: string;
      orderId: string;
      reviewerId: string;
      revieweeId: string;
      overall: number;
      accuracy: number;
      communication: number;
      punctuality: number;
      transactionExperience: number;
      body: string | null;
      photoKeys: string[];
      status: ReviewStatus;
      reply: string | null;
      repliedAt: Date | null;
      publishedAt: Date | null;
      createdAt: Date;
      reviewer?: {
        id: string;
        profile?: { displayName: string; avatarUrl: string | null } | null;
      };
    },
  ): ReviewDto {
    return {
      id: r.id,
      orderId: r.orderId,
      reviewerId: r.reviewerId,
      revieweeId: r.revieweeId,
      overall: r.overall,
      accuracy: r.accuracy,
      communication: r.communication,
      punctuality: r.punctuality,
      transactionExperience: r.transactionExperience,
      body: r.body,
      photoKeys: r.photoKeys,
      status: r.status,
      reply: r.reply,
      repliedAt: r.repliedAt,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      reviewer: r.reviewer
        ? {
            id: r.reviewer.id,
            displayName: r.reviewer.profile?.displayName ?? 'Member',
            avatarUrl: r.reviewer.profile?.avatarUrl ?? null,
          }
        : undefined,
    };
  }
}
