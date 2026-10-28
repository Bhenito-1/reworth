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
import { aggregateBuyerRatings } from './buyer-rating';
import { publicTrustBadge } from './trust-score.compute';
import { TrustScoreService } from './trust-score.service';

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

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
  /** Item the buyer rated, when this review is shown on another listing. */
  listingTitle?: string | null;
  /** Buyer bought a different item in the same category. */
  similar?: boolean;
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
    if (reviewerId !== order.buyerId) {
      throw new ForbiddenException('Only the buyer can rate the seller');
    }

    const revieweeId = order.sellerId;

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
        status: ReviewStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.notifications.notify({
      userId: revieweeId,
      category: NotificationCategory.REVIEW_RECEIVED,
      title: 'New rating',
      body: 'A buyer rated this order. It is now on the listing.',
      deepLink: `reworth://listings/${order.listingId}`,
      meta: { orderId, reviewId: created.id, listingId: order.listingId },
    });

    await this.trust.recompute(order.sellerId, 'review_published');
    return this.toDto(created);
  }

  /**
   * Buyer ratings of this seller's purchase process.
   * Includes this item and the seller's other or same-category items.
   * Seller-written reviews are excluded.
   */
  async listForListing(listingId: string): Promise<{
    soldUnits: number;
    average: number | null;
    count: number;
    items: ReviewDto[];
    seller: {
      average: number | null;
      count: number;
      items: ReviewDto[];
    };
  }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        sellerId: true,
        categoryId: true,
        quantitySold: true,
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const soldUnits = listing.quantitySold ?? 0;

    const rows = await this.prisma.review.findMany({
      where: {
        status: ReviewStatus.PUBLISHED,
        revieweeId: listing.sellerId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            buyerId: true,
            checkoutId: true,
            listing: { select: { id: true, title: true, categoryId: true } },
          },
        },
        reviewer: { include: { profile: true } },
      },
    });
    const buyerReviews = rows.filter(
      (row) => row.reviewerId === row.order.buyerId,
    );
    const sellerItems = buyerReviews.map((row) => {
      const bought = row.order.listing;
      return {
        ...this.toDto(row),
        listingTitle: bought?.title ?? null,
        similar: Boolean(
          bought &&
            bought.id !== listing.id &&
            listing.categoryId &&
            bought.categoryId === listing.categoryId,
        ),
      };
    });
    const sellerRating = aggregateBuyerRatings(
      buyerReviews.map((row) => ({
        buyerId: row.order.buyerId,
        orderId: row.order.id,
        checkoutId: row.order.checkoutId,
        score: row.transactionExperience,
      })),
    );
    const onThisListing = sellerItems.filter((item) => {
      const row = buyerReviews.find((r) => r.id === item.id);
      return row?.order.listing?.id === listing.id;
    });

    return {
      soldUnits,
      average: mean(onThisListing.map((item) => item.transactionExperience)),
      count: onThisListing.length,
      items: onThisListing,
      seller: {
        average: sellerRating.average,
        count: sellerRating.count,
        items: sellerItems,
      },
    };
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
        order: { select: { buyerId: true } },
      },
    });
    return rows
      .filter((row) => row.reviewerId === row.order.buyerId)
      .map((row) => this.toDto(row));
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

    const [successfulTransactions, reviewRows, listings, follow] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            status: 'COMPLETED',
            OR: [{ buyerId: userId }, { sellerId: userId }],
          },
        }),
        this.prisma.review.findMany({
          where: { revieweeId: userId, status: ReviewStatus.PUBLISHED },
          select: {
            transactionExperience: true,
            reviewerId: true,
            order: { select: { id: true, buyerId: true, checkoutId: true } },
          },
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

    const buyerRatings = reviewRows.filter(
      (row) => row.reviewerId === row.order.buyerId,
    );
    const sellerRating = aggregateBuyerRatings(
      buyerRatings.map((row) => ({
        buyerId: row.order.buyerId,
        orderId: row.order.id,
        checkoutId: row.order.checkoutId,
        score: row.transactionExperience,
      })),
    );
    const avgRating = sellerRating.average;

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
      reviewCount: sellerRating.count,
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
