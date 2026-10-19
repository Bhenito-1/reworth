import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingStatus, OrderStatus, Prisma } from '@prisma/client';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { LISTINGS_MOD, REPORTS } from '../admin/admin-roles';
import { PrismaService } from '../prisma/prisma.service';
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
} from '../providers/geocoding.provider';
import { MediaService } from '../media/media.service';
import { FavouritesService } from '../favourites/favourites.service';
import { CommunityVisibilityService } from '../communities/community-visibility.service';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationCategory } from '../notifications/notification-categories';
import { activeSellerWhere } from './public-seller';
import { NotificationsService } from '../notifications/notifications.service';
import { RiskEngineService } from '../risk/risk-engine.service';
import { AnalyticsService } from './analytics.service';
import { ListingAssistService } from './listing-assist.service';
import {
  ACTIVE_ORDER_STATUSES,
  sellerRemovalBlockReason,
} from './listing-removal';
import { ListingStateMachine } from './listing-state.machine';
import { PriceIntelligenceService } from './price-intelligence.service';
import { aggregateBuyerRatings } from '../reviews/buyer-rating';
import { ratingLabelFromTrust, toPublicListing } from './public-listing.mapper';
import { FeatureStoreService } from '../intelligence/feature-store.service';
import { InventoryService } from '../inventory/inventory.service';
import { SellerPayoutService } from '../payouts/seller-payout.service';
import type {
  AttachImagesDto,
  BrowseListingsQueryDto,
  CreateListingDto,
  ReportListingDto,
  UpdateListingDto,
} from './dto/listings.dto';

const PUBLIC_STATUSES: ListingStatus[] = ['LIVE', 'RESERVED'];

