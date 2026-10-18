import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MessageType, NotificationChannel } from '@prisma/client';
import { AdminAlertsService } from '../admin/admin-alerts.service';
import { REPORTS } from '../admin/admin-roles';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { ChatScanProcessor } from './chat-scan.processor';
import { NotificationStub } from './notification.stub';
import { toMessageDto, type MessageDto } from './message.mapper';
import { redactPhoneEmail } from './pii.util';
import type { PostMeetupPinDto, PostMessageDto } from './dto/chat.dto';
import { encodeMeetupPin, meetupPinPreview } from './meetup-pin';

function swapKindForStatus(status: string): string | null {
  switch (status) {
    case 'ACCEPTED':
      return 'swap-accepted';
    case 'REJECTED':
      return 'swap-rejected';
    case 'CANCELLED':
    case 'WITHDRAWN':
    case 'EXPIRED':
    case 'COUNTERED':
      return 'swap-cancelled';
    default:
      return null;
  }
}

function applySwapCardKind<T extends { type: string; body: string | null }>(
  row: T,
  kinds: Map<string, string>,
): T {
  if (row.type !== 'SWAP_PROPOSAL_CARD' || !row.body) return row;
  try {
    const parsed = JSON.parse(row.body) as {
      swapProposalId?: string;
      kind?: string;
    };
    const id = parsed.swapProposalId;
    if (!id) return row;
    const kind = kinds.get(id);
    if (!kind || parsed.kind === kind) return row;
    return { ...row, body: JSON.stringify({ ...parsed, kind }) };
  } catch {
    return row;
  }
}

/** Inbox line the other person sees. Never include ids or raw card JSON. */
export function chatPreview(
  type: string | null | undefined,
  body: string | null | undefined,
): string | null {
  const trimmed = body?.trim() ?? '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    if (/swap-accepted/i.test(trimmed)) return 'Swap accepted';
    if (/swap-rejected/i.test(trimmed)) return 'Swap rejected';
    if (/swap-cancelled/i.test(trimmed)) return 'Swap cancelled';
    if (/swapProposalId/i.test(trimmed) || type === 'SWAP_PROPOSAL_CARD') {
      return 'Swap proposal';
    }
    if (/offerId/i.test(trimmed) || type === 'OFFER_CARD') return 'Offer';
    if (type === 'LISTING_CARD') return 'Listing';
    return 'New message';
  }
  if (type === 'SWAP_PROPOSAL_CARD') return 'Swap proposal';
  if (type === 'OFFER_CARD') return 'Offer';
  if (type === 'LISTING_CARD') return 'Listing';
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

export type ConversationListItem = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingThumb: string | null;
  buyerId: string;
  sellerId: string;
  counterpart: { id: string; displayName: string };
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  /** Viewer muted counterpart for this thread — suppress push/badge. */
  muted: boolean;
  /** Viewer blocked the counterpart. They can unblock from this chat. */
  blockedByMe: boolean;
  activeOffer: {
    id: string;
    amountKobo: number;
    status: string;
  } | null;
  /** Messages at or before this time are hidden for the viewer. */
  deletedAt: Date | null;
  createdAt: Date;
};

