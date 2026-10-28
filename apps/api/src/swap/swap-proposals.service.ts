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
  MessageType,
  Prisma,
  SwapProposalStatus,
  TransactionType,
} from '@prisma/client';
import { ChatGateway } from '../chat/chat.gateway';
import { HomeCache } from '../home/home.cache';
import { toMessageDto } from '../chat/message.mapper';
import { ListingStateMachine } from '../listings/listing-state.machine';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { quoteSwapParty, type PartyQuote } from './swap-fees';
import { PrismaService } from '../prisma/prisma.service';
import { VisionService } from '../vision/vision.service';
import type {
  CounterSwapProposalDto,
  CreateSwapProposalDto,
} from './dto/swap.dto';

const PAID_ORDER_STATUSES = new Set([
  'FUNDED',
  'IN_AUTHENTICATION',
  'SHIPPED',
  'HANDED_OVER',
  'DELIVERED',
  'RECEIVED',
  'COMPLETED',
  'DISPUTE_HOLD',
  'REFUND_REQUESTED',
  'REFUND_ISSUED',
]);

function swapPhotoMessage(result: {
  decision: string;
  evidence?: { titleMismatch?: boolean; descriptionMismatch?: boolean }[];
}): string {
  const titleMismatch =
    result.decision === 'mismatch' ||
    result.evidence?.some((item) => item.titleMismatch);
  if (titleMismatch) return 'These photos do not match the title.';
  if (result.evidence?.some((item) => item.descriptionMismatch)) {
    return 'These photos do not match the description.';
  }
  return 'Use a clearer photo of the item.';
}

function deliveryDayFromNote(note: string | null | undefined): Date | null {
  if (!note || !/^\d{4}-\d{2}-\d{2}$/.test(note)) return null;
  const day = new Date(`${note}T12:00:00.000Z`);
  return Number.isNaN(day.getTime()) ? null : day;
}

function imageUrlsFromVariants(
  images: { variants: unknown; sortOrder: number }[],
): string[] {
  return [...images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => {
      const v = img.variants as {
        original?: string;
        w640?: { webp?: string };
        w1080?: { webp?: string };
      };
      return v?.w1080?.webp ?? v?.w640?.webp ?? v?.original ?? null;
    })
    .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)));
}

