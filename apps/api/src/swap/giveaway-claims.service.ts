import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FulfilmentMethod,
  GiveawayClaimStatus,
  MessageType,
  TransactionType,
  VerificationLevel,
  VerificationStatus,
} from '@prisma/client';
import { RegionConfigService } from '../region/region-config.service';
import { quoteGiftDelivery } from './swap-fees';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGiveawayClaimDto } from './dto/swap.dto';

export type GiveawayClaimDto = {
  id: string;
  listingId: string;
  claimantId: string;
  status: GiveawayClaimStatus;
  note: string | null;
  expiresAt: Date;
  createdAt: Date;
  reviewedAt: Date | null;
};

export function toGiveawayClaimDto(c: {
  id: string;
  listingId: string;
  claimantId: string;
  status: GiveawayClaimStatus;
  note: string | null;
  expiresAt: Date;
  createdAt: Date;
  reviewedAt: Date | null;
}): GiveawayClaimDto {
  return {
    id: c.id,
    listingId: c.listingId,
    claimantId: c.claimantId,
    status: c.status,
    note: c.note,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
    reviewedAt: c.reviewedAt,
  };
}

@Injectable()
export class GiveawayClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly regions?: RegionConfigService,
  ) {}

  /** Delivery from the gift to the buyer's preferred area. */
  async previewDelivery(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellingMode !== 'GIVE_AWAY') {
      throw new BadRequestException('Listing is not a give-away');
    }
    return this.quoteForBuyer(listing, userId);
  }

  private async quoteForBuyer(
    listing: {
      geoLat?: number | null;
      geoLng?: number | null;
      city?: string | null;
      community?: string | null;
    },
    userId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { preferredCommunity: true } } },
    });
    const area =
      user?.profile?.preferredCommunity?.trim() ||
      listing.community?.trim() ||
      '';
    const geo = area
      ? this.regions?.getCommunityGeo(listing.city || 'lagos', area)
      : null;
    const quote = quoteGiftDelivery(
      listing,
      geo ? { lat: geo.geoLat, lng: geo.geoLng } : undefined,
    );
    return {
      ...quote,
      area: geo?.label || area || 'your area',
    };
  }

  private expiryHours(): number {
    return Number(this.config.get('GIVEAWAY_CLAIM_EXPIRY_HOURS') ?? 72);
  }

  private async assertL2OrHigher(userId: string): Promise<void> {
    const verified = await this.prisma.verification.findFirst({
      where: {
        userId,
        status: VerificationStatus.VERIFIED,
        level: {
          in: [VerificationLevel.L2_EMAIL, VerificationLevel.L3_IDENTITY],
        },
      },
    });
    if (!verified) {
      throw new ForbiddenException(
        'Give-away claims require L2 email or L3 identity verification',
      );
    }
  }

  async claim(
    listingId: string,
    claimantId: string,
    dto: CreateGiveawayClaimDto,
  ): Promise<{
    claim: GiveawayClaimDto;
    order: {
      id: string;
      deliveryFeeKobo: number;
      swapFeeKobo: number;
      totalKobo: number;
    };
  }> {
    await this.assertL2OrHigher(claimantId);

    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === claimantId) {
      throw new ForbiddenException('Cannot claim your own give-away');
    }
    if (listing.sellingMode !== 'GIVE_AWAY') {
      throw new BadRequestException('Listing is not a give-away');
    }
    if ((listing.quantityAvailable ?? 0) < 1) {
      throw new ConflictException('This gift has already been claimed');
    }
    if (listing.status !== 'LIVE' && listing.status !== 'RESERVED') {
      throw new ConflictException('Listing is not available');
    }
    if (listing.priceKobo !== 0) {
      throw new BadRequestException('Give-away listing must have price 0');
    }

    const existing = await this.prisma.giveawayClaim.findUnique({
      where: {
        listingId_claimantId: { listingId, claimantId },
      },
    });
    if (existing) {
      if (existing.status === 'APPROVED' || existing.status === 'COMPLETED') {
        throw new ConflictException('You already received this gift');
      }
      if (existing.status === 'CLAIMED') {
        const open = await this.prisma.order.findFirst({
          where: {
            giveawayClaimId: existing.id,
            status: { in: ['PAYMENT_PENDING', 'CREATED'] },
          },
        });
        if (open) {
          return {
            claim: toGiveawayClaimDto(existing),
            order: {
              id: open.id,
              deliveryFeeKobo: open.deliveryFeeKobo,
              swapFeeKobo: open.swapFeeKobo,
              totalKobo: open.totalKobo,
            },
          };
        }
      }
      throw new ConflictException(
        `Existing claim is ${existing.status}; cannot re-claim`,
      );
    }

    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );

    const quote = await this.quoteForBuyer(listing, claimantId);
    const claim = await this.prisma.giveawayClaim.create({
      data: {
        listingId,
        claimantId,
        status: 'CLAIMED',
        note: dto.note,
        expiresAt,
      },
    });
    const order = await this.prisma.order.create({
      data: {
        listingId,
        buyerId: claimantId,
        sellerId: listing.sellerId,
        amountKobo: 0,
        quantity: 1,
        protectionFeeKobo: 0,
        deliveryFeeKobo: quote.deliveryFeeKobo,
        swapFeeKobo: 0,
        totalKobo: quote.deliveryFeeKobo,
        fulfilmentMethod: FulfilmentMethod.DELIVERY,
        status: 'PAYMENT_PENDING',
        confirmationStatus: 'CONFIRMED',
        buyerProtection: false,
        transactionType: TransactionType.GIVEAWAY,
        giveawayClaimId: claim.id,
        swapListingAId: listing.id,
        legAStatus: 'PENDING',
        legBStatus: null,
      },
    });
    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'CREATED',
        actorUserId: claimantId,
        payload: {
          transactionType: TransactionType.GIVEAWAY,
          giveawayClaimId: claim.id,
          deliveryFeeKobo: quote.deliveryFeeKobo,
        },
      },
    });
    const shipment = await this.prisma.deliveryShipment.create({
      data: {
        orderId: order.id,
        provider: 'mock-delivery',
        quoteKobo: quote.deliveryFeeKobo,
        distanceKm: quote.distanceKm,
        status: 'QUOTED',
      },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        shipmentId: shipment.id,
        status: 'QUOTED',
        payload: {
          feeKobo: quote.deliveryFeeKobo,
          distanceKm: quote.distanceKm,
        },
      },
    });

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        listingId_buyerId_sellerId: {
          listingId,
          buyerId: claimantId,
          sellerId: listing.sellerId,
        },
      },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          listingId,
          buyerId: claimantId,
          sellerId: listing.sellerId,
        },
      });
    }
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: claimantId,
        type: MessageType.GIVEAWAY_CLAIM,
        body: JSON.stringify({
          giveawayClaimId: claim.id,
          orderId: order.id,
        }),
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    await this.notifications?.notify({
      userId: listing.sellerId,
      category: NotificationCategory.NEW_OFFER,
      title: 'Gift delivery started',
      body: 'Someone is paying the delivery fee for your give-away. The first payment gets one unit.',
      deepLink: `reworth://orders/${order.id}`,
      meta: { giveawayClaimId: claim.id, listingId, orderId: order.id },
    });

    return {
      claim: toGiveawayClaimDto(claim),
      order: {
        id: order.id,
        deliveryFeeKobo: quote.deliveryFeeKobo,
        swapFeeKobo: 0,
        totalKobo: quote.deliveryFeeKobo,
      },
    };
  }

  async listForListing(
    listingId: string,
    userId: string,
  ): Promise<GiveawayClaimDto[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const isSeller = listing.sellerId === userId;
    const claims = await this.prisma.giveawayClaim.findMany({
      where: {
        listingId,
        ...(isSeller ? {} : { claimantId: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!isSeller && claims.length === 0 && listing.sellerId !== userId) {
      throw new ForbiddenException('Not a listing participant');
    }

    return claims.map(toGiveawayClaimDto);
  }

  async approve(
    _claimId: string,
    _sellerId: string,
  ): Promise<{ claim: GiveawayClaimDto; order: { id: string } }> {
    throw new ConflictException(
      'Gifts are first come, first served. A verified buyer gets one unit by paying the delivery fee.',
    );
  }

  async reject(claimId: string, sellerId: string): Promise<GiveawayClaimDto> {
    const claim = await this.prisma.giveawayClaim.findUnique({
      where: { id: claimId },
    });
    if (!claim) throw new NotFoundException('Give-away claim not found');

    const listing = await this.prisma.listing.findUnique({
      where: { id: claim.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can reject');
    }
    if (claim.status !== 'CLAIMED') {
      throw new ConflictException(`Claim is ${claim.status}`);
    }

    const updated = await this.prisma.giveawayClaim.update({
      where: { id: claimId },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });

    await this.notifications?.notify({
      userId: claim.claimantId,
      category: NotificationCategory.OFFER_REJECTED,
      title: 'Give-away claim rejected',
      body: 'Your give-away claim was rejected.',
      deepLink: `reworth://listings/${claim.listingId}`,
      meta: { giveawayClaimId: claimId },
    });

    return toGiveawayClaimDto(updated);
  }

  async expireDueClaims(now = new Date()): Promise<number> {
    const due = await this.prisma.giveawayClaim.findMany({
      where: {
        status: 'CLAIMED',
        expiresAt: { lte: now },
      },
      select: { id: true },
    });
    if (due.length === 0) return 0;

    await this.prisma.giveawayClaim.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    return due.length;
  }
}