/** True when this viewer deleted the chat and nothing newer has arrived. */
export function conversationHiddenFromViewer(
  deletedAt: Date | null | undefined,
  lastMessageAt: Date | null | undefined,
): boolean {
  if (!deletedAt) return false;
  if (!lastMessageAt) return true;
  return lastMessageAt.getTime() <= deletedAt.getTime();
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scanProcessor: ChatScanProcessor,
    private readonly notifications: NotificationStub,
    @Optional() private readonly gateway?: ChatGateway,
    @Optional() private readonly alerts?: AdminAlertsService,
    @Optional() private readonly inbox?: NotificationsService,
  ) {}

  private async assertNotSuspended(userIds: string[]): Promise<void> {
    const suspended = await this.prisma.user.findFirst({
      where: { id: { in: userIds }, status: 'SUSPENDED' },
      select: { id: true },
    });
    if (suspended) {
      throw new ForbiddenException('Cannot message this user');
    }
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return !!block;
  }

  /** True when muter muted mutedId (optionally scoped to conversation). */
  async isMuted(
    muterId: string,
    mutedId: string,
    conversationId?: string,
  ): Promise<boolean> {
    const row = await this.prisma.userMute.findFirst({
      where: {
        muterId,
        mutedId,
        OR: [
          { conversationId: null },
          ...(conversationId ? [{ conversationId }] : []),
        ],
      },
    });
    return !!row;
  }

  async listConversations(userId: string): Promise<ConversationListItem[]> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        listing: {
          include: {
            images: {
              where: { status: 'READY' },
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
          },
        },
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        offers: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const result: ConversationListItem[] = [];
    for (const c of rows) {
      if (c.buyer.status === 'SUSPENDED' || c.seller.status === 'SUSPENDED') {
        continue;
      }

      const counterpart =
        c.buyerId === userId
          ? {
              id: c.seller.id,
              displayName: c.seller.profile?.displayName ?? 'Seller',
            }
          : {
              id: c.buyer.id,
              displayName: c.buyer.profile?.displayName ?? 'Buyer',
            };

      const deletedAt =
        c.buyerId === userId ? c.buyerDeletedAt : c.sellerDeletedAt;
      if (conversationHiddenFromViewer(deletedAt, c.lastMessageAt)) {
        continue;
      }

      const muted = await this.isMuted(userId, counterpart.id, c.id);
      const blockedByMe = !!(await this.prisma.userBlock.findFirst({
        where: { blockerId: userId, blockedId: counterpart.id },
      }));

      const unreadCount = muted
        ? 0
        : await this.prisma.message.count({
            where: {
              conversationId: c.id,
              senderId: { not: userId },
              readAt: null,
              ...(deletedAt ? { createdAt: { gt: deletedAt } } : {}),
            },
          });

      const thumb = c.listing.images[0];
      const variants = (thumb?.variants ?? {}) as Record<string, string>;
      const latest = c.messages[0];
      const last =
        latest && (!deletedAt || latest.createdAt > deletedAt) ? latest : null;
      const offer = c.offers[0];
      const visibleOffer =
        offer && (!deletedAt || offer.createdAt > deletedAt) ? offer : null;

      result.push({
        id: c.id,
        listingId: c.listingId,
        listingTitle: c.listing.title,
        listingThumb: variants.thumb ?? variants.card ?? thumb?.originalKey ?? null,
        buyerId: c.buyerId,
        sellerId: c.sellerId,
        counterpart,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: last
          ? meetupPinPreview(last.body) ??
            (last.body ? last.body.slice(0, 120) : `[${last.type}]`)
          : null,
        unreadCount,
        muted,
        blockedByMe,
        activeOffer: visibleOffer
          ? {
              id: visibleOffer.id,
              amountKobo: visibleOffer.amountKobo,
              status: visibleOffer.status,
            }
          : null,
        deletedAt,
        createdAt: c.createdAt,
      });
    }
    return result;
  }

  async createOrGetConversation(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'LIVE' && listing.status !== 'RESERVED') {
      throw new NotFoundException('Listing not found');
    }
    if (listing.sellerId === userId) {
      throw new ForbiddenException('Cannot start a conversation with yourself');
    }

    if (await this.isBlockedEitherWay(userId, listing.sellerId)) {
      throw new ForbiddenException('Cannot message this user');
    }
    await this.assertNotSuspended([listing.sellerId]);

    const existing = await this.prisma.conversation.findUnique({
      where: {
        listingId_buyerId_sellerId: {
          listingId,
          buyerId: userId,
          sellerId: listing.sellerId,
        },
      },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        listingId,
        buyerId: userId,
        sellerId: listing.sellerId,
      },
    });
  }

  async requireParticipant(conversationId: string, userId: string) {
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!c) throw new NotFoundException('Conversation not found');
    if (c.buyerId !== userId && c.sellerId !== userId) {
      throw new ForbiddenException('Not a conversation participant');
    }
    return c;
  }

  /** Hide the chat for this participant. The other person keeps their copy. */
  async deleteForViewer(conversationId: string, userId: string) {
    const conversation = await this.requireParticipant(conversationId, userId);
    const deletedAt = new Date();
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data:
        conversation.buyerId === userId
          ? { buyerDeletedAt: deletedAt }
          : { sellerDeletedAt: deletedAt },
    });
    return { ok: true as const, deletedAt };
  }

  async listMessages(
    conversationId: string,
    userId: string,
    opts: { after?: string; limit?: number },
  ): Promise<MessageDto[]> {
    const conversation = await this.requireParticipant(conversationId, userId);
    await this.assertNotSuspended([
      conversation.buyerId,
      conversation.sellerId,
    ]);
    const limit = Math.min(opts.limit ?? 50, 100);
    const deletedAt =
      conversation.buyerId === userId
        ? conversation.buyerDeletedAt
        : conversation.sellerDeletedAt;

    let afterCreatedAt: Date | undefined = deletedAt ?? undefined;
    if (opts.after) {
      const afterMsg = await this.prisma.message.findUnique({
        where: { id: opts.after },
      });
      if (
        afterMsg &&
        (!afterCreatedAt || afterMsg.createdAt > afterCreatedAt)
      ) {
        afterCreatedAt = afterMsg.createdAt;
      }
    }

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(afterCreatedAt ? { createdAt: { gt: afterCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        sender: { include: { profile: true } },
      },
    });

    // Polling / reconnect resync also acts as delivery receipt.
    await this.markDelivered(conversationId, userId);

    const settled = await this.swapCardKinds(rows);
    return rows.map((row) => toMessageDto(applySwapCardKind(row, settled)));
  }

  async postMessage(
    conversationId: string,
    userId: string,
    dto: PostMessageDto,
  ): Promise<MessageDto> {
    const conversation = await this.requireParticipant(conversationId, userId);
    const counterpartId =
      conversation.buyerId === userId
        ? conversation.sellerId
        : conversation.buyerId;

    if (await this.isBlockedEitherWay(userId, counterpartId)) {
      throw new ForbiddenException('Cannot message this user');
    }
    await this.assertNotSuspended([userId, counterpartId]);

    if (dto.clientMsgId) {
      const existing = await this.prisma.message.findUnique({
        where: {
          conversationId_clientMsgId: {
            conversationId,
            clientMsgId: dto.clientMsgId,
          },
        },
        include: { sender: { include: { profile: true } } },
      });
      if (existing) return toMessageDto(existing);
    }

    const scrubbed = dto.body != null ? redactPhoneEmail(dto.body) : null;
    const type = dto.type ?? MessageType.TEXT;

    const created = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        type,
        body: scrubbed,
        imageKey: dto.imageKey,
        listingCardId: dto.listingCardId,
        clientMsgId: dto.clientMsgId,
      },
      include: { sender: { include: { profile: true } } },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt },
    });

    const { scamWarning } = await this.scanProcessor.processMessage({
      messageId: created.id,
      body: scrubbed,
      userId,
      listingId: conversation.listingId,
    });

    const message = scamWarning
      ? { ...created, scamWarning: true }
      : created;

    const mapped = toMessageDto(message);
    this.gateway?.emitToConversation(conversationId, 'message.new', mapped);

    const recipientMuted = await this.isMuted(
      counterpartId,
      userId,
      conversationId,
    );
    if (!recipientMuted) {
      this.notifications.log('message.new', {
        conversationId,
        messageId: mapped.id,
        recipientId: counterpartId,
        senderId: userId,
      });
      await this.alertNewMessage(counterpartId, mapped).catch(() => undefined);
    }

    this.gateway?.emitToUsers(
      [conversation.buyerId, conversation.sellerId],
      'inbox.updated',
      {
        conversationId,
        lastMessageAt: created.createdAt.toISOString(),
        preview: chatPreview(mapped.type, mapped.body),
        senderId: userId,
      },
    );

    if (userId === conversation.sellerId) {
      void this.trackSellerFirstReply(conversation, userId, created.createdAt);
    }

    return mapped;
  }

  /** ADR-011 Phase C — share private meetup coordinates in-thread only. */
  async postMeetupPin(
    conversationId: string,
    userId: string,
    dto: PostMeetupPinDto,
  ): Promise<MessageDto> {
    return this.postMessage(conversationId, userId, {
      type: MessageType.SYSTEM,
      body: encodeMeetupPin({
        lat: dto.lat,
        lng: dto.lng,
        label: dto.label,
      }),
      clientMsgId: dto.clientMsgId,
    });
  }

  /**
   * Persist first seller reply latency for trust median response time.
   */
  private async trackSellerFirstReply(
    conversation: { id: string; buyerId: string; sellerId: string },
    sellerId: string,
    replyAt: Date,
  ): Promise<void> {
    if (conversation.sellerId !== sellerId) return;

    const existing = await this.prisma.chatResponseSample.findUnique({
      where: { conversationId: conversation.id },
    });
    if (existing) return;

    const firstBuyerMsg = await this.prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        senderId: conversation.buyerId,
        createdAt: { lt: replyAt },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!firstBuyerMsg) return;

    const latencyMinutes =
      (replyAt.getTime() - firstBuyerMsg.createdAt.getTime()) / 60_000;

    try {
      await this.prisma.chatResponseSample.create({
        data: {
          conversationId: conversation.id,
          sellerId,
          buyerMessageAt: firstBuyerMsg.createdAt,
          firstReplyAt: replyAt,
          latencyMinutes,
        },
      });
    } catch {
      // Unique race — another request already recorded the sample.
    }
  }

  async markRead(
    conversationId: string,
    userId: string,
    messageIds?: string[],
  ) {
    await this.requireParticipant(conversationId, userId);
    const now = new Date();
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
        ...(messageIds?.length ? { id: { in: messageIds } } : {}),
      },
      data: { readAt: now },
    });
    if (this.inbox) {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          category: NotificationCategory.NEW_MESSAGE,
          channel: NotificationChannel.IN_APP,
          readAt: null,
          deepLink: `reworth://chats/${conversationId}`,
        },
        data: { readAt: now },
      });
    }
    this.gateway?.emitToConversation(conversationId, 'message.read', {
      conversationId,
      readerId: userId,
      readAt: now,
    });
    return { ok: true };
  }

  /**
   * Delivery receipts — set deliveredAt on inbound messages missing it.
   * Called on poll/resync and explicit POST /delivered.
   */
  async markDelivered(
    conversationId: string,
    userId: string,
    messageIds?: string[],
  ) {
    await this.requireParticipant(conversationId, userId);
    const now = new Date();
    const result = await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        deliveredAt: null,
        ...(messageIds?.length ? { id: { in: messageIds } } : {}),
      },
      data: { deliveredAt: now },
    });
    if (result.count > 0) {
      this.gateway?.emitToConversation(conversationId, 'message.delivered', {
        conversationId,
        recipientId: userId,
        deliveredAt: now,
        count: result.count,
      });
    }
    return { ok: true, count: result.count };
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new ForbiddenException('Cannot block yourself');
    }
    return this.prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      create: { blockerId, blockedId },
      update: {},
    });
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });
    return { ok: true };
  }

  async reportUser(
    reporterId: string,
    reportedUserId: string,
    dto: { reason: string; detail?: string; conversationId?: string },
  ) {
    if (reporterId === reportedUserId) {
      throw new ForbiddenException('Cannot report yourself');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: reportedUserId },
    });
    if (!user) throw new NotFoundException('User not found');

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        reportedUserId,
        reason: dto.reason,
        detail: dto.detail,
        conversationId: dto.conversationId,
        status: 'OPEN',
      },
    });
    await this.alerts?.notify({
      roles: REPORTS,
      kind: 'REPORT',
      title: 'User reported',
      body: `A user was reported: ${dto.reason}`,
      href: '/reports',
      entityType: 'Report',
      entityId: report.id,
    });
    return report;
  }

  async muteConversation(
    conversationId: string,
    muterId: string,
    mutedId?: string,
  ) {
    const c = await this.requireParticipant(conversationId, muterId);
    const target =
      mutedId ?? (c.buyerId === muterId ? c.sellerId : c.buyerId);
    const existing = await this.prisma.userMute.findFirst({
      where: { muterId, mutedId: target, conversationId },
    });
    if (existing) return existing;
    return this.prisma.userMute.create({
      data: {
        muterId,
        mutedId: target,
        conversationId,
      },
    });
  }

  async unmuteConversation(conversationId: string, muterId: string) {
    await this.requireParticipant(conversationId, muterId);
    await this.prisma.userMute.deleteMany({
      where: { muterId, conversationId },
    });
    return { ok: true };
  }

  /**
   * One unread in-app alert per conversation. A later message refreshes
   * that row until the recipient opens the chat.
   */
  private async alertNewMessage(
    recipientId: string,
    message: MessageDto,
  ): Promise<void> {
    if (!this.inbox) return;
    const deepLink = `reworth://chats/${message.conversationId}`;
    const senderName = message.sender?.displayName?.trim() || 'Someone';
    const title = `New message from ${senderName}`;
    const body =
      chatPreview(message.type, message.body) ??
      (message.imageKey
        ? 'Sent a photo'
        : message.listingCardId
          ? 'Sent a listing'
          : 'Sent a message');
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: recipientId,
        category: NotificationCategory.NEW_MESSAGE,
        channel: NotificationChannel.IN_APP,
        readAt: null,
        deepLink,
      },
    });
    if (existing) {
      await this.prisma.notification.update({
        where: { id: existing.id },
        data: { title, body, createdAt: new Date() },
      });
      return;
    }
    await this.inbox.notify({
      userId: recipientId,
      category: NotificationCategory.NEW_MESSAGE,
      title,
      body,
      deepLink,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      meta: { conversationId: message.conversationId, messageId: message.id },
    });
  }

  /** Pending cards follow the proposal. A response removes the action buttons. */
  private async swapCardKinds(
    rows: { type: string; body: string | null }[],
  ): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.type !== 'SWAP_PROPOSAL_CARD' || !row.body) continue;
      try {
        const parsed = JSON.parse(row.body) as { swapProposalId?: string };
        if (parsed.swapProposalId) ids.add(parsed.swapProposalId);
      } catch {
        /* leave the card as stored */
      }
    }
    const kinds = new Map<string, string>();
    if (ids.size === 0 || !this.prisma.swapProposal?.findMany) return kinds;
    const proposals = await this.prisma.swapProposal.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, status: true },
    });
    for (const proposal of proposals) {
      const kind = swapKindForStatus(proposal.status);
      if (kind) kinds.set(proposal.id, kind);
    }
    return kinds;
  }
}