const listingInclude = {
  category: true,
  subcategory: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  estateCommunity: true,
  movingSale: true,
  vehicleInspections: {
    where: { status: { in: ['COMPLETED', 'EXPIRED'] as const } },
    orderBy: { completedAt: 'desc' as const },
    take: 1,
  },
  seller: {
    include: {
      profile: true,
      verifications: true,
      trustScore: true,
      proAccount: true,
      _count: {
        select: {
          reviewsReceived: { where: { status: 'PUBLISHED' as const } },
        },
      },
    },
  },
} satisfies Prisma.ListingInclude;

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
    @Inject(forwardRef(() => RiskEngineService))
    private readonly riskEngine: RiskEngineService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
    private readonly assistService: ListingAssistService,
    private readonly priceIntel: PriceIntelligenceService,
    private readonly media: MediaService,
    @Inject(GEOCODING_PROVIDER) private readonly geo: GeocodingProvider,
    private readonly visibility: CommunityVisibilityService,
    private readonly inventory: InventoryService,
    private readonly payouts: SellerPayoutService,
    @Optional()
    @Inject(forwardRef(() => FavouritesService))
    private readonly favourites?: FavouritesService,
    @Optional() private readonly features?: FeatureStoreService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  async listCategories() {
    const cats = await this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      sortOrder: c.sortOrder,
      iconUrl: c.iconUrl,
      children: c.children.map((ch) => ({
        id: ch.id,
        slug: ch.slug,
        name: ch.name,
        sortOrder: ch.sortOrder,
        iconUrl: ch.iconUrl,
      })),
    }));
  }

  async create(sellerId: string, dto: CreateListingDto) {
    let geoLat = dto.geoLat;
    let geoLng = dto.geoLng;
    if (dto.community && (geoLat == null || geoLng == null)) {
      const g = await this.geo.geocodeCommunity(dto.community);
      if (g) {
        geoLat = geoLat ?? g.geoLat;
        geoLng = geoLng ?? g.geoLng;
      }
    }

    const sellingMode = dto.sellingMode ?? 'SELL';
    const categoryId = await this.resolveListingCategory(dto);
    const units =
      sellingMode === 'SELL' || sellingMode === 'GIVE_AWAY'
        ? Math.min(999, Math.max(1, dto.quantity ?? 1))
        : 1;

    const listing = await this.prisma.listing.create({
      data: {
        sellerId,
        title: dto.title ?? '',
        description: dto.description ?? '',
        categoryId,
        subcategoryId: dto.subcategoryId,
        brand: dto.brand?.trim() || null,
        model: dto.model,
        condition: dto.condition ?? 'GOOD',
        ageText: dto.ageText,
        originalPriceKobo: dto.originalPriceKobo,
        priceKobo: sellingMode === 'SELL' ? (dto.priceKobo ?? 0) : 0,
        negotiable: sellingMode === 'SELL' ? (dto.negotiable ?? true) : false,
        sellingMode,
        status: 'DRAFT',
        community: dto.community ?? '',
        communityId: dto.communityId,
        communityOnly: dto.communityOnly ?? false,
        movingSaleId: dto.movingSaleId,
        city: dto.city?.trim() || 'Lagos',
        geoLat,
        geoLng,
        addressPrivate: dto.addressPrivate,
        fulfilmentPickup: dto.fulfilmentPickup ?? false,
        fulfilmentMeet: dto.fulfilmentMeet ?? false,
        fulfilmentDelivery: dto.fulfilmentDelivery ?? true,
        vehicle: dto.vehicle ? (dto.vehicle as Prisma.InputJsonValue) : undefined,
        quantityTotal: units,
        quantityAvailable: units,
        quantityReserved: 0,
        quantitySold: 0,
        ...(sellingMode === 'GIVE_AWAY'
          ? { donateIfUnsoldDays: null }
          : dto.donateIfUnsoldDays !== undefined
            ? { donateIfUnsoldDays: dto.donateIfUnsoldDays }
            : {}),
        ...(await this.luxuryAuthDefaults(categoryId ?? undefined)),
      },
      include: listingInclude,
    });

    this.analytics.log('listing_started', {
      listingId: listing.id,
      sellerId,
    });

    return toPublicListing(listing);
  }

  async listMine(sellerId: string) {
    const rows = await this.prisma.listing.findMany({
      where: {
        sellerId,
        NOT: { riskFlags: { has: 'swap-response' } },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        listingModerations: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
        },
      },
    });
    const accepted = await this.listingsWithAcceptedOrders(rows.map((row) => row.id));
    return {
      items: rows.map((row) => {
        const latest = row.listingModerations[0];
        const note = latest?.rejectionReason?.trim() || null;
        const review = reviewStateFor(row.status, latest?.decision ?? null, note);
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          priceKobo: row.priceKobo,
          updatedAt: row.updatedAt.toISOString(),
          reviewState: review.state,
          reviewLabel: review.label,
          reviewNote: review.note,
          canRemove: row.status === 'LIVE',
          hasAcceptedOrder: accepted.has(row.id),
        };
      }),
    };
  }

  async browse(query: BrowseListingsQueryDto, viewerId?: string | null) {
    const status = (query.status as ListingStatus) || 'LIVE';
    const where: Prisma.ListingWhereInput = {
      status: status === 'LIVE' ? { in: PUBLIC_STATUSES } : status,
      ...activeSellerWhere,
      AND: [this.visibility.visibleListingWhere(viewerId)],
    };
    if (query.community) where.community = query.community;
    if (query.city) where.city = query.city;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.mine === '1' && viewerId) {
      where.sellerId = viewerId;
      where.status = status;
      delete where.seller;
      delete where.AND;
    } else {
      where.quantityAvailable = { gt: 0 };
      where.NOT = { riskFlags: { has: 'swap-response' } };
      if (viewerId) where.sellerId = { not: viewerId };
    }

    const rows = await this.prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: { publishedAt: 'desc' },
      take: Math.min(query.limit ?? 20, 50),
    });

    let filtered = rows;
    if (
      query.radiusKm != null &&
      query.lat != null &&
      query.lng != null
    ) {
      filtered = rows.filter((r) => {
        if (r.geoLat == null || r.geoLng == null) return false;
        const dto = toPublicListing(r, {
          viewerLat: query.lat,
          viewerLng: query.lng,
        });
        return (dto.distanceKm ?? Infinity) <= query.radiusKm!;
      });
    }

    const now = new Date();
    const promoRows = await this.prisma.promotion.findMany({
      where: {
        listingId: { in: filtered.map((r) => r.id) },
        paymentStatus: 'SUCCESS',
        startsAt: { lte: now },
        endsAt: { gt: now },
        kind: { in: ['BOOST', 'FEATURED', 'PROMOTED'] },
      },
    });
    const promoByListing = new Map<
      string,
      { boosted: boolean; featured: boolean; boostedUntil: Date | null; featuredUntil: Date | null; rank: number }
    >();
    for (const p of promoRows) {
      const cur = promoByListing.get(p.listingId) ?? {
        boosted: false,
        featured: false,
        boostedUntil: null,
        featuredUntil: null,
        rank: 0,
      };
      if (p.kind === 'FEATURED' || p.kind === 'PROMOTED') {
        cur.featured = true;
        cur.featuredUntil = p.endsAt;
        cur.rank = Math.max(cur.rank, 2);
      }
      if (p.kind === 'BOOST') {
        cur.boosted = true;
        cur.boostedUntil = p.endsAt;
        cur.rank = Math.max(cur.rank, 1);
      }
      promoByListing.set(p.listingId, cur);
    }

    filtered = [...filtered].sort((a, b) => {
      const ra = promoByListing.get(a.id)?.rank ?? 0;
      const rb = promoByListing.get(b.id)?.rank ?? 0;
      if (rb !== ra) return rb - ra;
      const ta = a.publishedAt?.getTime() ?? 0;
      const tb = b.publishedAt?.getTime() ?? 0;
      return tb - ta;
    });

    return filtered.map((r) => {
      const promo = promoByListing.get(r.id);
      return toPublicListing(r, {
        viewerLat: query.lat,
        viewerLng: query.lng,
        boosted: promo?.boosted,
        featured: promo?.featured,
        boostedUntil: promo?.boostedUntil ?? null,
        featuredUntil: promo?.featuredUntil ?? null,
      });
    });
  }

  private async ownerRejectionReason(
    listingId: string,
    status: string,
  ): Promise<string | null> {
    if (status !== 'REJECTED') return null;
    const latest = await this.prisma.listingModeration.findFirst({
      where: { listingId },
      orderBy: { assessedAt: 'desc' },
    });
    const note = latest?.rejectionReason?.trim() || null;
    if (!note || note === 'Admin approved') return null;
    return note;
  }

  async getById(id: string, viewerId?: string | null) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: listingInclude,
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const isOwner = viewerId && listing.sellerId === viewerId;
    const isPublic = PUBLIC_STATUSES.includes(listing.status);
    const isSold = listing.status === 'SOLD';
    if (!isPublic && !isSold && !isOwner) {
      throw new NotFoundException('Listing not found');
    }
    if (!isOwner && listing.seller.status !== 'ACTIVE') {
      throw new NotFoundException('Listing not found');
    }

    const canView = await this.visibility.canViewListing(listing, viewerId);
    if (!canView) {
      throw new NotFoundException('Listing not found');
    }

    if (isPublic) {
      await this.prisma.listing.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
      await this.prisma.listingEvent.create({
        data: {
          listingId: id,
          type: 'VIEWED',
          actorUserId: viewerId ?? null,
        },
      });
      if (this.features) {
        void this.features
          .recordListingEvent({
            listingId: id,
            city: listing.city,
            kind: 'view',
          })
          .catch(() => undefined);
        if (viewerId) {
          void this.features
            .recordUserEvent({
              userId: viewerId,
              city: listing.city,
              categoryId: listing.categoryId,
              brand: listing.brand,
              community: listing.community,
              priceKobo: listing.priceKobo,
              kind: 'view',
            })
            .catch(() => undefined);
        }
      }
    }

    const now = new Date();
    const activePromos = await this.prisma.promotion.findMany({
      where: {
        listingId: id,
        paymentStatus: 'SUCCESS',
        startsAt: { lte: now },
        endsAt: { gt: now },
        kind: { in: ['BOOST', 'FEATURED'] },
      },
    });
    const boost = activePromos.find((p) => p.kind === 'BOOST');
    const featured = activePromos.find((p) => p.kind === 'FEATURED');

    const dto = toPublicListing(listing, {
      boosted: Boolean(boost),
      featured: Boolean(featured),
      boostedUntil: boost?.endsAt ?? null,
      featuredUntil: featured?.endsAt ?? null,
    });
    const processRating = await this.buyerProcessRating(listing.sellerId);
    if (processRating.count > 0 && processRating.average != null) {
      dto.seller.ratingLabel = ratingLabelFromTrust(
        processRating.average,
        processRating.count,
      );
    }

    return {
      ...dto,
      rejectionReason: isOwner ? await this.ownerRejectionReason(id, listing.status) : null,
    };
  }

  /** Mean of buyer ratings of the purchase process with this seller. */
  private async buyerProcessRating(
    sellerId: string,
  ): Promise<{ average: number | null; count: number }> {
    const rows = await this.prisma.review.findMany({
      where: { revieweeId: sellerId, status: 'PUBLISHED' },
      select: {
        transactionExperience: true,
        reviewerId: true,
        order: { select: { id: true, buyerId: true, checkoutId: true } },
      },
    });
    const buyer = rows.filter((row) => row.reviewerId === row.order.buyerId);
    return aggregateBuyerRatings(
      buyer.map((row) => ({
        buyerId: row.order.buyerId,
        orderId: row.order.id,
        checkoutId: row.order.checkoutId,
        score: row.transactionExperience,
      })),
    );
  }

  async update(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.requireOwner(id, sellerId);
    const nextMode = dto.sellingMode ?? listing.sellingMode;
    const resolvedCategoryId = await this.resolveListingCategory(dto);
    const nextPrice =
      nextMode === 'SELL' ? dto.priceKobo : 0;
    const priceChanged =
      nextPrice !== undefined && nextPrice !== listing.priceKobo;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(resolvedCategoryId !== undefined
          ? { categoryId: resolvedCategoryId }
          : {}),
        ...(dto.subcategoryId !== undefined
          ? { subcategoryId: dto.subcategoryId }
          : {}),
        ...(dto.brand !== undefined
          ? { brand: dto.brand?.trim() || null }
          : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.ageText !== undefined ? { ageText: dto.ageText } : {}),
        ...(dto.originalPriceKobo !== undefined
          ? { originalPriceKobo: dto.originalPriceKobo }
          : {}),
        ...(nextMode === 'SELL'
          ? {
              ...(dto.priceKobo !== undefined
                ? { priceKobo: dto.priceKobo }
                : {}),
              ...(dto.negotiable !== undefined
                ? { negotiable: dto.negotiable }
                : {}),
            }
          : { priceKobo: 0, negotiable: false }),
        ...(dto.sellingMode !== undefined
          ? { sellingMode: dto.sellingMode }
          : {}),
        ...(dto.community !== undefined ? { community: dto.community } : {}),
        ...(dto.communityId !== undefined
          ? { communityId: dto.communityId }
          : {}),
        ...(dto.communityOnly !== undefined
          ? { communityOnly: dto.communityOnly }
          : {}),
        ...(dto.movingSaleId !== undefined
          ? { movingSaleId: dto.movingSaleId }
          : {}),
        ...(dto.city !== undefined
          ? { city: dto.city.trim() || 'Lagos' }
          : {}),
        ...(dto.geoLat !== undefined ? { geoLat: dto.geoLat } : {}),
        ...(dto.geoLng !== undefined ? { geoLng: dto.geoLng } : {}),
        ...(dto.addressPrivate !== undefined
          ? { addressPrivate: dto.addressPrivate }
          : {}),
        ...(dto.fulfilmentPickup !== undefined
          ? { fulfilmentPickup: dto.fulfilmentPickup }
          : {}),
        ...(dto.fulfilmentMeet !== undefined
          ? { fulfilmentMeet: dto.fulfilmentMeet }
          : {}),
        ...(dto.fulfilmentDelivery !== undefined
          ? { fulfilmentDelivery: dto.fulfilmentDelivery }
          : {}),
        ...(dto.vehicle !== undefined
          ? { vehicle: dto.vehicle as Prisma.InputJsonValue }
          : {}),
        ...(dto.authRequired !== undefined
          ? {
              authRequired: dto.authRequired,
              authenticationStatus: dto.authRequired
                ? ('REQUIRED' as const)
                : ('OPTED_OUT' as const),
            }
          : {}),
        ...(nextMode === 'GIVE_AWAY'
          ? { donateIfUnsoldDays: null }
          : dto.donateIfUnsoldDays !== undefined
            ? { donateIfUnsoldDays: dto.donateIfUnsoldDays }
            : {}),
        ...(typeof resolvedCategoryId === 'string'
          ? await this.luxuryAuthDefaults(resolvedCategoryId, dto.authRequired)
          : {}),
      },
      include: listingInclude,
    });

    if (priceChanged) {
      this.analytics.log('price_set', {
        listingId: id,
        priceKobo: dto.priceKobo,
      });
      await this.prisma.listingEvent.create({
        data: {
          listingId: id,
          type: 'PRICE_CHANGED',
          actorUserId: sellerId,
          payload: {
            from: listing.priceKobo,
            to: nextPrice,
          },
        },
      });
    }

    if (listing.aiUsed && dto) {
      const edited = Object.keys(dto);
      if (edited.length) {
        this.analytics.log('assist_edited_fields', {
          listingId: id,
          fields: edited,
        });
      }
    }

    if (
      dto.quantity !== undefined &&
      (nextMode === 'SELL' || nextMode === 'GIVE_AWAY')
    ) {
      await this.inventory.adjustListedQuantity(id, sellerId, dto.quantity);
      const fresh = await this.prisma.listing.findUniqueOrThrow({
        where: { id },
        include: listingInclude,
      });
      return toPublicListing(fresh);
    }

    return toPublicListing(updated);
  }

  /** Every listing this seller has created, including sold and unavailable. */
  async sellerInventory(sellerId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { sellerId },
      orderBy: { updatedAt: 'desc' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });
    return rows.map((row) => {
      const removeBlockedReason = sellerRemovalBlockReason({ status: row.status });
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        sellingMode: row.sellingMode,
        priceKobo: row.priceKobo,
        quantityTotal: row.quantityTotal,
        quantityAvailable: row.quantityAvailable,
        quantityReserved: row.quantityReserved,
        quantitySold: row.quantitySold,
        publishedAt: row.publishedAt,
        updatedAt: row.updatedAt,
        onMarketplace: row.status === 'LIVE' && row.quantityAvailable > 0,
        canRemove: removeBlockedReason == null,
        removeBlockedReason,
        images: row.images.map((img) => ({
          id: img.id,
          variants: (img.variants as Record<string, unknown>) ?? {},
        })),
      };
    });
  }

  async softRemove(id: string, sellerId: string) {
    const listing = await this.requireOwner(id, sellerId);
    if (listing.status === 'DRAFT') {
      await this.prisma.listing.delete({ where: { id } });
      return { id, status: 'DELETED' as const };
    }
    const blocked = sellerRemovalBlockReason({ status: listing.status });
    if (blocked) throw new ConflictException(blocked);
    ListingStateMachine.assertTransition(listing.status, 'REMOVED');
    const sold = listing.quantitySold ?? 0;
    const reserved = listing.quantityReserved ?? 0;
    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        status: 'REMOVED',
        quantityAvailable: 0,
        quantityTotal: sold + reserved,
      },
      include: listingInclude,
    });
    await this.prisma.favourite.deleteMany({ where: { listingId: id } });
    await this.emitStatus(id, sellerId, listing.status, 'REMOVED');
    return toPublicListing(updated);
  }

  async assist(
    id: string,
    sellerId: string,
    body?: { imageKeys?: string[] },
  ) {
    return this.assistService.assist(id, sellerId, body);
  }

  async publish(id: string, sellerId: string) {
    const listing = await this.requireOwner(id, sellerId);
    if (
      listing.sellingMode !== 'GIVE_AWAY' &&
      listing.sellingMode !== 'SWAP'
    ) {
      await this.payouts.requireVerified(sellerId);
    }
    const startedAt = listing.createdAt.getTime();

    // 1. Content + image moderation first
    const mod = await this.moderation.evaluateOnPublish(id);
    if (mod.outcome === 'REJECTED') {
      if (listing.status !== 'REJECTED') {
        ListingStateMachine.assertTransition(listing.status, 'REJECTED');
        await this.emitStatus(id, sellerId, listing.status, 'REJECTED');
      }
      this.analytics.log('published', {
        listingId: id,
        status: 'REJECTED',
        moderationReasons: mod.reasons,
        moderationId: mod.moderationId,
      });
      const rejected = await this.prisma.listing.findUniqueOrThrow({
        where: { id },
        include: listingInclude,
      });
      return {
        ...toPublicListing(rejected),
        moderationReasons: mod.reasons.length
          ? mod.reasons
          : mod.rejectionReason
            ? [mod.rejectionReason]
            : [],
      };
    }

    // 2. Risk engine. A stored seller score at or above 40 keeps later
    // listings in review until an admin approval brings it down.
    const risk = await this.riskEngine.evaluateOnPublish(id, sellerId);
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { riskScore: true },
    });
    const reviewScore = Math.max(risk.score, seller?.riskScore ?? 0);
    const riskFlags = listing.riskFlags.includes('swap-response')
      ? Array.from(new Set([...risk.flags, 'swap-response']))
      : risk.flags;

    // 3. Canonical ListingModeration snapshot (content + risk)
    const finalized = await this.moderation.finalizeWithRisk({
      listingId: id,
      content: mod,
      riskScore: reviewScore,
      riskLevel: risk.level,
      riskFlags,
      riskForceReview: risk.forceUnderReview,
    });

    const forceReview =
      risk.forceUnderReview || finalized.outcome === 'UNDER_REVIEW';
    const target: ListingStatus = forceReview ? 'UNDER_REVIEW' : 'LIVE';

    if (listing.status !== target) {
      ListingStateMachine.assertTransition(listing.status, target);
    }

    const expiryDays = Number(
      this.config.get<string>('LISTING_EXPIRY_DAYS') ?? '60',
    );
    const publishedAt = new Date();
    const expiresAt =
      target === 'LIVE'
        ? new Date(publishedAt.getTime() + expiryDays * 24 * 60 * 60 * 1000)
        : null;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        status: target,
        publishedAt: target === 'LIVE' ? publishedAt : listing.publishedAt,
        expiresAt: target === 'LIVE' ? expiresAt : listing.expiresAt,
        riskFlags,
      },
      include: listingInclude,
    });

    await this.emitStatus(id, sellerId, listing.status, target);

    if (target === 'UNDER_REVIEW') {
      await this.notifications.notify({
        userId: sellerId,
        category: NotificationCategory.VERIFICATION_UPDATE,
        title: 'Listing submitted for review',
        body: `"${updated.title}" is being checked. You can follow it under Your listings.`,
        deepLink: '/selling',
      });
      await this.alerts?.notify({
        roles: LISTINGS_MOD,
        kind: 'LISTING_REVIEW',
        title: 'Listing needs review',
        body: `"${updated.title}" is waiting for a photo and details check.`,
        href: '/listings',
        entityType: 'Listing',
        entityId: id,
      });
    }

    if (target === 'LIVE' && this.favourites) {
      await this.favourites.onListingLive(updated).catch(() => undefined);
    }

    this.analytics.log('published', {
      listingId: id,
      status: target,
      riskFlags: risk.flags,
      riskLevel: risk.level,
      moderationOutcome: finalized.outcome,
      moderationId: finalized.moderationId,
      imageScore: finalized.imageScore,
      riskScore: reviewScore,
    });
    this.analytics.log('publish_duration_ms', {
      listingId: id,
      ms: Date.now() - startedAt,
    });

    return toPublicListing(updated);
  }

  async createAppeal(id: string, sellerId: string, reason: string) {
    return this.moderation.createAppeal(id, sellerId, reason);
  }

  async attachImages(id: string, sellerId: string, dto: AttachImagesDto) {
    await this.requireOwner(id, sellerId);
    this.analytics.log('photos_taken', {
      listingId: id,
      count: dto.images.length,
    });
    const images = await this.media.attachKeys(
      sellerId,
      id,
      dto.images.map((i) => ({ key: i.key, sortOrder: i.sortOrder })),
    );
    const listing = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      include: listingInclude,
    });
    return { images, listing: toPublicListing(listing) };
  }

  async priceIntelligence(id: string) {
    return this.priceIntel.getForListing(id);
  }

  async report(id: string, reporterId: string, dto: ReportListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    const report = await this.prisma.report.create({
      data: {
        listingId: id,
        reportedUserId:
          listing.sellerId === reporterId ? undefined : listing.sellerId,
        reporterId,
        reason: dto.reason,
        detail: dto.detail,
        status: 'OPEN',
      },
    });
    await this.alerts?.notify({
      roles: REPORTS,
      kind: 'REPORT',
      title: 'Listing reported',
      body: `"${listing.title}" was reported: ${dto.reason}`,
      href: '/reports',
      entityType: 'Report',
      entityId: report.id,
    });
    return report;
  }

  /**
   * categoryId wins. A typed category name is matched to a real category.
   * An empty name clears it. An unknown name leaves the stored category alone.
   */
  private async resolveListingCategory(dto: {
    categoryId?: string;
    categoryName?: string | null;
  }): Promise<string | null | undefined> {
    if (dto.categoryId !== undefined) return dto.categoryId;
    if (dto.categoryName === undefined) return undefined;
    const name = dto.categoryName?.trim() ?? '';
    if (!name) return null;
    return (await this.resolveCategoryId(name)) ?? undefined;
  }

  private async resolveCategoryId(name: string): Promise<string | null> {
    const cats = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true },
    });
    const norm = (value: string) =>
      value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const query = norm(name);
    if (!query) return null;
    const aliases: Record<string, string> = {
      home: 'home-furniture',
      furniture: 'home-furniture',
      'home living': 'home-furniture',
      'home and living': 'home-furniture',
      kids: 'children-baby',
      kid: 'children-baby',
      baby: 'children-baby',
      children: 'children-baby',
      'children and baby': 'children-baby',
      phones: 'phones-tablets',
      phone: 'phones-tablets',
      sports: 'sports-fitness',
      sport: 'sports-fitness',
      fitness: 'sports-fitness',
      car: 'vehicles',
      cars: 'vehicles',
      vehicle: 'vehicles',
      appliance: 'home-appliances',
      appliances: 'home-appliances',
      computer: 'computers',
      computers: 'computers',
      laptop: 'computers',
      clothes: 'fashion',
      clothing: 'fashion',
      book: 'books',
      books: 'books',
      other: 'other',
      others: 'other',
      misc: 'other',
    };
    const alias = aliases[query];
    if (alias) {
      const hit = cats.find((c) => c.slug === alias);
      if (hit) return hit.id;
    }
    const exact = cats.find(
      (c) => norm(c.name) === query || c.slug.replace(/-/g, ' ') === query,
    );
    if (exact) return exact.id;
    const partial = cats
      .map((c) => ({ c, n: norm(c.name) }))
      .filter((row) => row.n.includes(query) || query.includes(row.n))
      .sort((a, b) => a.n.length - b.n.length)[0];
    return partial?.c.id ?? null;
  }

  private async requireOwner(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Not the listing owner');
    }
    return listing;
  }

  /** Luxury category defaults authRequired=true / REQUIRED unless seller opted out. */
  private async luxuryAuthDefaults(
    categoryId?: string | null,
    authRequiredOverride?: boolean,
  ): Promise<{
    authRequired?: boolean;
    authenticationStatus?: 'REQUIRED' | 'OPTED_OUT' | 'NOT_REQUIRED';
  }> {
    if (!categoryId) return {};
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { slug: true },
    });
    if (!category || category.slug !== 'luxury') {
      if (authRequiredOverride === undefined) return {};
      return {
        authRequired: authRequiredOverride,
        authenticationStatus: authRequiredOverride ? 'REQUIRED' : 'OPTED_OUT',
      };
    }
    if (authRequiredOverride === false) {
      return { authRequired: false, authenticationStatus: 'OPTED_OUT' };
    }
    return { authRequired: true, authenticationStatus: 'REQUIRED' };
  }

  /** Listings that already have a seller-accepted order still in progress. */
  private async listingsWithAcceptedOrders(ids: string[]) {
    const matched = new Set<string>();
    if (ids.length === 0) return matched;
    const wanted = new Set(ids);
    const orders = await this.prisma.order.findMany({
      where: {
        confirmationStatus: 'CONFIRMED',
        status: { in: [...ACTIVE_ORDER_STATUSES] as OrderStatus[] },
        OR: [
          { listingId: { in: ids } },
          { swapListingAId: { in: ids } },
          { swapListingBId: { in: ids } },
        ],
      },
      select: {
        listingId: true,
        swapListingAId: true,
        swapListingBId: true,
      },
    });
    for (const order of orders) {
      for (const id of [order.listingId, order.swapListingAId, order.swapListingBId]) {
        if (id && wanted.has(id)) matched.add(id);
      }
    }
    return matched;
  }

  private async emitStatus(
    listingId: string,
    actorUserId: string | null,
    from: ListingStatus,
    to: ListingStatus,
  ) {
    await this.prisma.listingEvent.create({
      data: {
        listingId,
        type: 'STATUS_CHANGED',
        actorUserId,
        payload: { from, to },
      },
    });
  }
}

