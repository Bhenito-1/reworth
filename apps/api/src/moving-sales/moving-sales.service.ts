import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MovingSaleStatus, Prisma } from '@prisma/client';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { haversineKm } from '../providers/search.provider';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicListing } from '../listings/public-listing.mapper';
import type {
  AttachMovingSaleListingsDto,
  BrowseMovingSalesQueryDto,
  CreateMovingSaleDto,
  MovingSaleEventDto,
  UpdateMovingSaleDto,
} from './dto/moving-sales.dto';

const listingInclude = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  seller: {
    include: {
      profile: true,
      verifications: true,
      trustScore: true,
      _count: {
        select: {
          reviewsReceived: { where: { status: 'PUBLISHED' as const } },
        },
      },
    },
  },
  estateCommunity: true,
  movingSale: true,
} satisfies Prisma.ListingInclude;

@Injectable()
export class MovingSalesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async create(sellerId: string, dto: CreateMovingSaleDto) {
    const deadline = new Date(dto.deadline);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      throw new BadRequestException('deadline must be in the future');
    }

    if (dto.communityId) {
      const community = await this.prisma.community.findUnique({
        where: { id: dto.communityId },
      });
      if (!community) throw new NotFoundException('Community not found');
    }

    const sale = await this.prisma.movingSale.create({
      data: {
        sellerId,
        title: dto.title,
        blurb: dto.blurb ?? '',
        deadline,
        community: dto.community ?? '',
        communityId: dto.communityId,
        geoLat: dto.geoLat,
        geoLng: dto.geoLng,
        status: 'ACTIVE',
      },
    });

    if (dto.listingIds?.length) {
      await this.attachListings(sale.id, sellerId, {
        listingIds: dto.listingIds,
      });
    }

    return this.getById(sale.id, sellerId);
  }

  async getById(id: string, viewerId?: string | null) {
    const sale = await this.prisma.movingSale.findUnique({
      where: { id },
      include: {
        seller: { include: { profile: true } },
        listings: {
          where: { status: { in: ['LIVE', 'RESERVED', 'DRAFT'] } },
          include: listingInclude,
          orderBy: { publishedAt: 'desc' },
        },
        follows: viewerId
          ? { where: { userId: viewerId }, take: 1 }
          : false,
        estate: true,
      },
    });
    if (!sale) throw new NotFoundException('Moving sale not found');

    const liveListings = sale.listings.filter((l) =>
      ['LIVE', 'RESERVED'].includes(l.status),
    );
    const combinedAskingPriceKobo = liveListings.reduce(
      (sum, l) => sum + l.priceKobo,
      0,
    );

    return {
      id: sale.id,
      title: sale.title,
      blurb: sale.blurb,
      deadline: sale.deadline,
      community: sale.community,
      communityId: sale.communityId,
      estate: sale.estate
        ? {
            id: sale.estate.id,
            slug: sale.estate.slug,
            name: sale.estate.name,
            privacy: sale.estate.privacy,
          }
        : null,
      geoLat: sale.geoLat,
      geoLng: sale.geoLng,
      status: sale.status,
      seller: {
        id: sale.seller.id,
        displayName: sale.seller.profile?.displayName ?? 'Seller',
      },
      itemCount: liveListings.length,
      combinedAskingPriceKobo,
      followed: Boolean(
        viewerId && Array.isArray(sale.follows) && sale.follows.length > 0,
      ),
      items: sale.listings.map((l) => toPublicListing(l)),
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  async update(id: string, sellerId: string, dto: UpdateMovingSaleDto) {
    await this.requireOwner(id, sellerId);
    const updated = await this.prisma.movingSale.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.blurb !== undefined ? { blurb: dto.blurb } : {}),
        ...(dto.deadline !== undefined
          ? { deadline: new Date(dto.deadline) }
          : {}),
        ...(dto.community !== undefined ? { community: dto.community } : {}),
        ...(dto.communityId !== undefined
          ? { communityId: dto.communityId }
          : {}),
        ...(dto.geoLat !== undefined ? { geoLat: dto.geoLat } : {}),
        ...(dto.geoLng !== undefined ? { geoLng: dto.geoLng } : {}),
      },
    });
    return this.getById(updated.id, sellerId);
  }

  async attachListings(
    id: string,
    sellerId: string,
    dto: AttachMovingSaleListingsDto,
  ) {
    await this.requireOwner(id, sellerId);
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: dto.listingIds } },
    });
    if (listings.length !== dto.listingIds.length) {
      throw new NotFoundException('One or more listings not found');
    }
    for (const listing of listings) {
      if (listing.sellerId !== sellerId) {
        throw new ForbiddenException('You must own listings to attach them');
      }
    }

    await this.prisma.listing.updateMany({
      where: { id: { in: dto.listingIds }, sellerId },
      data: { movingSaleId: id },
    });

    return this.getById(id, sellerId);
  }

  async detachListing(id: string, listingId: string, sellerId: string) {
    await this.requireOwner(id, sellerId);
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.movingSaleId !== id) {
      throw new NotFoundException('Listing not on this moving sale');
    }
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Not the listing owner');
    }
    await this.prisma.listing.update({
      where: { id: listingId },
      data: { movingSaleId: null },
    });
    return this.getById(id, sellerId);
  }

  async follow(id: string, userId: string) {
    const sale = await this.prisma.movingSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Moving sale not found');

    await this.prisma.movingSaleFollow.upsert({
      where: {
        movingSaleId_userId: { movingSaleId: id, userId },
      },
      create: { movingSaleId: id, userId },
      update: {},
    });

    await this.prisma.movingSaleEvent.create({
      data: {
        movingSaleId: id,
        type: 'moving_sale_followed',
        actorId: userId,
      },
    });

    if (this.notifications && sale.sellerId !== userId) {
      await this.notifications
        .notify({
          userId: sale.sellerId,
          category: NotificationCategory.MOVING_SALE_UPDATE,
          title: 'Someone followed your moving sale',
          body: sale.title,
          deepLink: `/moving-sales/${id}`,
        })
        .catch(() => undefined);
    }

    return { ok: true, followed: true };
  }

  async unfollow(id: string, userId: string) {
    await this.prisma.movingSaleFollow.deleteMany({
      where: { movingSaleId: id, userId },
    });
    return { ok: true, followed: false };
  }

  async recordEvent(
    id: string,
    actorId: string | null,
    dto: MovingSaleEventDto,
  ) {
    const sale = await this.prisma.movingSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Moving sale not found');

    const allowed = new Set([
      'moving_sale_viewed',
      'moving_sale_item_click',
      'moving_sale_followed',
    ]);
    if (!allowed.has(dto.type)) {
      throw new BadRequestException('Unsupported event type');
    }

    const event = await this.prisma.movingSaleEvent.create({
      data: {
        movingSaleId: id,
        type: dto.type,
        actorId,
        payload: dto.payload
          ? (dto.payload as Prisma.InputJsonValue)
          : undefined,
      },
    });
    return { id: event.id, type: event.type };
  }

  async browse(query: BrowseMovingSalesQueryDto, viewerId?: string | null) {
    const rows = await this.prisma.movingSale.findMany({
      where: { status: 'ACTIVE' },
      include: {
        listings: {
          where: { status: { in: ['LIVE', 'RESERVED'] }, quantityAvailable: { gt: 0 } },
          select: { id: true, priceKobo: true, geoLat: true, geoLng: true },
        },
        follows: viewerId
          ? { where: { userId: viewerId }, take: 1 }
          : false,
        estate: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 20, 50) * 3,
    });

    let mapped = rows.map((sale) => {
      const combinedAskingPriceKobo = sale.listings.reduce(
        (s, l) => s + l.priceKobo,
        0,
      );
      let distanceKm: number | null = null;
      if (
        query.lat != null &&
        query.lng != null &&
        sale.geoLat != null &&
        sale.geoLng != null
      ) {
        distanceKm = haversineKm(
          query.lat,
          query.lng,
          sale.geoLat,
          sale.geoLng,
        );
      }
      return {
        id: sale.id,
        title: sale.title,
        blurb: sale.blurb,
        deadline: sale.deadline,
        community: sale.community,
        communityId: sale.communityId,
        status: sale.status,
        itemCount: sale.listings.length,
        combinedAskingPriceKobo,
        distanceKm,
        followed: Boolean(
          viewerId && Array.isArray(sale.follows) && sale.follows.length > 0,
        ),
        coverListingId: sale.listings[0]?.id ?? null,
      };
    });

    if (
      query.radiusKm != null &&
      query.lat != null &&
      query.lng != null
    ) {
      mapped = mapped.filter(
        (m) => m.distanceKm != null && m.distanceKm <= query.radiusKm!,
      );
    }

    return {
      items: mapped.slice(0, Math.min(query.limit ?? 20, 50)),
    };
  }

  /** Deadline past → COMPLETED; listings stay LIVE. */
  async expireDueSales(now = new Date()): Promise<number> {
    const result = await this.prisma.movingSale.updateMany({
      where: {
        status: 'ACTIVE' satisfies MovingSaleStatus,
        deadline: { lt: now },
      },
      data: { status: 'COMPLETED' },
    });
    return result.count;
  }

  /** Home rail helper — ACTIVE sales ranked by itemCount + freshness. */
  async topForHome(opts: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    community?: string;
    limit?: number;
  }) {
    const rows = await this.prisma.movingSale.findMany({
      where: {
        status: 'ACTIVE',
        ...(opts.community
          ? {
              community: {
                equals: opts.community,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      },
      include: {
        listings: {
          where: { status: { in: ['LIVE', 'RESERVED'] }, quantityAvailable: { gt: 0 } },
          select: {
            id: true,
            priceKobo: true,
            publishedAt: true,
          },
          orderBy: { publishedAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    let scored = rows.map((sale) => {
      let distanceKm: number | null = null;
      if (
        opts.lat != null &&
        opts.lng != null &&
        sale.geoLat != null &&
        sale.geoLng != null
      ) {
        distanceKm = haversineKm(
          opts.lat,
          opts.lng,
          sale.geoLat,
          sale.geoLng,
        );
      }
      const combinedPriceKobo = sale.listings.reduce(
        (s, l) => s + l.priceKobo,
        0,
      );
      return {
        id: sale.id,
        title: sale.title,
        itemCount: sale.listings.length,
        combinedPriceKobo,
        deadline: sale.deadline,
        community: sale.community,
        coverListingId: sale.listings[0]?.id,
        distanceKm,
        freshness: sale.updatedAt.getTime(),
      };
    });

    if (
      opts.radiusKm != null &&
      opts.lat != null &&
      opts.lng != null
    ) {
      scored = scored.filter(
        (s) => s.distanceKm != null && s.distanceKm <= opts.radiusKm!,
      );
    }

    scored.sort((a, b) => {
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return b.freshness - a.freshness;
    });

    return scored.slice(0, opts.limit ?? 12).map(({ freshness: _f, distanceKm: _d, ...rest }) => rest);
  }

  private async requireOwner(id: string, sellerId: string) {
    const sale = await this.prisma.movingSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Moving sale not found');
    if (sale.sellerId !== sellerId) {
      throw new ForbiddenException('Not the moving sale owner');
    }
    return sale;
  }
}
