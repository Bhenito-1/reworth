import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AppealStatus,
  ModerationOutcome,
  Prisma,
  RiskLevel,
} from '@prisma/client';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { LISTINGS_MOD, REPORTS } from '../admin/admin-roles';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  IMAGE_MODERATION_PROVIDER,
  type ImageModerationProvider,
} from './image-moderation.provider';
import { VisionService, visionFailureResult } from '../vision/vision.service';
import type { VisionAnalysisResult } from '../vision/vision.types';
import { decideFromScores, scoreImageListingFit } from './image-fit';

export type ModerationEvalResult = {
  outcome: ModerationOutcome;
  reasons: string[];
  detail: Record<string, unknown>;
  imageScore: number;
  imageFitScore: number;
  policyViolations: string[];
  signals: string[];
  rejectionReason?: string;
  moderationId?: string;
  /** Roboflow evidence asked for admin review. Not itself a reject. */
  visionNeedsReview: boolean;
};

export type FinalizeModerationInput = {
  listingId: string;
  content: ModerationEvalResult;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFlags: string[];
  riskForceReview: boolean;
};

/** Category slugs/names treated as prohibited for marketplace sell. */
const PROHIBITED_CATEGORY_PATTERNS = [
  /weapon/i,
  /firearm/i,
  /drug/i,
  /narcotic/i,
  /adult\s*content/i,
  /xxx/i,
  /wildlife.?trade/i,
  /counterfeit/i,
];