function reviewStateFor(
  status: string,
  decision: string | null,
  note: string | null,
): { state: string; label: string; note: string | null } {
  if (status === 'UNDER_REVIEW') {
    return {
      state: 'waiting',
      label: 'Waiting for review',
      note: 'We are checking the photos and item details.',
    };
  }
  if (status === 'REJECTED') {
    return {
      state: 'rejected',
      label: 'Rejected',
      note: note && note !== 'Admin approved' ? note : 'This listing was rejected.',
    };
  }
  if (status === 'LIVE' || status === 'RESERVED' || status === 'SOLD') {
    const custom =
      decision === 'PASS' && note && note !== 'Admin approved' ? note : null;
    return {
      state: 'approved',
      label: status === 'LIVE' ? 'Live' : status === 'SOLD' ? 'Sold' : 'Reserved',
      note:
        custom ??
        (status === 'SOLD'
          ? 'Every unit sold. Open it to see the product and buyer ratings.'
          : null),
    };
  }
  if (status === 'EXPIRED') {
    return {
      state: 'closed',
      label: 'Closed',
      note: 'The listing period ended before it sold out, so it left the marketplace.',
    };
  }
  if (status === 'REMOVED') {
    return {
      state: 'removed',
      label: 'Removed',
      note:
        note && note !== 'Admin approved'
          ? note
          : 'Remaining units are off the marketplace. Accepted orders still have to be fulfilled.',
    };
  }
  if (status === 'DRAFT') {
    return { state: 'draft', label: 'Draft', note: null };
  }
  return { state: 'closed', label: 'Closed', note };
}
