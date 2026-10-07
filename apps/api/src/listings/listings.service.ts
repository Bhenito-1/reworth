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
import { toPublicListing } from './public-listing.mapper';
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

const EMPTY_REMOVAL_ACTIVITY = {
  activeOrders: 0,
  openDisputes: 0,
  openSwaps: 0,
  openGiveaways: 0,
  pendingIntents: 0,
  openOffers: 0,
};

type RemovalActivity = typeof EMPTY_REMOVAL_ACTIVITY;

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
    const units =
      sellingMode === 'SELL' ? Math.min(999, Math.max(1, dto.quantity ?? 1)) : 1;

    const listing = await this.prisma.listing.create({
      data: {
        sellerId,
        title: dto.title ?? '',
        description: dto.description ?? '',
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId,
        brand: dto.brand,
        model: dto.model,
        condition: dto.condition ?? 'GOOD',
        ageText: dto.ageText,
        originalPriceKobo: dto.originalPriceKobo,
        priceKobo: dto.priceKobo ?? 0,
        negotiable: dto.negotiable ?? true,
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
        fulfilmentPickup: dto.fulfilmentPickup ?? true,
        fulfilmentMeet: dto.fulfilmentMeet ?? true,
        fulfilmentDelivery: dto.fulfilmentDelivery ?? false,
        vehicle: dto.vehicle ? (dto.vehicle as Prisma.InputJsonValue) : undefined,
        instantBuyEligible: dto.instantBuyEligible ?? false,
        quantityTotal: units,
        quantityAvailable: units,
        quantityReserved: 0,
        quantitySold: 0,
        ...(dto.donateIfUnsoldDays !== undefined
          ? { donateIfUnsoldDays: dto.donateIfUnsoldDays }
          : {}),
        ...(await this.luxuryAuthDefaults(dto.categoryId)),
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
      where: { sellerId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        listingModerations: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
        },
      },
    });
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
    if (!isPublic && !isOwner) {
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

    return {
      ...toPublicListing(listing, {
        boosted: Boolean(boost),
        featured: Boolean(featured),
        boostedUntil: boost?.endsAt ?? null,
        featuredUntil: featured?.endsAt ?? null,
      }),
      rejectionReason: isOwner ? await this.ownerRejectionReason(id, listing.status) : null,
    };
  }

  async update(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.requireOwner(id, sellerId);
    const priceChanged =
      dto.priceKobo !== undefined && dto.priceKobo !== listing.priceKobo;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.subcategoryId !== undefined
          ? { subcategoryId: dto.subcategoryId }
          : {}),
        ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.ageText !== undefined ? { ageText: dto.ageText } : {}),
        ...(dto.originalPriceKobo !== undefined
          ? { originalPriceKobo: dto.originalPriceKobo }
          : {}),
        ...(dto.priceKobo !== undefined ? { priceKobo: dto.priceKobo } : {}),
        ...(dto.negotiable !== undefined ? { negotiable: dto.negotiable } : {}),
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
        ...(dto.instantBuyEligible !== undefined
          ? { instantBuyEligible: dto.instantBuyEligible }
          : {}),
        ...(dto.donateIfUnsoldDays !== undefined
          ? { donateIfUnsoldDays: dto.donateIfUnsoldDays }
          : {}),
        ...(dto.categoryId !== undefined
          ? await this.luxuryAuthDefaults(dto.categoryId, dto.authRequired)
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
            to: dto.priceKobo,
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

    if (dto.quantity !== undefined) {
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
    const blocks = await this.removalActivity(rows.map((row) => row.id));
    return rows.map((row) => {
      const activity = blocks.get(row.id) ?? EMPTY_REMOVAL_ACTIVITY;
      const removeBlockedReason = sellerRemovalBlockReason({
        status: row.status,
        quantityAvailable: row.quantityAvailable,
        quantityReserved: row.quantityReserved,
        quantitySold: row.quantitySold,
        ...activity,
      });
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
    const activity = (await this.removalActivity([id])).get(id) ?? EMPTY_REMOVAL_ACTIVITY;
    const blocked = sellerRemovalBlockReason({
      status: listing.status,
      quantityAvailable: listing.quantityAvailable,
      quantityReserved: listing.quantityReserved,
      quantitySold: listing.quantitySold,
      ...activity,
    });
    if (blocked) throw new ConflictException(blocked);
    ListingStateMachine.assertTransition(listing.status, 'REMOVED');
    const updated = await this.prisma.listing.update({
      where: { id },
      data: { status: 'REMOVED' },
      include: listingInclude,
    });
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
    await this.payouts.requireVerified(sellerId);
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

    // 2. Risk engine
    const risk = await this.riskEngine.evaluateOnPublish(id, sellerId);

    // 3. Canonical ListingModeration snapshot (content + risk)
    const finalized = await this.moderation.finalizeWithRisk({
      listingId: id,
      content: mod,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskFlags: risk.flags,
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
        riskFlags: risk.flags,
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
      riskScore: risk.score,
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

  private async removalActivity(ids: string[]) {
    const map = new Map<string, RemovalActivity>();
    if (ids.length === 0) return map;
    const wanted = new Set(ids);
    const bump = (
      id: string | null | undefined,
      key: keyof RemovalActivity,
    ) => {
      if (!id || !wanted.has(id)) return;
      const current = map.get(id) ?? { ...EMPTY_REMOVAL_ACTIVITY };
      current[key] += 1;
      map.set(id, current);
    };
    const touchOrder = (order: {
      listingId: string;
      swapListingAId: string | null;
      swapListingBId: string | null;
    }) => {
      const touched = new Set(
        [order.listingId, order.swapListingAId, order.swapListingBId].filter(
          (id): id is string => Boolean(id),
        ),
      );
      for (const id of touched) bump(id, 'activeOrders');
    };

    const now = new Date();
    const listingMatch = {
      OR: [
        { listingId: { in: ids } },
        { swapListingAId: { in: ids } },
        { swapListingBId: { in: ids } },
      ],
    };
    const [orders, disputes, swaps, claims, intents, offers] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            status: { in: [...ACTIVE_ORDER_STATUSES] as OrderStatus[] },
            ...listingMatch,
          },
          select: {
            listingId: true,
            swapListingAId: true,
            swapListingBId: true,
          },
        }),
        this.prisma.dispute.findMany({
          where: {
            status: { in: ['OPENED', 'AWAITING_SELLER', 'AWAITING_ADMIN'] },
            order: listingMatch,
          },
          select: {
            order: {
              select: {
                listingId: true,
                swapListingAId: true,
                swapListingBId: true,
              },
            },
          },
        }),
        this.prisma.swapProposal.findMany({
          where: {
            status: { in: ['PENDING', 'ACCEPTED'] },
            OR: [
              { listingId: { in: ids } },
              { offeredListingId: { in: ids } },
            ],
          },
          select: { listingId: true, offeredListingId: true },
        }),
        this.prisma.giveawayClaim.findMany({
          where: {
            listingId: { in: ids },
            status: { in: ['CLAIMED', 'APPROVED'] },
          },
          select: { listingId: true },
        }),
        this.prisma.orderIntent.findMany({
          where: {
            listingId: { in: ids },
            status: 'PENDING',
            reservedUntil: { gt: now },
          },
          select: { listingId: true },
        }),
        this.prisma.offer.findMany({
          where: {
            listingId: { in: ids },
            OR: [
              { status: 'ACCEPTED' },
              {
                status: { in: ['PENDING', 'COUNTERED'] },
                expiresAt: { gt: now },
              },
            ],
          },
          select: { listingId: true },
        }),
      ]);

    for (const order of orders) touchOrder(order);
    for (const dispute of disputes) {
      const touched = new Set(
        [
          dispute.order.listingId,
          dispute.order.swapListingAId,
          dispute.order.swapListingBId,
        ].filter((id): id is string => Boolean(id)),
      );
      for (const id of touched) bump(id, 'openDisputes');
    }
    for (const swap of swaps) {
      bump(swap.listingId, 'openSwaps');
      bump(swap.offeredListingId, 'openSwaps');
    }
    for (const claim of claims) bump(claim.listingId, 'openGiveaways');
    for (const intent of intents) bump(intent.listingId, 'pendingIntents');
    for (const offer of offers) bump(offer.listingId, 'openOffers');
    return map;
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
      note: custom,
    };
  }
  if (status === 'REMOVED') {
    return {
      state: 'waiting',
      label: 'Held for review',
      note:
        note && note !== 'Admin approved'
          ? note
          : 'Taken off the marketplace while it is reviewed.',
    };
  }
  if (status === 'DRAFT') {
    return { state: 'draft', label: 'Draft', note: null };
  }
  return { state: 'closed', label: 'Closed', note };
}