const HARD_REJECT_CATEGORIES = new Set([
  'weapons',
  'drugs',
  'stolen',
  'wildlife',
  'body_parts',
  'financial_instruments',
  'adult',
]);

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(IMAGE_MODERATION_PROVIDER)
    private readonly images: ImageModerationProvider,
    private readonly vision: VisionService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  /**
   * Content + image checks at publish time (before / alongside risk).
   * Writes ModerationDecision; ListingModeration is finalized after risk.
   */
  async evaluateOnPublish(listingId: string): Promise<ModerationEvalResult> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        images: true,
        category: true,
        subcategory: true,
      },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const reasons: string[] = [];
    const detail: Record<string, unknown> = {};
    const signals: string[] = [];
    const policyViolations: string[] = [];

    const keywords = await this.prisma.moderationKeyword.findMany({
      where: { enabled: true },
    });
    const blob = `${listing.title}\n${listing.description}`.toLowerCase();
    const keywordHits: Array<{ pattern: string; category: string }> = [];
    for (const kw of keywords) {
      if (blob.includes(kw.pattern.toLowerCase())) {
        keywordHits.push({ pattern: kw.pattern, category: kw.category });
        reasons.push(`KEYWORD:${kw.category}:${kw.pattern}`);
        signals.push(`KEYWORD:${kw.category}`);
        policyViolations.push(`KEYWORD:${kw.category}:${kw.pattern}`);
      }
    }
    detail.keywordHits = keywordHits;

    const metaFlags: string[] = [];
    for (const img of listing.images) {
      if (img.variants && typeof img.variants === 'object') {
        const v = img.variants as Record<string, unknown>;
        if (typeof v.moderationFlag === 'string') {
          metaFlags.push(v.moderationFlag);
        }
        if (Array.isArray(v.flags)) {
          metaFlags.push(
            ...v.flags.filter((f): f is string => typeof f === 'string'),
          );
        }
      }
    }

    const readyImages = listing.images.filter((i) => i.status === 'READY');
    const failedImages = listing.images.filter((i) => i.status === 'FAILED');

    const imageResult = await this.images.scan({
      listingId,
      imageKeys: listing.images.map((i) => i.originalKey),
      metaFlags,
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      categoryName: listing.category?.name,
    });
    detail.image = imageResult;
    if (imageResult.nsfw) {
      reasons.push(...imageResult.reasons);
    }

    const visionResult = await this.analyzeImages(listingId, listing);
    detail.vision = visionResult;
    signals.push(...visionResult.signals);

    const fit = scoreImageListingFit({
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      categoryName: listing.category?.name,
      categorySlug: listing.category?.slug,
      imageKeys: listing.images.map((i) => i.originalKey),
      readyCount: readyImages.length,
      failedCount: failedImages.length,
      nsfw: imageResult.nsfw,
      nsfwReasons: imageResult.reasons,
    });
    signals.push(...fit.signals);
    policyViolations.push(...fit.policyViolations);
    detail.imageFit = fit;

    const categoryBlob = [
      listing.category?.slug,
      listing.category?.name,
      listing.subcategory?.slug,
      listing.subcategory?.name,
    ]
      .filter(Boolean)
      .join(' ');
    if (
      categoryBlob &&
      PROHIBITED_CATEGORY_PATTERNS.some((re) => re.test(categoryBlob))
    ) {
      reasons.push('PROHIBITED_CATEGORY');
      signals.push('PROHIBITED_CATEGORY');
      policyViolations.push('PROHIBITED_CATEGORY');
      detail.category = categoryBlob;
    }

    const keywordHardReject =
      keywordHits.some((h) => HARD_REJECT_CATEGORIES.has(h.category)) ||
      reasons.includes('PROHIBITED_CATEGORY') ||
      imageResult.nsfw;
    const visionNeedsReview = visionResult.needsReview;
    const keywordSoftReview =
      !keywordHardReject &&
      (keywordHits.length > 0 ||
        fit.policyViolations.includes('MIN_PHOTOS_NOT_MET') ||
        visionNeedsReview);

    const provisional = decideFromScores({
      imageScore: fit.imageScore,
      imageFitScore: fit.imageFitScore,
      riskScore: 0,
      riskForceReview: false,
      policyViolations: [...new Set(policyViolations)],
      keywordHardReject,
      keywordSoftReview,
      visionNeedsReview,
    });

    let outcome: ModerationOutcome = provisional.decision;
    // Content-only pass may still become UNDER_REVIEW after risk — keep PASS here.
    if (outcome === 'PASS' && keywordSoftReview) {
      outcome = 'UNDER_REVIEW';
    }

    await this.prisma.moderationDecision.create({
      data: {
        listingId,
        outcome,
        reasons,
        detail: detail as Prisma.InputJsonValue,
      },
    });

    if (outcome === 'REJECTED') {
      await this.prisma.listing.update({
        where: { id: listingId },
        data: { status: 'REJECTED' },
      });
      const rejectionReason =
        provisional.rejectionReason ??
        (reasons.join('; ') ||
          'Your listing was rejected by content moderation.');
      await this.recordListingModeration({
        listingId,
        imageScore: fit.imageScore,
        imageFitScore: fit.imageFitScore,
        riskScore: 0,
        riskLevel: 'LOW',
        signals: [...new Set(signals)],
        decision: 'REJECTED',
        policyViolations: [...new Set(policyViolations)],
        rejectionReason,
        readyImageCount: readyImages.length,
        detail: {
          ...detail,
          riskFlags: [],
          stage: 'content',
        },
      });
      await this.notifySeller(
        listing.sellerId,
        listingId,
        'Listing rejected',
        rejectionReason,
      );
      this.logger.log({
        listingId,
        outcome,
        reasons,
        visionDecision: visionResult.decision,
        visionNeedsReview,
      });
      return {
        outcome,
        reasons,
        detail,
        imageScore: fit.imageScore,
        imageFitScore: fit.imageFitScore,
        policyViolations: [...new Set(policyViolations)],
        signals: [...new Set(signals)],
        rejectionReason,
        visionNeedsReview,
      };
    }

    this.logger.log({
      listingId,
      outcome,
      reasons,
      visionDecision: visionResult.decision,
      visionNeedsReview,
    });
    return {
      outcome,
      reasons,
      detail,
      imageScore: fit.imageScore,
      imageFitScore: fit.imageFitScore,
      policyViolations: [...new Set(policyViolations)],
      signals: [...new Set(signals)],
      rejectionReason: provisional.rejectionReason,
      visionNeedsReview,
    };
  }

  /**
   * After risk engine runs, write the canonical ListingModeration row and
   * return the final publish decision (PASS → LIVE, else UNDER_REVIEW).
   */
  async finalizeWithRisk(
    input: FinalizeModerationInput,
  ): Promise<ModerationEvalResult> {
    const { content } = input;
    const signals = [
      ...content.signals,
      ...input.riskFlags.map((f) => `RISK:${f}`),
    ];
    const final = decideFromScores({
      imageScore: content.imageScore,
      imageFitScore: content.imageFitScore,
      riskScore: input.riskScore,
      riskForceReview: input.riskForceReview,
      policyViolations: content.policyViolations,
      keywordHardReject: content.outcome === 'REJECTED',
      keywordSoftReview: content.outcome === 'UNDER_REVIEW',
      visionNeedsReview: content.visionNeedsReview,
    });

    const decision = final.decision === 'PASS' ? 'PASS' : final.decision;
    // Rejected already handled in evaluateOnPublish
    const outcome: ModerationOutcome =
      decision === 'PASS' ? 'PASS' : 'UNDER_REVIEW';

    const listing = await this.prisma.listing.findUnique({
      where: { id: input.listingId },
      select: {
        images: { select: { status: true } },
      },
    });
    const readyImageCount =
      listing?.images.filter((i) => i.status === 'READY').length ?? 0;

    const record = await this.recordListingModeration({
      listingId: input.listingId,
      imageScore: content.imageScore,
      imageFitScore: content.imageFitScore,
      riskScore: input.riskScore,
      riskLevel: input.riskLevel,
      signals: [...new Set(signals)],
      decision: outcome,
      policyViolations: content.policyViolations,
      rejectionReason: undefined,
      readyImageCount,
      detail: {
        ...content.detail,
        riskFlags: input.riskFlags,
        riskForceReview: input.riskForceReview,
        stage: 'publish',
      },
    });

    return {
      ...content,
      outcome,
      signals: [...new Set(signals)],
      moderationId: record.id,
      detail: {
        ...content.detail,
        riskFlags: input.riskFlags,
        listingModerationId: record.id,
      },
    };
  }

  async recordAdminDecision(opts: {
    listingId: string;
    decision: ModerationOutcome;
    actorUserId: string;
    reason?: string;
  }) {
    const latest = await this.prisma.listingModeration.findFirst({
      where: { listingId: opts.listingId },
      orderBy: { assessedAt: 'desc' },
    });
    const priorSignals = Array.isArray(latest?.signals)
      ? (latest!.signals as unknown[]).filter(
          (s): s is string => typeof s === 'string',
        )
      : [];
    await this.recordListingModeration({
      listingId: opts.listingId,
      imageScore: latest?.imageScore ?? 0,
      imageFitScore: latest?.imageFitScore ?? 0,
      riskScore: latest?.riskScore ?? 0,
      riskLevel: latest?.riskLevel ?? 'LOW',
      signals: [...priorSignals, `ADMIN:${opts.decision}`],
      decision: opts.decision,
      policyViolations: latest?.policyViolations ?? [],
      rejectionReason: opts.reason,
      readyImageCount: latest?.readyImageCount ?? 0,
      detail: {
        priorModerationId: latest?.id,
        actorUserId: opts.actorUserId,
        stage: 'admin',
      },
    });
    await this.prisma.moderationDecision.create({
      data: {
        listingId: opts.listingId,
        outcome: opts.decision,
        reasons: opts.reason
          ? [`ADMIN_${opts.decision}`, opts.reason]
          : [`ADMIN_${opts.decision}`],
        detail: { actorUserId: opts.actorUserId } as Prisma.InputJsonValue,
      },
    });
  }

  private async recordListingModeration(data: {
    listingId: string;
    imageScore: number;
    imageFitScore: number;
    riskScore: number;
    riskLevel: RiskLevel;
    signals: string[];
    decision: ModerationOutcome;
    policyViolations: string[];
    rejectionReason?: string;
    readyImageCount: number;
    detail: Record<string, unknown>;
  }) {
    return this.prisma.listingModeration.create({
      data: {
        listingId: data.listingId,
        imageScore: data.imageScore,
        imageFitScore: data.imageFitScore,
        riskScore: data.riskScore,
        riskLevel: data.riskLevel,
        signals: data.signals as Prisma.InputJsonValue,
        decision: data.decision,
        policyViolations: data.policyViolations,
        rejectionReason: data.rejectionReason,
        readyImageCount: data.readyImageCount,
        detail: data.detail as Prisma.InputJsonValue,
      },
    });
  }

  async createAppeal(
    listingId: string,
    userId: string,
    reason: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can appeal');
    }
    if (listing.status !== 'REJECTED') {
      throw new BadRequestException('Only REJECTED listings can be appealed');
    }

    const open = await this.prisma.moderationAppeal.findFirst({
      where: { listingId, userId, status: 'OPEN' },
    });
    if (open) {
      throw new BadRequestException('An open appeal already exists');
    }

    const appeal = await this.prisma.moderationAppeal.create({
      data: {
        listingId,
        userId,
        reason: reason.trim(),
        status: 'OPEN',
      },
    });
    await this.alerts?.notify({
      roles: REPORTS,
      kind: 'APPEAL',
      title: 'Listing appeal opened',
      body: `"${listing.title}" — ${reason.trim().slice(0, 160)}`,
      href: '/appeals',
      entityType: 'ModerationAppeal',
      entityId: appeal.id,
    });
    return appeal;
  }

  async listOpenAppeals() {
    const items = await this.prisma.moderationAppeal.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            sellerId: true,
          },
        },
        user: {
          select: {
            id: true,
            phone: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    return { items };
  }

  async resolveAppeal(
    appealId: string,
    reviewerId: string,
    status: AppealStatus,
    note?: string,
  ) {
    if (status !== 'APPROVED' && status !== 'DENIED') {
      throw new BadRequestException('status must be APPROVED or DENIED');
    }
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    if (appeal.status !== 'OPEN') {
      throw new BadRequestException('Appeal already resolved');
    }

    const updated = await this.prisma.moderationAppeal.update({
      where: { id: appealId },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });

    if (status === 'APPROVED') {
      await this.prisma.listing.update({
        where: { id: appeal.listingId },
        data: { status: 'UNDER_REVIEW' },
      });
      const appealed = await this.prisma.listing.findUnique({
        where: { id: appeal.listingId },
        select: { title: true },
      });
      await this.alerts?.notify({
        roles: LISTINGS_MOD,
        kind: 'LISTING_REVIEW',
        title: 'Listing needs review',
        body: `"${appealed?.title ?? 'Listing'}" is back in review after an appeal.`,
        href: '/listings',
        entityType: 'Listing',
        entityId: appeal.listingId,
      });
    }

    if (note) {
      await this.prisma.moderationDecision.create({
        data: {
          listingId: appeal.listingId,
          outcome: status === 'APPROVED' ? 'UNDER_REVIEW' : 'REJECTED',
          reasons: [`APPEAL_${status}`, note],
          detail: { appealId, reviewerId } as Prisma.InputJsonValue,
        },
      });
    }

    await this.recordAdminDecision({
      listingId: appeal.listingId,
      decision: status === 'APPROVED' ? 'UNDER_REVIEW' : 'REJECTED',
      actorUserId: reviewerId,
      reason: note,
    });

    await this.notifySeller(
      appeal.userId,
      appeal.listingId,
      status === 'APPROVED' ? 'Appeal approved' : 'Appeal denied',
      note ??
        (status === 'APPROVED'
          ? 'Your listing appeal was approved and is under review.'
          : 'Your listing appeal was denied.'),
    );

    return updated;
  }

  /**
   * Image-title evidence for the risk/moderation decision.
   * Failures become a review signal and do not approve the listing.
   */
  private async analyzeImages(
    listingId: string,
    listing: {
      title: string;
      description: string;
      images: Array<{
        originalKey: string;
        status: string;
        variants: unknown;
        sortOrder: number;
      }>;
    },
  ): Promise<VisionAnalysisResult> {
    try {
      const images = listing.images
        .filter((image) => image.status === 'READY')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((image) => ({
          key: image.originalKey,
          url: variantUrl(image.variants),
        }));
      return await this.vision.analyzeListing({
        listingId,
        title: listing.title,
        description: listing.description,
        images,
      });
    } catch (err) {
      this.logger.error({ err, listingId }, 'Vision analysis failed');
      return visionFailureResult({
        code: 'UNAVAILABLE',
        message: 'Roboflow image-title check is unavailable',
      });
    }
  }

  /** Test helper: scan text against keyword list without DB writes. */
  matchKeywords(
    text: string,
    keywords: Array<{ pattern: string; category: string }>,
  ): Array<{ pattern: string; category: string }> {
    const blob = text.toLowerCase();
    return keywords.filter((kw) => blob.includes(kw.pattern.toLowerCase()));
  }

  private async notifySeller(
    userId: string,
    listingId: string,
    title: string,
    body: string,
  ) {
    try {
      await this.notifications.notify({
        userId,
        category: 'VERIFICATION_UPDATE',
        title,
        body,
        deepLink: `/listings/${listingId}`,
        channels: ['IN_APP'],
      });
    } catch (err) {
      this.logger.warn({ err, userId }, 'Failed to notify seller about moderation');
    }
  }
}

function variantUrl(variants: unknown): string | undefined {
  if (!variants || typeof variants !== 'object') return undefined;
  const record = variants as Record<string, unknown>;
  if (typeof record.original === 'string' && record.original) return record.original;
  for (const size of ['w1600', 'w1080', 'w640']) {
    const sized = record[size];
    if (!sized || typeof sized !== 'object') continue;
    const urls = sized as Record<string, unknown>;
    if (typeof urls.webp === 'string' && urls.webp) return urls.webp;
    if (typeof urls.avif === 'string' && urls.avif) return urls.avif;
  }
  return undefined;
}
