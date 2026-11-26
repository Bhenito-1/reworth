import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FulfilmentMethod, OfferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { MessagesService } from '../chat/messages.service';
import {
  assertBuyerCanMeetupOnListing,
  negotiatedUnitKoboForBuyer,
} from '../common/buyer-listing-checkout';
import { parseProposedDeliveryDate } from '../common/parse-delivery-date';
import type {
  CounterMeetupProposalDto,
  CreateMeetupProposalDto,
} from './dto/meetups.dto';

export type MeetupProposalDto = {
  id: string;
  listingId: string;
  conversationId: string | null;
  buyerId: string;
  sellerId: string;
  locationText: string;
  proposedDeliveryDate: Date | null;
  status: OfferStatus;
  parentId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  proposedByUserId?: string | null;
  orderIntentId?: string | null;
};

function toMeetupDto(row: {
  id: string;
  listingId: string;
  conversationId: string | null;
  buyerId: string;
  sellerId: string;
  locationText: string;
  proposedDeliveryDate: Date | null;
  status: OfferStatus;
  parentId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): MeetupProposalDto {
  return { ...row, parentId: row.parentId };
}

@Injectable()
export class MeetupsService {
  private readonly logger = new Logger(MeetupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
    @Optional() private readonly gateway?: ChatGateway,
  ) {}

  private expiryHours(): number {
    return Number(this.config.get('OFFER_EXPIRY_HOURS') ?? 24);
  }

  private reserveHours(): number {
    return Number(this.config.get('LISTING_RESERVE_HOURS') ?? 1);
  }

  private recipient(
    row: { buyerId: string; sellerId: string },
    proposerId: string,
  ): string {
    return proposerId === row.buyerId ? row.sellerId : row.buyerId;
  }

  private async proposerId(meetupId: string): Promise<string> {
    let cursor = await this.prisma.meetupProposal.findUnique({
      where: { id: meetupId },
    });
    if (!cursor) throw new NotFoundException('Meetup proposal not found');
    let depth = 0;
    while (cursor.parentId) {
      depth += 1;
      cursor = await this.prisma.meetupProposal.findUnique({
        where: { id: cursor.parentId },
      });
      if (!cursor) throw new NotFoundException('Meetup proposal not found');
    }
    const root = cursor;
    return depth % 2 === 0 ? root.buyerId : root.sellerId;
  }

  async create(
    listingId: string,
    buyerId: string,
    dto: CreateMeetupProposalDto,
  ): Promise<MeetupProposalDto> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('You cannot meet up on your own listing');
    }
    await assertBuyerCanMeetupOnListing(
      this.prisma,
      listing,
      buyerId,
    );

    const locationText = dto.locationText.trim();
    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );

    let conversationId = dto.conversationId ?? null;
    if (conversationId) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (
        !conversation ||
        conversation.listingId !== listingId ||
        conversation.buyerId !== buyerId
      ) {
        throw new ForbiddenException('Invalid conversation');
      }
    } else {
      const conversation = await this.prisma.conversation.upsert({
        where: {
          listingId_buyerId_sellerId: {
            listingId,
            buyerId,
            sellerId: listing.sellerId,
          },
        },
        create: { listingId, buyerId, sellerId: listing.sellerId },
        update: {},
      });
      conversationId = conversation.id;
    }

    const proposedDeliveryDate = parseProposedDeliveryDate(dto.deliveryDate);

    const row = await this.prisma.meetupProposal.create({
      data: {
        listingId,
        conversationId,
        buyerId,
        sellerId: listing.sellerId,
        locationText,
        proposedDeliveryDate,
        expiresAt,
      },
    });

    await this.messages
      .postMeetupCard({
        conversationId,
        senderId: buyerId,
        meetupProposalId: row.id,
        locationText,
      })
      .catch((err: unknown) => {
        this.logger.warn({ err, meetupId: row.id }, 'postMeetupCard failed');
      });

    const mapped = { ...toMeetupDto(row), proposedByUserId: buyerId };
    this.gateway?.emitToConversation(conversationId, 'meetup.updated', mapped);
    return mapped;
  }

  async listForListing(
    listingId: string,
    userId: string,
  ): Promise<MeetupProposalDto[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const isSeller = listing.sellerId === userId;
    const rows = await this.prisma.meetupProposal.findMany({
      where: {
        listingId,
        ...(isSeller ? {} : { buyerId: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map(toMeetupDto);
    const withProposers = this.attachProposers(mapped);
    return this.attachOrderIntents(withProposers);
  }

  private attachProposers(rows: MeetupProposalDto[]): MeetupProposalDto[] {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const proposerFor = (row: MeetupProposalDto): string => {
      let depth = 0;
      let cursor: MeetupProposalDto | undefined = row;
      while (cursor?.parentId) {
        depth += 1;
        const parent = byId.get(cursor.parentId);
        if (!parent) break;
        cursor = parent;
      }
      const root = cursor ?? row;
      return depth % 2 === 0 ? root.buyerId : root.sellerId;
    };
    return rows.map((r) => ({
      ...r,
      proposedByUserId: proposerFor(r),
    }));
  }

  private async attachOrderIntents(
    rows: MeetupProposalDto[],
  ): Promise<MeetupProposalDto[]> {
    const accepted = rows
      .filter((r) => r.status === 'ACCEPTED')
      .map((r) => r.id);
    if (accepted.length === 0) return rows;
    const intents = await this.prisma.orderIntent.findMany({
      where: {
        meetupProposalId: { in: accepted },
        status: 'PENDING',
      },
      select: { id: true, meetupProposalId: true },
    });
    const byMeetup = new Map(
      intents
        .filter((i) => i.meetupProposalId)
        .map((i) => [i.meetupProposalId as string, i.id]),
    );
    return rows.map((r) => ({
      ...r,
      orderIntentId: byMeetup.get(r.id) ?? null,
    }));
  }

  async accept(meetupId: string, userId: string) {
    const head = await this.prisma.meetupProposal.findUnique({
      where: { id: meetupId },
    });
    if (!head) throw new NotFoundException('Meetup proposal not found');
    const proposer = await this.proposerId(meetupId);
    if (this.recipient(head, proposer) !== userId) {
      throw new ForbiddenException('Only the other party can accept');
    }
    if (head.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${head.status}`);
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: head.listingId },
    });
    if (!listing) {
      throw new ConflictException('Listing is not available');
    }
    await assertBuyerCanMeetupOnListing(
      this.prisma,
      listing,
      head.buyerId,
    );

    const { amountKobo, offerId } = await negotiatedUnitKoboForBuyer(
      this.prisma,
      head.listingId,
      head.buyerId,
      listing.priceKobo,
    );

    const reservedUntil = new Date(
      Date.now() + this.reserveHours() * 60 * 60 * 1000,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.meetupProposal.updateMany({
        where: { id: meetupId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Proposal already handled');
      }
      const updated = await tx.meetupProposal.findUniqueOrThrow({
        where: { id: meetupId },
      });
      await tx.meetupProposal.updateMany({
        where: {
          listingId: head.listingId,
          status: 'PENDING',
          id: { not: meetupId },
        },
        data: { status: 'EXPIRED' },
      });

      const orderIntent = await tx.orderIntent.create({
        data: {
          listingId: head.listingId,
          buyerId: head.buyerId,
          sellerId: head.sellerId,
          offerId,
          meetupProposalId: head.id,
          fulfilmentMethod: FulfilmentMethod.MEET_POINT,
          meetupLocationText: updated.locationText,
          amountKobo,
          status: 'PENDING',
          reservedUntil,
        },
      });

      return { updated, orderIntent, listing };
    });

    const mapped = {
      ...toMeetupDto(result.updated),
      orderIntentId: result.orderIntent.id,
      proposedByUserId: proposer,
    };
    if (head.conversationId) {
      await this.messages
        .postMeetupCheckoutLink({
          conversationId: head.conversationId,
          sellerId: head.sellerId,
          meetupProposalId: head.id,
          orderIntentId: result.orderIntent.id,
          listingId: head.listingId,
          buyerId: head.buyerId,
          locationText: result.updated.locationText,
        })
        .catch(() => undefined);
    }
    if (head.conversationId) {
      this.gateway?.emitToConversation(
        head.conversationId,
        'meetup.updated',
        mapped,
      );
    }
    return {
      meetup: mapped,
      orderIntent: {
        id: result.orderIntent.id,
        reservedUntil: result.orderIntent.reservedUntil,
        amountKobo: result.orderIntent.amountKobo,
        fulfilmentMethod: FulfilmentMethod.MEET_POINT,
        meetupLocationText: result.updated.locationText,
      },
    };
  }

  async reject(meetupId: string, userId: string): Promise<MeetupProposalDto> {
    const head = await this.prisma.meetupProposal.findUnique({
      where: { id: meetupId },
    });
    if (!head) throw new NotFoundException('Meetup proposal not found');
    const proposer = await this.proposerId(meetupId);
    if (this.recipient(head, proposer) !== userId) {
      throw new ForbiddenException('Only the other party can reject');
    }
    if (head.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${head.status}`);
    }
    const updated = await this.prisma.meetupProposal.update({
      where: { id: meetupId },
      data: { status: 'REJECTED' },
    });
    const mapped = {
      ...toMeetupDto(updated),
      proposedByUserId: proposer,
    };
    if (head.conversationId) {
      this.gateway?.emitToConversation(
        head.conversationId,
        'meetup.updated',
        mapped,
      );
    }
    return mapped;
  }

  async counter(
    meetupId: string,
    actorId: string,
    dto: CounterMeetupProposalDto,
  ): Promise<MeetupProposalDto> {
    const parent = await this.prisma.meetupProposal.findUnique({
      where: { id: meetupId },
    });
    if (!parent) throw new NotFoundException('Meetup proposal not found');
    if (parent.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${parent.status}`);
    }
    const proposer = await this.proposerId(parent.id);
    if (actorId === proposer) {
      throw new ForbiddenException('Wait for the other party to respond');
    }
    if (actorId !== parent.buyerId && actorId !== parent.sellerId) {
      throw new ForbiddenException('Not a participant');
    }
    if (proposer === parent.buyerId && actorId !== parent.sellerId) {
      throw new ForbiddenException('Only the seller can suggest another place');
    }
    if (proposer === parent.sellerId && actorId !== parent.buyerId) {
      throw new ForbiddenException('Only the buyer can suggest another place');
    }

    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );
    const locationText = dto.locationText.trim();
    const proposedDeliveryDate = parseProposedDeliveryDate(dto.deliveryDate);

    const child = await this.prisma.$transaction(async (tx) => {
      await tx.meetupProposal.update({
        where: { id: meetupId },
        data: { status: 'COUNTERED' },
      });
      return tx.meetupProposal.create({
        data: {
          listingId: parent.listingId,
          conversationId: parent.conversationId,
          buyerId: parent.buyerId,
          sellerId: parent.sellerId,
          locationText,
          proposedDeliveryDate,
          status: 'PENDING',
          parentId: parent.id,
          expiresAt,
        },
      });
    });

    if (parent.conversationId) {
      await this.messages
        .postMeetupCard({
          conversationId: parent.conversationId,
          senderId: actorId,
          meetupProposalId: child.id,
          locationText,
        })
        .catch(() => undefined);
    }

    const mapped = { ...toMeetupDto(child), proposedByUserId: actorId };
    if (parent.conversationId) {
      this.gateway?.emitToConversation(
        parent.conversationId,
        'meetup.updated',
        mapped,
      );
    }
    return mapped;
  }

  async withdraw(
    meetupId: string,
    buyerId: string,
  ): Promise<MeetupProposalDto> {
    const head = await this.prisma.meetupProposal.findUnique({
      where: { id: meetupId },
    });
    if (!head) throw new NotFoundException('Meetup proposal not found');
    if (head.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can withdraw');
    }
    if (head.parentId) {
      throw new ConflictException('Only the original proposal can be withdrawn');
    }
    if (head.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${head.status}`);
    }
    const updated = await this.prisma.meetupProposal.update({
      where: { id: meetupId },
      data: { status: 'WITHDRAWN' },
    });
    return toMeetupDto(updated);
  }
}