export type SwapProposalDto = {
  id: string;
  listingId: string;
  proposerId: string;
  offeredListingId: string;
  note: string | null;
  status: SwapProposalStatus;
  parentProposalId: string | null;
  conversationId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export function toSwapProposalDto(p: {
  id: string;
  listingId: string;
  proposerId: string;
  offeredListingId: string;
  note: string | null;
  status: SwapProposalStatus;
  parentProposalId: string | null;
  conversationId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): SwapProposalDto {
  return {
    id: p.id,
    listingId: p.listingId,
    proposerId: p.proposerId,
    offeredListingId: p.offeredListingId,
    note: p.note,
    status: p.status,
    parentProposalId: p.parentProposalId,
    conversationId: p.conversationId,
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class SwapProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly vision?: VisionService,
    @Optional() private readonly gateway?: ChatGateway,
    @Optional() private readonly homeCache?: HomeCache,
  ) {}

  private expiryHours(): number {
    return Number(this.config.get('SWAP_PROPOSAL_EXPIRY_HOURS') ?? 72);
  }

  private async createSwapLeg(
    tx: Prisma.TransactionClient,
    input: {
      listingId: string;
      buyerId: string;
      sellerId: string;
      quote: PartyQuote;
      proposalId: string;
      swapListingAId: string;
      swapListingBId: string;
      actorUserId: string;
      deliveryDate?: Date | null;
    },
  ) {
    const order = await tx.order.create({
      data: {
        listingId: input.listingId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        amountKobo: 0,
        quantity: 1,
        protectionFeeKobo: 0,
        deliveryFeeKobo: input.quote.deliveryFeeKobo,
        swapFeeKobo: input.quote.swapFeeKobo,
        totalKobo: input.quote.totalKobo,
        fulfilmentMethod: FulfilmentMethod.DELIVERY,
        status: 'PAYMENT_PENDING',
        confirmationStatus: 'CONFIRMED',
        buyerProtection: false,
        transactionType: TransactionType.SWAP,
        swapProposalId: input.proposalId,
        swapListingAId: input.swapListingAId,
        swapListingBId: input.swapListingBId,
        legAStatus: 'PENDING',
        legBStatus: null,
        ...(input.deliveryDate ? { deliveryDate: input.deliveryDate } : {}),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'CREATED',
        actorUserId: input.actorUserId,
        payload: {
          transactionType: TransactionType.SWAP,
          swapProposalId: input.proposalId,
          deliveryFeeKobo: input.quote.deliveryFeeKobo,
          swapFeeKobo: input.quote.swapFeeKobo,
          totalKobo: input.quote.totalKobo,
        },
      },
    });
    const shipment = await tx.deliveryShipment.create({
      data: {
        orderId: order.id,
        provider: 'mock-delivery',
        quoteKobo: input.quote.deliveryFeeKobo,
        distanceKm: input.quote.distanceKm,
        status: 'QUOTED',
      },
    });
    await tx.deliveryEvent.create({
      data: {
        shipmentId: shipment.id,
        status: 'QUOTED',
        payload: {
          feeKobo: input.quote.deliveryFeeKobo,
          swapFeeKobo: input.quote.swapFeeKobo,
          distanceKm: input.quote.distanceKm,
        },
      },
    });
    return order;
  }

  /**
   * Same image-title check a listing gets before it can go live.
   * A swap proposal is only sent when the photos match the title and description.
   */
  private async assertSwapPhotosMatch(
    listingId: string,
    title: string,
    description: string,
    images: { originalKey: string; variants: unknown; sortOrder: number }[],
  ) {
    if (!this.vision) {
      throw new BadRequestException(
        'Photo check is unavailable. Try again in a moment.',
      );
    }
    const result = await this.vision.analyzeListing({
      listingId,
      title,
      description,
      images: images.map((image) => ({
        key: image.originalKey,
        url: imageUrlsFromVariants([image])[0],
      })),
    });
    if (result.decision === 'match' && !result.needsReview) return;
    throw new BadRequestException(swapPhotoMessage(result));
  }

  /** Hidden listing the proposer attaches photos to. It is not a public listing. */
  async startOffer(listingId: string, proposerId: string) {
    const target = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!target) throw new NotFoundException('Listing not found');
    if (target.sellerId === proposerId) {
      throw new ForbiddenException('Cannot propose swap on your own listing');
    }
    if (target.status !== 'LIVE') {
      throw new ConflictException('Target listing is not available');
    }
    if (target.sellingMode !== 'SWAP') {
      throw new BadRequestException('Target listing must be a swap');
    }

    const created = await this.prisma.listing.create({
      data: {
        sellerId: proposerId,
        title: 'Swap offer',
        description: '',
        sellingMode: 'SWAP',
        status: 'LIVE',
        priceKobo: 0,
        negotiable: false,
        quantityTotal: 1,
        quantityAvailable: 0,
        quantityReserved: 0,
        quantitySold: 0,
        city: target.city || 'Lagos',
        community: target.community || '',
        fulfilmentDelivery: true,
        riskFlags: ['swap-response'],
        publishedAt: new Date(),
      },
    });
    return { listingId: created.id };
  }

  async create(
    listingId: string,
    proposerId: string,
    dto: CreateSwapProposalDto,
  ): Promise<SwapProposalDto> {
    const target = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!target) throw new NotFoundException('Listing not found');
    if (target.sellerId === proposerId) {
      throw new ForbiddenException('Cannot propose swap on your own listing');
    }
    if (target.status !== 'LIVE') {
      throw new ConflictException('Target listing is not available');
    }
    if (target.sellingMode !== 'SWAP') {
      throw new BadRequestException('Target listing must be a swap');
    }

    const offered = await this.prisma.listing.findUnique({
      where: { id: dto.offeredListingId },
    });
    if (!offered) throw new NotFoundException('Offered listing not found');
    if (offered.sellerId !== proposerId) {
      throw new ForbiddenException('Offered listing must be owned by proposer');
    }
    if (offered.status !== 'LIVE') {
      throw new ConflictException('Offered listing is not LIVE');
    }
    if (offered.id === listingId) {
      throw new BadRequestException('Cannot offer the same listing');
    }
    const responseOffer = offered.riskFlags.includes('swap-response');
    if (offered.sellingMode !== 'SWAP') {
      throw new BadRequestException(
        'Add photos of the item you want to swap',
      );
    }
    let imageUrls: string[] = [];
    let offerTitle = offered.title;
    let offerDescription = offered.description;
    let deliveryOn = '';
    if (responseOffer) {
      offerTitle = dto.title?.trim() ?? '';
      offerDescription = dto.description?.trim() ?? '';
      if (offerTitle.length < 2) {
        throw new BadRequestException('Add a title for the item you want to swap');
      }
      if (offerDescription.length < 10) {
        throw new BadRequestException(
          'Describe the item you want to swap',
        );
      }
      deliveryOn = dto.deliveryOn?.trim() ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryOn)) {
        throw new BadRequestException('Choose the day you want the swap delivered');
      }
      const deliveryDay = new Date(`${deliveryOn}T12:00:00.000Z`);
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      if (
        Number.isNaN(deliveryDay.getTime()) ||
        deliveryDay.getTime() < startOfToday.getTime()
      ) {
        throw new BadRequestException('Choose a delivery day that is today or later');
      }
      await this.prisma.listing.update({
        where: { id: offered.id },
        data: { title: offerTitle, description: offerDescription },
      });
      const images = await this.prisma.listingImage.findMany({
        where: { listingId: offered.id },
        orderBy: { sortOrder: 'asc' },
      });
      if (images.length === 0) {
        throw new BadRequestException(
          'Add at least one photo of the item you want to swap',
        );
      }
      imageUrls = imageUrlsFromVariants(images);
      await this.assertSwapPhotosMatch(
        offered.id,
        offerTitle,
        offerDescription,
        images,
      );
    }

    const pending = await this.prisma.swapProposal.findFirst({
      where: {
        listingId,
        proposerId,
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new ConflictException(
        'Active pending swap proposal already exists for this listing',
      );
    }

    let conversationId = dto.conversationId ?? null;
    if (conversationId) {
      const c = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (
        !c ||
        c.listingId !== listingId ||
        (c.buyerId !== proposerId && c.sellerId !== proposerId)
      ) {
        throw new ForbiddenException('Invalid conversation for swap proposal');
      }
    } else {
      const existing = await this.prisma.conversation.findUnique({
        where: {
          listingId_buyerId_sellerId: {
            listingId,
            buyerId: proposerId,
            sellerId: target.sellerId,
          },
        },
      });
      if (existing) {
        conversationId = existing.id;
      } else {
        const created = await this.prisma.conversation.create({
          data: {
            listingId,
            buyerId: proposerId,
            sellerId: target.sellerId,
          },
        });
        conversationId = created.id;
      }
    }

    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );

    const proposal = await this.prisma.swapProposal.create({
      data: {
        listingId,
        proposerId,
        offeredListingId: dto.offeredListingId,
        note: responseOffer ? deliveryOn : dto.note,
        status: 'PENDING',
        conversationId,
        expiresAt,
      },
    });

    if (conversationId) {
      await this.prisma.message.create({
        data: {
          conversationId,
          senderId: proposerId,
          type: MessageType.SWAP_PROPOSAL_CARD,
          body: JSON.stringify({
            swapProposalId: proposal.id,
            offeredListingId: dto.offeredListingId,
            imageUrls,
            title: offerTitle,
            description: offerDescription,
            deliveryOn: deliveryOn || undefined,
          }),
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
    }

    await this.notifications?.notify({
      userId: target.sellerId,
      category: NotificationCategory.NEW_OFFER,
      title: 'New swap proposal',
      body: 'Someone proposed a swap on your listing.',
      deepLink: conversationId
        ? `reworth://chats/${conversationId}`
        : `reworth://listings/${listingId}`,
      meta: {
        swapProposalId: proposal.id,
        listingId,
        conversationId,
      },
    });

    return toSwapProposalDto(proposal);
  }

  async listForListing(
    listingId: string,
    userId: string,
  ): Promise<SwapProposalDto[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const isSeller = listing.sellerId === userId;
    const proposals = await this.prisma.swapProposal.findMany({
      where: {
        listingId,
        ...(isSeller ? {} : { proposerId: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!isSeller && proposals.length === 0) {
      const any = await this.prisma.conversation.findFirst({
        where: {
          listingId,
          OR: [{ buyerId: userId }, { sellerId: userId }],
        },
      });
      if (!any && listing.sellerId !== userId) {
        throw new ForbiddenException('Not a listing participant');
      }
    }

    return proposals.map(toSwapProposalDto);
  }

  async accept(
    proposalId: string,
    sellerId: string,
  ): Promise<{
    proposal: SwapProposalDto;
    order: { id: string };
    orders: {
      id: string;
      role: 'offerer' | 'offeree';
      payerId: string;
      distanceKm: number;
      deliveryFeeKobo: number;
      swapFeeKobo: number;
      totalKobo: number;
    }[];
  }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.swapProposal.findUnique({
        where: { id: proposalId },
      });
      if (!proposal) throw new NotFoundException('Swap proposal not found');

      const target = await tx.listing.findUnique({
        where: { id: proposal.listingId },
      });
      if (!target) throw new NotFoundException('Listing not found');
      if (target.sellerId !== sellerId) {
        throw new ForbiddenException('Only the seller can accept');
      }
      if (proposal.status === 'ACCEPTED') {
        throw new ConflictException('Proposal already accepted');
      }
      if (proposal.status !== 'PENDING') {
        throw new ConflictException(`Proposal is ${proposal.status}`);
      }

      const offered = await tx.listing.findUnique({
        where: { id: proposal.offeredListingId },
      });
      if (!offered) throw new NotFoundException('Offered listing not found');
      if (target.status !== 'LIVE' || offered.status !== 'LIVE') {
        throw new ConflictException('Both listings must be LIVE to accept');
      }
      if (target.sellingMode !== 'SWAP') {
        throw new BadRequestException('Target listing must be a swap');
      }
      if (offered.sellingMode !== 'SWAP') {
        throw new BadRequestException(
          'Both items must be listed as swaps',
        );
      }

      ListingStateMachine.assertTransition(target.status, 'RESERVED');
      ListingStateMachine.assertTransition(offered.status, 'RESERVED');

      const claimed = await tx.swapProposal.updateMany({
        where: { id: proposalId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Proposal already accepted');
      }

      const otherProposals = await tx.swapProposal.findMany({
        where: {
          listingId: proposal.listingId,
          status: 'PENDING',
          id: { not: proposalId },
        },
        select: { id: true, offeredListingId: true },
      });
      if (otherProposals.length > 0) {
        await tx.swapProposal.updateMany({
          where: { id: { in: otherProposals.map((row) => row.id) } },
          data: { status: 'REJECTED' },
        });
        for (const other of otherProposals) {
          await this.retireInternalOffer(tx, other.offeredListingId);
        }
      }

      await tx.listing.update({
        where: { id: target.id },
        data: {
          status: 'RESERVED',
          quantityAvailable: 0,
          quantityReserved: { increment: 1 },
        },
      });
      await tx.listing.update({
        where: { id: offered.id },
        data: {
          status: 'RESERVED',
          quantityAvailable: 0,
          quantityReserved: { increment: 1 },
        },
      });
      await tx.favourite.deleteMany({
        where: { listingId: { in: [target.id, offered.id] } },
      });
      await tx.listingEvent.create({
        data: {
          listingId: target.id,
          type: 'STATUS_CHANGED',
          actorUserId: sellerId,
          payload: {
            from: 'LIVE',
            to: 'RESERVED',
            reason: 'swap_accepted',
            swapProposalId: proposalId,
          },
        },
      });
      await tx.listingEvent.create({
        data: {
          listingId: offered.id,
          type: 'STATUS_CHANGED',
          actorUserId: sellerId,
          payload: {
            from: 'LIVE',
            to: 'RESERVED',
            reason: 'swap_accepted',
            swapProposalId: proposalId,
          },
        },
      });

      // Offerer receives the listed item. Offeree receives the offered item.
      const offererQuote = quoteSwapParty(target, offered);
      const offereeQuote = quoteSwapParty(offered, target);
      const deliveryDate = deliveryDayFromNote(proposal.note);

      const offererOrder = await this.createSwapLeg(tx, {
        listingId: target.id,
        buyerId: proposal.proposerId,
        sellerId: target.sellerId,
        quote: offererQuote,
        proposalId: proposal.id,
        swapListingAId: target.id,
        swapListingBId: offered.id,
        actorUserId: sellerId,
        deliveryDate,
      });
      const offereeOrder = await this.createSwapLeg(tx, {
        listingId: offered.id,
        buyerId: target.sellerId,
        sellerId: proposal.proposerId,
        quote: offereeQuote,
        proposalId: proposal.id,
        swapListingAId: target.id,
        swapListingBId: offered.id,
        actorUserId: sellerId,
        deliveryDate,
      });

      const updated = await tx.swapProposal.findUniqueOrThrow({
        where: { id: proposalId },
      });

      return {
        proposal: updated,
        offererOrder,
        offereeOrder,
        offererQuote,
        offereeQuote,
      };
    });

    const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;
    const payLine = (quote: PartyQuote) =>
      `The swap was accepted. Open the order and pay ${naira(quote.deliveryFeeKobo)} for delivery plus ${naira(quote.swapFeeKobo)} swap fee.`;
    await this.notifications?.notify({
      userId: result.proposal.proposerId,
      category: NotificationCategory.OFFER_ACCEPTED,
      title: 'Swap accepted',
      body: payLine(result.offererQuote),
      deepLink: `reworth://orders/${result.offererOrder.id}`,
      meta: { orderId: result.offererOrder.id, swapProposalId: proposalId },
    });
    await this.notifications?.notify({
      userId: sellerId,
      category: NotificationCategory.OFFER_ACCEPTED,
      title: 'Swap accepted',
      body: payLine(result.offereeQuote),
      deepLink: `reworth://orders/${result.offereeOrder.id}`,
      meta: { orderId: result.offereeOrder.id, swapProposalId: proposalId },
    });

    if (result.proposal.conversationId && this.prisma.message) {
      const [listed, offeredItem] = await Promise.all([
        this.prisma.listing.findUnique({
          where: { id: result.proposal.listingId },
          include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        }),
        this.prisma.listing.findUnique({
          where: { id: result.proposal.offeredListingId },
          include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        }),
      ]);
      const listedCard = {
        title: listed?.title?.trim() || 'Listed item',
        imageUrl: listed ? imageUrlsFromVariants(listed.images)[0] ?? null : null,
      };
      const offeredCard = {
        title: offeredItem?.title?.trim() || 'Offered item',
        imageUrl: offeredItem
          ? imageUrlsFromVariants(offeredItem.images)[0] ?? null
          : null,
      };
      const body = JSON.stringify({
        kind: 'swap-accepted',
        swapProposalId: proposalId,
        deliveryOn: /^\d{4}-\d{2}-\d{2}$/.test(result.proposal.note ?? '')
          ? result.proposal.note
          : undefined,
        orders: [
          {
            payerId: result.proposal.proposerId,
            orderId: result.offererOrder.id,
            deliveryFeeKobo: result.offererQuote.deliveryFeeKobo,
            swapFeeKobo: result.offererQuote.swapFeeKobo,
            receive: listedCard,
            send: offeredCard,
          },
          {
            payerId: sellerId,
            orderId: result.offereeOrder.id,
            deliveryFeeKobo: result.offereeQuote.deliveryFeeKobo,
            swapFeeKobo: result.offereeQuote.swapFeeKobo,
            receive: offeredCard,
            send: listedCard,
          },
        ],
      });
      const cards = await this.prisma.message.findMany({
        where: {
          conversationId: result.proposal.conversationId,
          type: MessageType.SWAP_PROPOSAL_CARD,
        },
        orderBy: { createdAt: 'asc' },
      });
      const pending = cards.find((card) => {
        try {
          const parsed = JSON.parse(card.body ?? '') as {
            swapProposalId?: string;
            kind?: string;
          };
          return (
            parsed.swapProposalId === proposalId &&
            parsed.kind !== 'swap-accepted'
          );
        } catch {
          return false;
        }
      });
      const saved = pending
        ? await this.prisma.message.update({
            where: { id: pending.id },
            data: { body },
            include: { sender: { include: { profile: true } } },
          })
        : await this.prisma.message.create({
            data: {
              conversationId: result.proposal.conversationId,
              senderId: sellerId,
              type: MessageType.SWAP_PROPOSAL_CARD,
              body,
            },
            include: { sender: { include: { profile: true } } },
          });
      const sentAt = new Date();
      await this.prisma.conversation.update({
        where: { id: result.proposal.conversationId },
        data: { lastMessageAt: sentAt },
      });
      const mapped = toMessageDto(saved);
      this.gateway?.emitToConversation(
        result.proposal.conversationId,
        'message.new',
        mapped,
      );
      this.gateway?.emitToUsers(
        [result.proposal.proposerId, sellerId],
        'inbox.updated',
        {
          conversationId: result.proposal.conversationId,
          lastMessageAt: sentAt.toISOString(),
          preview: 'Swap accepted',
          senderId: sellerId,
        },
      );
    }

    await this.homeCache?.clear();

    return {
      proposal: toSwapProposalDto(result.proposal),
      order: { id: result.offereeOrder.id },
      orders: [
        {
          id: result.offererOrder.id,
          role: 'offerer' as const,
          payerId: result.proposal.proposerId,
          ...result.offererQuote,
        },
        {
          id: result.offereeOrder.id,
          role: 'offeree' as const,
          payerId: sellerId,
          ...result.offereeQuote,
        },
      ],
    };
  }

  async reject(proposalId: string, sellerId: string): Promise<SwapProposalDto> {
    const proposal = await this.prisma.swapProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) throw new NotFoundException('Swap proposal not found');

    const listing = await this.prisma.listing.findUnique({
      where: { id: proposal.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Only the seller can reject');
    }
    if (proposal.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${proposal.status}`);
    }

    const updated = await this.prisma.swapProposal.update({
      where: { id: proposalId },
      data: { status: 'REJECTED' },
    });
    await this.retireInternalOffer(this.prisma, proposal.offeredListingId);
    await this.homeCache?.clear();
    await this.settleProposalCard(
      proposal.conversationId,
      proposalId,
      sellerId,
      [proposal.proposerId, sellerId],
      'swap-rejected',
      'Swap rejected',
    );

    await this.notifications?.notify({
      userId: proposal.proposerId,
      category: NotificationCategory.OFFER_REJECTED,
      title: 'Swap rejected',
      body: 'Your swap proposal was rejected.',
      deepLink: `reworth://listings/${proposal.listingId}`,
      meta: { swapProposalId: proposalId },
    });

    return toSwapProposalDto(updated);
  }

  /**
   * Either person can cancel an unpaid swap.
   * Only the original listing goes back on the marketplace.
   * The other person's proposal was never a listing, so it is removed.
   */
  async cancel(proposalId: string, actorId: string) {
    const proposal = await this.prisma.swapProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) throw new NotFoundException('Swap proposal not found');

    const listing = await this.prisma.listing.findUnique({
      where: { id: proposal.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (actorId !== listing.sellerId && actorId !== proposal.proposerId) {
      throw new ForbiddenException('Not a swap participant');
    }
    if (
      proposal.status !== 'PENDING' &&
      proposal.status !== 'ACCEPTED'
    ) {
      throw new ConflictException(`Proposal is ${proposal.status}`);
    }

    const orders = await this.prisma.order.findMany({
      where: { swapProposalId: proposalId },
    });
    const anyonePaid = orders.some((order) =>
      PAID_ORDER_STATUSES.has(order.status),
    );
    if (anyonePaid) {
      throw new ConflictException(
        'A delivery fee has already been paid, so this swap can no longer be cancelled.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.swapProposal.update({
        where: { id: proposalId },
        data: { status: 'CANCELLED' },
      });
      for (const order of orders) {
        if (
          order.status === 'PAYMENT_PENDING' ||
          order.status === 'CREATED'
        ) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'CANCELLED' },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'CANCELLED',
              actorUserId: actorId,
              payload: { swapProposalId: proposalId },
            },
          });
        }
      }
      await this.retireInternalOffer(tx, proposal.offeredListingId);
      if (proposal.status === 'ACCEPTED') {
        await this.restoreOriginalListing(tx, proposal.listingId);
      }
    });

    if (proposal.conversationId && this.prisma.message?.create) {
      const note =
        proposal.status === 'ACCEPTED'
          ? 'Swap cancelled. The listing is back on the marketplace.'
          : 'Swap cancelled';
      const saved = await this.prisma.message.create({
        data: {
          conversationId: proposal.conversationId,
          senderId: actorId,
          type: MessageType.TEXT,
          body: note,
        },
        include: { sender: { include: { profile: true } } },
      });
      await this.prisma.conversation.update({
        where: { id: proposal.conversationId },
        data: { lastMessageAt: new Date() },
      });
      if (saved && this.gateway) {
        this.gateway.emitToConversation(
          proposal.conversationId,
          'message.new',
          toMessageDto(saved),
        );
      }
    }
    const otherId =
      actorId === proposal.proposerId ? listing.sellerId : proposal.proposerId;
    await this.settleProposalCard(
      proposal.conversationId,
      proposalId,
      actorId,
      [actorId, otherId],
      'swap-cancelled',
      'Swap cancelled',
    );
    await this.notifications?.notify({
      userId: otherId,
      category: NotificationCategory.ORDER_CANCELLED,
      title: 'Swap cancelled',
      body:
        proposal.status === 'ACCEPTED'
          ? 'The other person cancelled the swap. The listing is back on the marketplace.'
          : 'The other person cancelled the swap proposal.',
      deepLink: `reworth://listings/${listing.id}`,
      meta: { swapProposalId: proposalId },
    });
    await this.homeCache?.clear();

    return { id: proposalId, status: 'CANCELLED' as const };
  }

  async counter(
    proposalId: string,
    actorId: string,
    dto: CounterSwapProposalDto,
  ): Promise<SwapProposalDto> {
    const parent = await this.prisma.swapProposal.findUnique({
      where: { id: proposalId },
    });
    if (!parent) throw new NotFoundException('Swap proposal not found');
    if (parent.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${parent.status}`);
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: parent.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (actorId !== listing.sellerId && actorId !== parent.proposerId) {
      throw new ForbiddenException('Not a swap participant');
    }

    const offeredListingId = dto.offeredListingId ?? parent.offeredListingId;

    if (dto.offeredListingId) {
      const offered = await this.prisma.listing.findUnique({
        where: { id: offeredListingId },
      });
      if (!offered) throw new NotFoundException('Offered listing not found');
      // Counter may flip who offers what; offered must stay LIVE and not be target
      if (offered.id === parent.listingId) {
        throw new BadRequestException('Cannot offer the target listing');
      }
      if (offered.status !== 'LIVE') {
        throw new ConflictException('Offered listing is not LIVE');
      }
      if (offered.sellingMode !== 'SWAP') {
        throw new BadRequestException(
          'List your item as a swap, then offer that listing',
        );
      }
    }

    const expiresAt = new Date(
      Date.now() + this.expiryHours() * 60 * 60 * 1000,
    );

    const child = await this.prisma.$transaction(async (tx) => {
      await tx.swapProposal.update({
        where: { id: proposalId },
        data: { status: 'COUNTERED' },
      });
      return tx.swapProposal.create({
        data: {
          listingId: parent.listingId,
          proposerId: parent.proposerId,
          offeredListingId,
          note: dto.note ?? parent.note,
          status: 'PENDING',
          parentProposalId: parent.id,
          conversationId: parent.conversationId,
          expiresAt,
        },
      });
    });

    const notifyUser =
      actorId === parent.proposerId ? listing.sellerId : parent.proposerId;
    await this.notifications?.notify({
      userId: notifyUser,
      category: NotificationCategory.COUNTEROFFER,
      title: 'Swap counter-proposal',
      body: 'A counter swap proposal was made.',
      deepLink: parent.conversationId
        ? `reworth://chats/${parent.conversationId}`
        : `reworth://listings/${parent.listingId}`,
      meta: {
        swapProposalId: child.id,
        parentProposalId: parent.id,
        conversationId: parent.conversationId,
      },
    });

    return toSwapProposalDto(child);
  }

  async withdraw(
    proposalId: string,
    proposerId: string,
  ): Promise<SwapProposalDto> {
    const proposal = await this.prisma.swapProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) throw new NotFoundException('Swap proposal not found');
    if (proposal.proposerId !== proposerId) {
      throw new ForbiddenException('Only the proposer can withdraw');
    }
    if (proposal.status !== 'PENDING') {
      throw new ConflictException(`Proposal is ${proposal.status}`);
    }

    const updated = await this.prisma.swapProposal.update({
      where: { id: proposalId },
      data: { status: 'WITHDRAWN' },
    });
    await this.retireInternalOffer(this.prisma, proposal.offeredListingId);
    await this.homeCache?.clear();
    return toSwapProposalDto(updated);
  }

  async expireDueProposals(now = new Date()): Promise<number> {
    const due = await this.prisma.swapProposal.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      select: { id: true, offeredListingId: true },
    });
    if (due.length === 0) return 0;

    await this.prisma.swapProposal.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    for (const row of due) {
      await this.retireInternalOffer(this.prisma, row.offeredListingId);
    }
    await this.homeCache?.clear();
    return due.length;
  }

  /** Rewrite the chat card so Accept, Reject, and Cancel disappear for both people. */
  private async settleProposalCard(
    conversationId: string | null,
    proposalId: string,
    actorId: string,
    recipients: string[],
    kind: 'swap-rejected' | 'swap-cancelled',
    preview: string,
  ) {
    if (!conversationId || !this.prisma.message?.findMany || !this.prisma.message.update) {
      return;
    }
    const cards = await this.prisma.message.findMany({
      where: {
        conversationId,
        type: MessageType.SWAP_PROPOSAL_CARD,
      },
      orderBy: { createdAt: 'asc' },
    });
    const card = cards.find((row) => {
      try {
        const parsed = JSON.parse(row.body ?? '') as { swapProposalId?: string };
        return parsed.swapProposalId === proposalId;
      } catch {
        return false;
      }
    });
    if (!card) return;
    let previous: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(card.body ?? '') as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') previous = parsed;
    } catch {
      previous = {};
    }
    const saved = await this.prisma.message.update({
      where: { id: card.id },
      data: {
        body: JSON.stringify({
          ...previous,
          kind,
          swapProposalId: proposalId,
        }),
      },
      include: { sender: { include: { profile: true } } },
    });
    const sentAt = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sentAt },
    });
    const mapped = toMessageDto(saved);
    this.gateway?.emitToConversation(conversationId, 'message.new', mapped);
    this.gateway?.emitToUsers(
      recipients,
      'inbox.updated',
      {
        conversationId,
        lastMessageAt: sentAt.toISOString(),
        preview,
        senderId: actorId,
      },
    );
  }

  /**
   * The proposer's item is an internal offer, not a marketplace listing.
   * Cancel, reject, withdraw, and expiry remove it. They never publish it.
   */
  private async retireInternalOffer(
    db: Prisma.TransactionClient | PrismaService,
    listingId: string,
  ) {
    const row = await db.listing.findUnique({ where: { id: listingId } });
    if (!row || row.status === 'REMOVED' || row.status === 'SOLD') return;
    const flags = Array.isArray(row.riskFlags) ? row.riskFlags : [];
    if (!flags.includes('swap-response')) return;
    await db.listing.update({
      where: { id: listingId },
      data: {
        status: 'REMOVED',
        quantityAvailable: 0,
        quantityReserved: 0,
      },
    });
  }

  /** Only the listing that was actually on the marketplace comes back. */
  private async restoreOriginalListing(
    db: Prisma.TransactionClient | PrismaService,
    listingId: string,
  ) {
    const row = await db.listing.findUnique({ where: { id: listingId } });
    if (!row) return;
    const flags = Array.isArray(row.riskFlags) ? row.riskFlags : [];
    if (flags.includes('swap-response')) return;
    if (row.status !== 'RESERVED' && row.status !== 'LIVE') return;
    await db.listing.update({
      where: { id: listingId },
      data: {
        status: 'LIVE',
        quantityAvailable: 1,
        quantityReserved: 0,
      },
    });
  }
}
