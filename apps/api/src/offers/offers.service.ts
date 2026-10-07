import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OfferStatus } from '@prisma/client';
import { ListingStateMachine } from '../listings/listing-state.machine';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { NotificationStub } from '../chat/notification.stub';
import { FeatureStoreService } from '../intelligence/feature-store.service';
import type { CounterOfferDto, CreateOfferDto } from './dto/offers.dto';

export type OfferDto = {
  id: string;
  listingId: string;
  conversationId: string | null;
  buyerId: string;
  sellerId: string;
  amountKobo: number;
  note: string | null;
  status: OfferStatus;
  parentOfferId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export function toOfferDto(o: {
  id: string;
  listingId: string;
  conversationId: string | null;
  buyerId: string;
  sellerId: string;
  amountKobo: number;
  note: string | null;
  status: OfferStatus;
  parentOfferId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): OfferDto {
  return {
    id: o.id,
    listingId: o.listingId,
    conversationId: o.conversationId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    amountKobo: o.amountKobo,
    note: o.note,
    status: o.status,
    parentOfferId: o.parentOfferId,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationStub,
    @Optional() private readonly gateway?: ChatGateway,
    @Optional() private readonly features?: FeatureStoreService,
  ) {}

  private expiryHours(): number {
    return Number(this.config.get('OFFER_EXPIRY_HOURS') ?? 24);
  }

  private reserveHours(): number {
    return Number(this.config.get('LISTING_RESERVE_HOURS') ?? 1);
  }

  async create(
    listingId: string,
    buyerId: string,
    dto: CreateOfferDto,
  ): Promise<OfferDto> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === buyerId) {
      throw new ForbiddenException('Cannot offer on your own listing');
    }
    if (listing.status !== 'LIVE') {
      throw new ConflictException('Listing is not available for offers');
    }

    const pending = await this.prisma.offer.findFirst({
      where: {
        listingId,
        buyerId,
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new ConflictException('Active pending offer already exists');
    }

    if (dto.conversationId) {
      const c = await this.prisma.conversation.findUnique({
        where: { id: dto.conversationId },
      });
      if (
        !c ||
        c.listingId !== listingId ||
        (c.buyerId !== buyerId && c.sellerId !== buyerId)
      ) {
        throw new ForbiddenException('Invalid conversation for offer');
      }
    }

    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );

    const offer = await this.prisma.offer.create({
      data: {
        listingId,
        conversationId: dto.conversationId,
        buyerId,
        sellerId: listing.sellerId,
        amountKobo: dto.amountKobo,
        note: dto.note,
        status: 'PENDING',
        expiresAt,
      },
    });
    await this.prisma.offerEvent.create({
      data: {
        offerId: offer.id,
        type: 'CREATED',
        actorUserId: buyerId,
        payload: { amountKobo: dto.amountKobo },
      },
    });

    const mapped = toOfferDto(offer);
    this.gateway?.emitOfferUpdated(offer.conversationId, mapped);
    if (this.features) {
      void this.features
        .recordUserEvent({
          userId: buyerId,
          city: listing.city,
          categoryId: listing.categoryId,
          brand: listing.brand,
          community: listing.community,
          priceKobo: listing.priceKobo,
          kind: 'offer',
        })
        .catch(() => undefined);
      void this.features
        .recordListingEvent({
          listingId,
          city: listing.city,
          kind: 'offer',
        })
        .catch(() => undefined);
    }
    return mapped;
  }

  async listForListing(listingId: string, userId: string): Promise<OfferDto[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const isSeller = listing.sellerId === userId;
    const offers = await this.prisma.offer.findMany({
      where: {
        listingId,
        ...(isSeller ? {} : { buyerId: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!isSeller && offers.length === 0) {
      // Buyer with no offers — still participant check via conversation optional
      // Allow empty list for any authenticated viewer who is seller/buyer of offers
    }
    if (!isSeller) {
      const hasOwn = offers.some((o) => o.buyerId === userId);
      if (!hasOwn) {
        // Non-participants get empty or forbidden — prefer empty for buyers without offers
        const anyParticipation = await this.prisma.conversation.findFirst({
          where: { listingId, OR: [{ buyerId: userId }, { sellerId: userId }] },
        });
        if (!anyParticipation && listing.sellerId !== userId) {
          throw new ForbiddenException('Not a listing participant');
        }
      }
    }

    return offers.map(toOfferDto);
  }

  async accept(offerId: string, sellerId: string): Promise<{
    offer: OfferDto;
    orderIntent: { id: string; reservedUntil: Date; amountKobo: number };
  }> {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({ where: { id: offerId } });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.sellerId !== sellerId) {
        throw new ForbiddenException('Only the seller can accept');
      }
      if (offer.status === 'ACCEPTED') {
        throw new ConflictException('Offer already accepted');
      }
      if (offer.status !== 'PENDING') {
        throw new ConflictException(`Offer is ${offer.status}`);
      }

      const listing = await tx.listing.findUnique({
        where: { id: offer.listingId },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      ListingStateMachine.assertTransition(listing.status, 'RESERVED');

      const reservedUntil = new Date(
        Date.now() + this.reserveHours() * 60 * 60 * 1000,
      );

      // Race-safe: only one acceptor wins if status still PENDING
      const claimed = await tx.offer.updateMany({
        where: { id: offerId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Offer already accepted');
      }

      const updated = await tx.offer.findUniqueOrThrow({
        where: { id: offerId },
      });

      await tx.offerEvent.create({
        data: {
          offerId,
          type: 'ACCEPTED',
          actorUserId: sellerId,
        },
      });

      // Expire other pending offers on listing
      await tx.offer.updateMany({
        where: {
          listingId: offer.listingId,
          status: 'PENDING',
          id: { not: offerId },
        },
        data: { status: 'EXPIRED' },
      });

      await tx.listing.update({
        where: { id: offer.listingId },
        data: { status: 'RESERVED' },
      });
      await tx.listingEvent.create({
        data: {
          listingId: offer.listingId,
          type: 'STATUS_CHANGED',
          actorUserId: sellerId,
          payload: {
            from: listing.status,
            to: 'RESERVED',
            reason: 'offer_accepted',
            offerId,
          },
        },
      });

      const orderIntent = await tx.orderIntent.create({
        data: {
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          offerId: offer.id,
          amountKobo: offer.amountKobo,
          status: 'PENDING',
          reservedUntil,
        },
      });

      return {
        offer: toOfferDto(updated),
        orderIntent: {
          id: orderIntent.id,
          reservedUntil: orderIntent.reservedUntil,
          amountKobo: orderIntent.amountKobo,
        },
      };
    }).then((result) => {
      this.notifications.log('offer.accepted', {
        offerId,
        buyerId: result.offer.buyerId,
        sellerId: result.offer.sellerId,
        listingId: result.offer.listingId,
        amountKobo: result.offer.amountKobo,
      });
      this.notifications.log('offer.accepted.buyer', {
        userId: result.offer.buyerId,
        offerId,
      });
      this.notifications.log('offer.accepted.seller', {
        userId: result.offer.sellerId,
        offerId,
      });
      this.gateway?.emitOfferUpdated(
        result.offer.conversationId,
        result.offer,
      );
      return result;
    });
  }

  async reject(offerId: string, sellerId: string): Promise<OfferDto> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can reject');
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictException(`Offer is ${offer.status}`);
    }
    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'REJECTED' },
    });
    await this.prisma.offerEvent.create({
      data: {
        offerId,
        type: 'REJECTED',
        actorUserId: sellerId,
      },
    });
    const mapped = toOfferDto(updated);
    this.gateway?.emitOfferUpdated(updated.conversationId, mapped);
    return mapped;
  }

  async counter(
    offerId: string,
    actorId: string,
    dto: CounterOfferDto,
  ): Promise<OfferDto> {
    const parent = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });
    if (!parent) throw new NotFoundException('Offer not found');
    if (parent.status !== 'PENDING') {
      throw new ConflictException(`Offer is ${parent.status}`);
    }
    if (actorId !== parent.sellerId) {
      throw new ForbiddenException('Only the seller can counter an offer');
    }

    // The original buyer and seller stay on the new offer.
    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: offerId },
        data: { status: 'COUNTERED' },
      });
      await tx.offerEvent.create({
        data: {
          offerId,
          type: 'COUNTERED',
          actorUserId: actorId,
          payload: { amountKobo: dto.amountKobo },
        },
      });
      const child = await tx.offer.create({
        data: {
          listingId: parent.listingId,
          conversationId: parent.conversationId,
          buyerId: parent.buyerId,
          sellerId: parent.sellerId,
          amountKobo: dto.amountKobo,
          note: dto.note,
          status: 'PENDING',
          parentOfferId: parent.id,
          expiresAt,
        },
      });
      await tx.offerEvent.create({
        data: {
          offerId: child.id,
          type: 'CREATED',
          actorUserId: actorId,
          payload: { parentOfferId: parent.id, amountKobo: dto.amountKobo },
        },
      });
      return child;
    });

    const mapped = toOfferDto(result);
    this.gateway?.emitOfferUpdated(result.conversationId, mapped);
    return mapped;
  }

  async withdraw(offerId: string, buyerId: string): Promise<OfferDto> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can withdraw');
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictException(`Offer is ${offer.status}`);
    }
    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'WITHDRAWN' },
    });
    await this.prisma.offerEvent.create({
      data: {
        offerId,
        type: 'WITHDRAWN',
        actorUserId: buyerId,
      },
    });
    const mapped = toOfferDto(updated);
    this.gateway?.emitOfferUpdated(updated.conversationId, mapped);
    return mapped;
  }

  async expireDueOffers(now = new Date()): Promise<number> {
    const due = await this.prisma.offer.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      select: { id: true },
    });
    if (due.length === 0) return 0;

    await this.prisma.offer.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    for (const row of due) {
      await this.prisma.offerEvent.create({
        data: {
          offerId: row.id,
          type: 'EXPIRED',
          payload: { reason: 'expiry_cron' },
        },
      });
    }
    return due.length;
  }
}
