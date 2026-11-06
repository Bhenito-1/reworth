import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OfferStatus } from '@prisma/client';
import { ListingStateMachine } from '../listings/listing-state.machine';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { MessagesService } from '../chat/messages.service';
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
  /** Pending checkout intent after seller accepts (buyer completes payment). */
  orderIntentId?: string | null;
  /** User who created this offer row (buyer opening bid or counter author). */
  proposedByUserId?: string | null;
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
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationStub,
    private readonly messages: MessagesService,
    @Optional() private readonly gateway?: ChatGateway,
    @Optional() private readonly features?: FeatureStoreService,
  ) {}

  private expiryHours(): number {
    return Number(this.config.get('OFFER_EXPIRY_HOURS') ?? 24);
  }

  private reserveHours(): number {
    return Number(this.config.get('LISTING_RESERVE_HOURS') ?? 1);
  }

  private offerRecipient(
    offer: { buyerId: string; sellerId: string },
    proposerId: string,
  ): string {
    return proposerId === offer.buyerId ? offer.sellerId : offer.buyerId;
  }

  private async proposedByUserId(offerId: string): Promise<string> {
    const row = await this.prisma.offerEvent.findFirst({
      where: { offerId, type: 'CREATED' },
      select: { actorUserId: true },
    });
    if (!row?.actorUserId) {
      throw new ConflictException('Offer history incomplete');
    }
    return row.actorUserId;
  }

  private async attachProposers(offers: OfferDto[]): Promise<OfferDto[]> {
    if (offers.length === 0) return offers;
    const rows = await this.prisma.offerEvent.findMany({
      where: {
        offerId: { in: offers.map((o) => o.id) },
        type: 'CREATED',
      },
      select: { offerId: true, actorUserId: true },
    });
    const byOffer = new Map(
      rows.map((r) => [r.offerId, r.actorUserId ?? null] as const),
    );
    return offers.map((o) => ({
      ...o,
      proposedByUserId: byOffer.get(o.id) ?? null,
    }));
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

    const conversation =
      dto.conversationId != null
        ? await this.prisma.conversation.findUnique({
            where: { id: dto.conversationId },
          })
        : await this.messages.createOrGetConversation(buyerId, listingId);

    let linked = offer;
    if (conversation && conversation.id !== offer.conversationId) {
      linked = await this.prisma.offer.update({
        where: { id: offer.id },
        data: { conversationId: conversation.id },
      });
    }

    if (conversation) {
      await this.messages
        .postOfferCard({
          conversationId: conversation.id,
          buyerId,
          offerId: linked.id,
          amountKobo: dto.amountKobo,
        })
        .catch((err: unknown) => {
          this.logger.warn(
            { offerId: linked.id, conversationId: conversation.id, err },
            'postOfferCard failed after offer create',
          );
        });
    }

    const mapped = toOfferDto(linked);
    this.gateway?.emitOfferUpdated(linked.conversationId, mapped);
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
    return { ...mapped, proposedByUserId: buyerId };
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

    const mapped = offers.map(toOfferDto);
    const withIntents = await this.attachOrderIntentIds(mapped);
    return this.attachProposers(withIntents);
  }

  private async attachOrderIntentIds(offers: OfferDto[]): Promise<OfferDto[]> {
    const acceptedIds = offers
      .filter((o) => o.status === 'ACCEPTED')
      .map((o) => o.id);
    if (acceptedIds.length === 0) return offers;
    const intents = await this.prisma.orderIntent.findMany({
      where: {
        offerId: { in: acceptedIds },
        status: 'PENDING',
      },
      select: { id: true, offerId: true },
    });
    const byOffer = new Map(
      intents
        .filter((i) => i.offerId)
        .map((i) => [i.offerId as string, i.id]),
    );
    return offers.map((o) => ({
      ...o,
      orderIntentId: byOffer.get(o.id) ?? null,
    }));
  }

  async getOrderIntent(intentId: string, userId: string) {
    const intent = await this.prisma.orderIntent.findUnique({
      where: { id: intentId },
    });
    if (!intent) throw new NotFoundException('Checkout session not found');
    if (intent.buyerId !== userId && intent.sellerId !== userId) {
      throw new ForbiddenException('Not your checkout session');
    }
    if (intent.status !== 'PENDING') {
      throw new ConflictException('Checkout session is no longer available');
    }
    if (intent.reservedUntil.getTime() < Date.now()) {
      throw new ConflictException('Checkout reservation expired');
    }
    return {
      id: intent.id,
      listingId: intent.listingId,
      offerId: intent.offerId,
      amountKobo: intent.amountKobo,
      reservedUntil: intent.reservedUntil,
    };
  }

  async accept(offerId: string, userId: string): Promise<{
    offer: OfferDto;
    orderIntent: { id: string; reservedUntil: Date; amountKobo: number };
  }> {
    const head = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!head) throw new NotFoundException('Offer not found');
    const proposer = await this.proposedByUserId(offerId);
    if (this.offerRecipient(head, proposer) !== userId) {
      throw new ForbiddenException('Only the other party can accept this offer');
    }

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({ where: { id: offerId } });
      if (!offer) throw new NotFoundException('Offer not found');
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
          actorUserId: userId,
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
          actorUserId: userId,
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
        offer: {
          ...toOfferDto(updated),
          orderIntentId: orderIntent.id,
          proposedByUserId: proposer,
        },
        orderIntent: {
          id: orderIntent.id,
          reservedUntil: orderIntent.reservedUntil,
          amountKobo: orderIntent.amountKobo,
        },
      };
    }).then(async (result) => {
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
      if (result.offer.conversationId) {
        await this.messages
          .postOfferCheckoutLink({
            conversationId: result.offer.conversationId,
            sellerId: result.offer.sellerId,
            offerId: result.offer.id,
            orderIntentId: result.orderIntent.id,
            listingId: result.offer.listingId,
            amountKobo: result.orderIntent.amountKobo,
            buyerId: result.offer.buyerId,
          })
          .catch(() => undefined);
      }
      return result;
    });
  }

  async reject(offerId: string, userId: string): Promise<OfferDto> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const proposer = await this.proposedByUserId(offerId);
    if (this.offerRecipient(offer, proposer) !== userId) {
      throw new ForbiddenException('Only the other party can reject this offer');
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
        actorUserId: userId,
      },
    });
    const mapped = {
      ...toOfferDto(updated),
      proposedByUserId: proposer,
    };
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
    const proposer = await this.proposedByUserId(parent.id);
    if (actorId === proposer) {
      throw new ForbiddenException(
        'You cannot counter your own offer. Wait for the other party to respond.',
      );
    }
    if (actorId !== parent.buyerId && actorId !== parent.sellerId) {
      throw new ForbiddenException('Not a participant on this offer');
    }
    if (proposer === parent.sellerId) {
      throw new ForbiddenException(
        'The buyer can only accept or reject this counter',
      );
    }
    if (proposer === parent.buyerId && actorId !== parent.sellerId) {
      throw new ForbiddenException('Only the seller can counter a buyer offer');
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

    const mapped = { ...toOfferDto(result), proposedByUserId: actorId };
    this.gateway?.emitOfferUpdated(result.conversationId, mapped);
    return mapped;
  }

  async withdraw(offerId: string, buyerId: string): Promise<OfferDto> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can withdraw');
    }
    if (offer.parentOfferId != null) {
      throw new ConflictException(
        'Only your original offer can be withdrawn, not a counter',
      );
    }
    const proposer = await this.proposedByUserId(offerId);
    if (proposer !== buyerId) {
      throw new ForbiddenException('Only your original offer can be withdrawn');
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
    const mapped = {
      ...toOfferDto(updated),
      proposedByUserId: proposer,
    };
    this.gateway?.emitOfferUpdated(updated.conversationId, mapped);
    if (updated.conversationId) {
      await this.messages
        .alertSellerOfferWithdrawn({
          sellerId: updated.sellerId,
          conversationId: updated.conversationId,
          offerId: updated.id,
        })
        .catch((err: unknown) => {
          this.logger.warn(
            { offerId: updated.id, err },
            'alertSellerOfferWithdrawn failed',
          );
        });
    }
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
