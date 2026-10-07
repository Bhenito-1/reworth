import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AdminRole,
  CommunityMembershipStatus,
  CommunityPrivacy,
  CommunityType,
  ListingStatus,
  NotificationChannel,
  Prisma,
  SupportTicketStatus,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import {
  buildEscrowSnapshot,
  buildOrderLifecycle,
  orderStatusLabel,
} from '@reworth/shared';
import { AuthService } from '../auth/auth.service';
import { SUSPENSION_APPEAL_EMAIL } from '../auth/suspended-account';
import { HomeCache } from '../home/home.cache';
import { AuditService } from '../audit/audit.service';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { ListingStateMachine } from '../listings/listing-state.machine';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { FRAUD } from './admin-roles';
import { AdminAlertsService } from './admin-alerts.service';

const SUSPENSION_HOLD = 'SUSPENSION_HOLD';
const PAID_OPEN_STATUSES = [
  'FUNDED',
  'IN_AUTHENTICATION',
  'SHIPPED',
  'HANDED_OVER',
  'DELIVERED',
  'RECEIVED',
  'DISPUTE_HOLD',
  'REFUND_REQUESTED',
] as const;
import type {
  AdminAppealResolveDto,
  AdminExtendExpiryDto,
  AdminFeatureListingDto,
  AdminHeroBannerDto,
  AdminPatchCommunityDto,
  AdminPromotionCreateDto,
  AdminRefundDto,
  AdminRejectListingDto,
  AdminRejectVerificationDto,
  AdminReportActionDto,
  AdminSupportNoteDto,
  AdminSupportPatchDto,
  AdminSupportRespondDto,
  AdminWhitelistDto,
} from './dto/admin-ops.dto';

@Injectable()
export class AdminPortalService {
  private readonly logger = new Logger(AdminPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly moderation: ModerationService,
    @Inject(PAYMENT_PROVIDER) private readonly psp: PaymentProvider,
    @Optional() private readonly alerts?: AdminAlertsService,
    @Optional() private readonly homeCache?: HomeCache,
  ) {}

  // ── Users ──────────────────────────────────────────────────────────

  async listUsers(q?: string, community?: string, cursor?: string) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              {
                profile: {
                  displayName: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(community
        ? { profile: { preferredCommunity: community } }
        : {}),
    };
    const take = 50;
    const rows = await this.prisma.user.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { profile: true, roles: true },
    });
    const nextCursor = rows.length > take ? rows[take - 1]!.id : null;
    return {
      items: rows.slice(0, take).map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        status: u.status,
        displayName: u.profile?.displayName ?? null,
        community: u.profile?.preferredCommunity ?? null,
        roles: u.roles.map((r) => r.role),
        createdAt: u.createdAt,
      })),
      nextCursor,
    };
  }

  async exportUsersCsv() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { profile: true, roles: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const header = 'id,email,phone,status,displayName,community,roles,createdAt';
    const lines = users.map((u) =>
      [
        u.id,
        u.email ?? '',
        u.phone ?? '',
        u.status,
        JSON.stringify(u.profile?.displayName ?? ''),
        u.profile?.preferredCommunity ?? '',
        u.roles.map((r) => r.role).join('|'),
        u.createdAt.toISOString(),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  async suspendUser(
    actor: AuthUser,
    userId: string,
    reason: string | undefined,
    ip?: string,
  ) {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 3) {
      throw new BadRequestException('A reason is required');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === UserStatus.SUSPENDED) {
      throw new ConflictException('User is already suspended');
    }
    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException('User cannot be suspended');
    }
    const before = { status: user.status };

    const [unpaid, paidCount] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: { in: ['CREATED', 'PAYMENT_PENDING'] },
          payments: { none: { status: 'SUCCESS' } },
        },
        select: {
          id: true,
          listingId: true,
          quantity: true,
          inventoryCommitted: true,
          buyerId: true,
          sellerId: true,
        },
      }),
      this.prisma.order.count({
        where: {
          AND: [
            { OR: [{ buyerId: userId }, { sellerId: userId }] },
            {
              OR: [
                { status: { in: [...PAID_OPEN_STATUSES] } },
                {
                  status: { in: ['CREATED', 'PAYMENT_PENDING'] },
                  payments: { some: { status: 'SUCCESS' } },
                },
              ],
            },
          ],
        },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await this.releaseUnpaidStock(tx, unpaid);
      if (unpaid.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: unpaid.map((order) => order.id) } },
          data: { status: 'CANCELLED' },
        });
        await tx.orderEvent.createMany({
          data: unpaid.map((order) => ({
            orderId: order.id,
            type: 'CANCELLED' as const,
            actorUserId: actor.id,
            payload: { reason: 'unpaid_account_hold' },
          })),
        });
      }
      const liveListings = await tx.listing.findMany({
        where: {
          sellerId: userId,
          status: { in: [ListingStatus.LIVE, ListingStatus.RESERVED] },
        },
        select: { id: true, riskFlags: true },
      });
      for (const listing of liveListings) {
        const riskFlags = listing.riskFlags.includes(SUSPENSION_HOLD)
          ? listing.riskFlags
          : [...listing.riskFlags, SUSPENSION_HOLD];
        await tx.listing.update({
          where: { id: listing.id },
          data: { status: ListingStatus.REMOVED, riskFlags },
        });
      }
      await tx.cartItem.deleteMany({
        where: { listing: { sellerId: userId } },
      });
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.SUSPENDED },
      });
    });

    await this.homeCache?.clear();
    await this.auth.revokeAllRefreshTokens(userId);
    try {
      await this.notifications.notify({
        userId,
        category: NotificationCategory.VERIFICATION_UPDATE,
        title: 'Account suspended',
        body: [
          'Your ReWorth account has been suspended. You will not be able to sign in.',
          `Reason for suspension: ${trimmed}`,
          `To ask for this suspension to be lifted, email the ReWorth team at ${SUSPENSION_APPEAL_EMAIL}.`,
        ].join('\n\n'),
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        forceDelivery: true,
      });
    } catch (err) {
      this.logger.warn(`Suspension email failed for ${userId}: ${(err as Error).message}`);
    }
    await this.notifyUnpaidCounterparties(userId, unpaid);
    if (paidCount > 0) {
      await this.alerts?.notify({
        roles: FRAUD,
        kind: 'RISK',
        title: 'Suspended account has paid orders',
        body: `${paidCount} paid order(s) still need an admin to handle them in person.`,
        href: '/orders',
        entityType: 'User',
        entityId: userId,
      });
    }
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'USER_SUSPENDED',
      entityType: 'User',
      entityId: userId,
      beforeJson: before,
      afterJson: {
        status: UserStatus.SUSPENDED,
        reason: trimmed,
        unpaidCancelled: unpaid.length,
        paidOpen: paidCount,
      },
      ip: ip ?? null,
    });
    return { ok: true, userId, status: UserStatus.SUSPENDED };
  }

  async unsuspendUser(
    actor: AuthUser,
    userId: string,
    reason?: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === UserStatus.SUSPENDED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "listings"
            SET "status" = CASE
                  WHEN "quantityAvailable" > 0 THEN 'LIVE'::"ListingStatus"
                  WHEN "quantityReserved" > 0 THEN 'RESERVED'::"ListingStatus"
                  WHEN "quantitySold" > 0 THEN 'SOLD'::"ListingStatus"
                  ELSE 'LIVE'::"ListingStatus"
                END,
                "riskFlags" = array_remove("riskFlags", ${SUSPENSION_HOLD}),
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "sellerId" = ${userId}::uuid
              AND ${SUSPENSION_HOLD} = ANY("riskFlags")
          `,
        );
        await tx.user.update({
          where: { id: userId },
          data: { status: UserStatus.ACTIVE },
        });
      });
      await this.homeCache?.clear();
    }
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'USER_UNSUSPENDED',
      entityType: 'User',
      entityId: userId,
      afterJson: reason?.trim() ? { reason: reason.trim() } : undefined,
      ip: ip ?? null,
    });
    return { ok: true, userId, status: UserStatus.ACTIVE };
  }

  private async releaseUnpaidStock(
    tx: Prisma.TransactionClient,
    unpaid: {
      listingId: string;
      quantity: number;
      inventoryCommitted: boolean;
    }[],
  ) {
    const byListing = new Map<string, number>();
    for (const order of unpaid) {
      if (order.inventoryCommitted) continue;
      const qty = order.quantity ?? 1;
      byListing.set(order.listingId, (byListing.get(order.listingId) ?? 0) + qty);
    }
    if (byListing.size === 0) return;
    const listings = await tx.listing.findMany({
      where: { id: { in: [...byListing.keys()] } },
      select: { id: true, quantityTotal: true, quantityReserved: true },
    });
    for (const listing of listings) {
      if (typeof listing.quantityTotal !== 'number') continue;
      const wanted = byListing.get(listing.id) ?? 0;
      const qty = Math.min(wanted, listing.quantityReserved ?? 0);
      if (qty <= 0) continue;
      await tx.listing.updateMany({
        where: { id: listing.id, quantityReserved: { gte: qty } },
        data: {
          quantityReserved: { decrement: qty },
          quantityAvailable: { increment: qty },
        },
      });
    }
  }

  private async notifyUnpaidCounterparties(
    userId: string,
    unpaid: { buyerId: string; sellerId: string }[],
  ) {
    const counts = new Map<string, number>();
    for (const order of unpaid) {
      const other = order.buyerId === userId ? order.sellerId : order.buyerId;
      if (other === userId) continue;
      counts.set(other, (counts.get(other) ?? 0) + 1);
    }
    await Promise.all(
      [...counts.entries()].map(([otherId, count]) =>
        this.notifications.notify({
          userId: otherId,
          category: NotificationCategory.ORDER_CANCELLED,
          title: 'Order cancelled',
          body:
            count === 1
              ? 'An order was cancelled before payment.'
              : `${count} orders were cancelled before payment.`,
        }),
      ),
    );
  }

  async resetVerification(actor: AuthUser, userId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.verification.updateMany({
      where: { userId, level: 'L3_IDENTITY' },
      data: {
        status: VerificationStatus.PENDING,
        verifiedAt: null,
        rejectionReason: null,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'USER_VERIFICATION_RESET',
      entityType: 'User',
      entityId: userId,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  async whitelistUser(
    actor: AuthUser,
    userId: string,
    dto: AdminWhitelistDto,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const entry = await this.prisma.whitelistEntry.create({
      data: {
        userId,
        reason: dto.reason,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'USER_WHITELISTED',
      entityType: 'WhitelistEntry',
      entityId: entry.id,
      afterJson: { userId, reason: dto.reason },
      ip: ip ?? null,
    });
    return entry;
  }

  // ── Listings ───────────────────────────────────────────────────────

  async listListings(status?: string, flag?: string) {
    const where: Prisma.ListingWhereInput = {
      ...(status ? { status: status as ListingStatus } : {}),
      ...(flag ? { riskFlags: { has: flag } } : {}),
    };
    const items = await this.prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        seller: { include: { profile: true } },
        category: true,
        listingModerations: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
        },
      },
    });
    return {
      items: items.map((l) => {
        const mod = l.listingModerations[0] ?? null;
        return {
          id: l.id,
          title: l.title,
          status: l.status,
          priceKobo: l.priceKobo,
          community: l.community,
          riskFlags: l.riskFlags,
          sellerId: l.sellerId,
          sellerName: l.seller.profile?.displayName ?? null,
          category: l.category?.name ?? null,
          createdAt: l.createdAt,
          expiresAt: l.expiresAt,
          moderationDecision: mod?.decision ?? null,
          imageScore: mod?.imageScore ?? null,
          riskScore: mod?.riskScore ?? null,
        };
      }),
    };
  }

  async getListingDetail(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        seller: {
          include: {
            profile: true,
            verifications: true,
          },
        },
        category: true,
        subcategory: true,
        images: { orderBy: { sortOrder: 'asc' } },
        listingModerations: { orderBy: { assessedAt: 'desc' }, take: 10 },
        moderationDecisions: { orderBy: { createdAt: 'desc' }, take: 20 },
        riskAssessments: { orderBy: { createdAt: 'desc' }, take: 10 },
        reports: { orderBy: { createdAt: 'desc' }, take: 10 },
        estateCommunity: true,
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const latestModeration = listing.listingModerations[0] ?? null;

    return {
      listing: {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        status: listing.status,
        priceKobo: listing.priceKobo,
        condition: listing.condition,
        brand: listing.brand,
        model: listing.model,
        sellingMode: listing.sellingMode,
        community: listing.community,
        city: listing.city,
        riskFlags: listing.riskFlags,
        fulfilmentPickup: listing.fulfilmentPickup,
        fulfilmentMeet: listing.fulfilmentMeet,
        fulfilmentDelivery: listing.fulfilmentDelivery,
        publishedAt: listing.publishedAt,
        expiresAt: listing.expiresAt,
        createdAt: listing.createdAt,
        category: listing.category,
        subcategory: listing.subcategory,
        estateCommunity: listing.estateCommunity,
        seller: {
          id: listing.seller.id,
          email: listing.seller.email,
          phone: listing.seller.phone,
          displayName: listing.seller.profile?.displayName ?? null,
          riskScore: listing.seller.riskScore,
          verifications: listing.seller.verifications.map((v) => ({
            level: v.level,
            status: v.status,
          })),
        },
        images: listing.images.map((img) => ({
          id: img.id,
          sortOrder: img.sortOrder,
          status: img.status,
          originalKey: img.originalKey,
          mime: img.mime,
          sizeBytes: img.sizeBytes,
          width: img.width,
          height: img.height,
          variants: img.variants,
        })),
      },
      latestModeration,
      moderationHistory: listing.listingModerations,
      moderationDecisions: listing.moderationDecisions,
      riskAssessments: listing.riskAssessments,
      reports: listing.reports,
    };
  }

  async approveListing(
    actor: AuthUser,
    id: string,
    dto: { note?: string },
    ip?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (
      listing.status !== ListingStatus.UNDER_REVIEW &&
      listing.status !== ListingStatus.REMOVED
    ) {
      throw new BadRequestException(
        'Only a listing under review or removed from the marketplace can be approved',
      );
    }
    ListingStateMachine.assertTransition(listing.status, ListingStatus.LIVE);
    const restored = listing.status === ListingStatus.REMOVED;
    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.LIVE,
        publishedAt: listing.publishedAt ?? new Date(),
      },
    });
    const note = dto.note?.trim();
    await this.moderation.recordAdminDecision({
      listingId: id,
      decision: 'PASS',
      actorUserId: actor.id,
      reason: note || 'Admin approved',
    });
    await this.notifications.notify({
      userId: listing.sellerId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: restored ? 'Listing restored' : 'Listing approved',
      body: restored
        ? note
          ? `"${listing.title}" is back on ReWorth. ${note}`
          : `"${listing.title}" is back on the marketplace.`
        : note
          ? `"${listing.title}" is now live. ${note}`
          : `"${listing.title}" is now live on ReWorth.`,
      deepLink: '/selling',
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'LISTING_APPROVED',
      entityType: 'Listing',
      entityId: id,
      beforeJson: { status: listing.status },
      afterJson: { status: updated.status },
      ip: ip ?? null,
    });
    return { ok: true, id, status: updated.status };
  }

  async rejectListing(
    actor: AuthUser,
    id: string,
    dto: AdminRejectListingDto,
    ip?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (
      listing.status !== ListingStatus.UNDER_REVIEW &&
      listing.status !== ListingStatus.REMOVED
    ) {
      throw new BadRequestException(
        'Only a listing under review or removed from the marketplace can be rejected',
      );
    }
    ListingStateMachine.assertTransition(listing.status, ListingStatus.REJECTED);
    const updated = await this.prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.REJECTED },
    });
    await this.moderation.recordAdminDecision({
      listingId: id,
      decision: 'REJECTED',
      actorUserId: actor.id,
      reason: dto.reason,
    });
    await this.notifications.notify({
      userId: listing.sellerId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: 'Listing rejected',
      body: dto.reason,
      deepLink: `/selling/${id}`,
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'LISTING_REJECTED',
      entityType: 'Listing',
      entityId: id,
      afterJson: { reason: dto.reason },
      ip: ip ?? null,
    });
    return { ok: true, id, status: updated.status };
  }

  async removeListing(actor: AuthUser, id: string, ip?: string) {
    return this.holdListing(actor, id, ip);
  }

  async flagListing(
    actor: AuthUser,
    id: string,
    dto: { reason: string },
    ip?: string,
  ) {
    const reason = dto.reason.trim();
    return this.holdListing(actor, id, ip, { reason, flagged: true });
  }

  private async holdListing(
    actor: AuthUser,
    id: string,
    ip?: string,
    opts?: { reason?: string; flagged?: boolean },
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    const removable: ListingStatus[] = [
      ListingStatus.LIVE,
      ListingStatus.RESERVED,
      ListingStatus.UNDER_REVIEW,
      ListingStatus.EXPIRED,
    ];
    if (!removable.includes(listing.status)) {
      throw new BadRequestException(
        'Only a listing on the marketplace can be held for review',
      );
    }
    ListingStateMachine.assertTransition(listing.status, ListingStatus.REMOVED);
    const flags = opts?.flagged
      ? Array.from(new Set([...listing.riskFlags, 'ADMIN_FLAG']))
      : listing.riskFlags;
    await this.prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.REMOVED, riskFlags: flags },
    });
    if (opts?.flagged && opts.reason) {
      await this.moderation.recordAdminDecision({
        listingId: id,
        decision: 'UNDER_REVIEW',
        actorUserId: actor.id,
        reason: opts.reason,
      });
    }
    await this.notifications.notify({
      userId: listing.sellerId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: opts?.flagged ? 'Listing flagged for review' : 'Listing removed for review',
      body: opts?.flagged
        ? `"${listing.title}" was taken off the marketplace. ${opts.reason}`
        : `"${listing.title}" was taken off the marketplace while it is reviewed.`,
      deepLink: '/selling',
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: opts?.flagged ? 'LISTING_FLAGGED' : 'LISTING_REMOVED',
      entityType: 'Listing',
      entityId: id,
      afterJson: {
        status: ListingStatus.REMOVED,
        ...(opts?.reason ? { reason: opts.reason } : {}),
      },
      ip: ip ?? null,
    });
    return { ok: true, id, status: ListingStatus.REMOVED };
  }

  async featureListing(
    actor: AuthUser,
    id: string,
    dto: AdminFeatureListingDto,
    ip?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + dto.days * 86_400_000);
    const promo = await this.prisma.promotion.create({
      data: {
        listingId: id,
        kind: 'FEATURED',
        startsAt,
        endsAt,
        feeKobo: dto.feeKobo,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'LISTING_FEATURED',
      entityType: 'Promotion',
      entityId: promo.id,
      afterJson: { listingId: id, days: dto.days, feeKobo: dto.feeKobo },
      ip: ip ?? null,
    });
    return promo;
  }

  async extendExpiry(
    actor: AuthUser,
    id: string,
    dto: AdminExtendExpiryDto,
    ip?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    const base = listing.expiresAt ?? new Date();
    const expiresAt = new Date(base.getTime() + dto.days * 86_400_000);
    await this.prisma.listing.update({
      where: { id },
      data: { expiresAt },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'LISTING_EXPIRY_EXTENDED',
      entityType: 'Listing',
      entityId: id,
      afterJson: { expiresAt, days: dto.days },
      ip: ip ?? null,
    });
    return { ok: true, id, expiresAt };
  }

  // ── Orders ─────────────────────────────────────────────────────────

  async listOrders() {
    const items = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        listing: { select: { title: true, community: true } },
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        payouts: { orderBy: { createdAt: 'desc' }, take: 1 },
        deliveryShipment: { select: { status: true } },
      },
    });
    return {
      items: items.map((o) => {
        const paymentStatus = o.payments[0]?.status ?? null;
        const payoutStatus = o.payouts[0] ? 'RELEASED' : null;
        const deliveryStatus = o.deliveryShipment?.status ?? null;
        return {
          id: o.id,
          status: o.status,
          statusLabel: orderStatusLabel(o.status),
          totalKobo: o.totalKobo,
          listingTitle: o.listing.title,
          community: o.listing.community,
          buyerName: o.buyer.profile?.displayName ?? null,
          sellerName: o.seller.profile?.displayName ?? null,
          paymentStatus,
          escrowLabel: buildEscrowSnapshot({
            orderStatus: o.status,
            paymentStatus,
            payoutStatus,
          }).label,
          deliveryStatus,
          lifecycle: buildOrderLifecycle({
            status: o.status,
            fulfilmentMethod: o.fulfilmentMethod,
            deliveryStatus,
          }),
          createdAt: o.createdAt,
        };
      }),
    };
  }

  async getOrder(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            priceKobo: true,
            community: true,
            city: true,
          },
        },
        buyer: {
          include: { profile: { select: { displayName: true } } },
        },
        seller: {
          include: { profile: { select: { displayName: true } } },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
        payouts: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'asc' } },
        disputes: { orderBy: { createdAt: 'desc' } },
        deliveryShipment: {
          include: { events: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const paymentStatus = order.payments[0]?.status ?? null;
    const payoutStatus = order.payouts[0] ? 'RELEASED' : null;
    const deliveryStatus = order.deliveryShipment?.status ?? null;

    return {
      order: {
        id: order.id,
        status: order.status,
        statusLabel: orderStatusLabel(order.status),
        fulfilmentMethod: order.fulfilmentMethod,
        amountKobo: order.amountKobo,
        protectionFeeKobo: order.protectionFeeKobo,
        deliveryFeeKobo: order.deliveryFeeKobo,
        totalKobo: order.totalKobo,
        buyerProtection: order.buyerProtection,
        fundedAt: order.fundedAt,
        autoReleaseAt: order.autoReleaseAt,
        coverageEndsAt: order.coverageEndsAt,
        completedAt: order.completedAt,
        createdAt: order.createdAt,
        transactionType: order.transactionType,
        listing: order.listing,
        buyer: {
          id: order.buyerId,
          displayName: order.buyer.profile?.displayName ?? null,
        },
        seller: {
          id: order.sellerId,
          displayName: order.seller.profile?.displayName ?? null,
        },
      },
      lifecycle: buildOrderLifecycle({
        status: order.status,
        fulfilmentMethod: order.fulfilmentMethod,
        deliveryStatus,
      }),
      escrow: buildEscrowSnapshot({
        orderStatus: order.status,
        paymentStatus,
        payoutStatus,
      }),
      payments: order.payments,
      payouts: order.payouts,
      refunds: order.refunds,
      events: order.events,
      disputes: order.disputes,
      deliveryShipment: order.deliveryShipment,
    };
  }

  async refundOrder(
    actor: AuthUser,
    id: string,
    dto: AdminRefundDto,
    ip?: string,
  ) {
    if (!dto.confirm) {
      throw new BadRequestException('confirm must be true');
    }
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const payment = order.payments.find((p) =>
      ['SUCCESS', 'RELEASED', 'PARTIALLY_REFUNDED'].includes(p.status),
    );
    if (!payment) {
      throw new BadRequestException('No refundable payment');
    }
    if (dto.amountKobo > order.totalKobo) {
      throw new BadRequestException('Refund exceeds order total');
    }
    const idemKey = `admin-refund:${id}:${dto.amountKobo}:${dto.reason}`;
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: idemKey },
    });
    if (existing) return existing;

    const result = await this.psp.refund({
      reference: payment.reference,
      amountKobo: dto.amountKobo,
      idempotencyKey: idemKey,
    });
    const payStatus =
      result.status === 'partially_refunded' ? 'PARTIALLY_REFUNDED' : 'REFUNDED';

    const refund = await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.create({
        data: {
          orderId: id,
          paymentId: payment.id,
          amountKobo: dto.amountKobo,
          reason: dto.reason,
          idempotencyKey: idemKey,
          status: payStatus,
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: payStatus },
      });
      await tx.order.update({
        where: { id },
        data: { status: 'REFUND_ISSUED' },
      });
      await tx.orderEvent.create({
        data: {
          orderId: id,
          type: 'ADMIN_REFUND',
          actorUserId: actor.id,
          payload: { amountKobo: dto.amountKobo, reason: dto.reason },
        },
      });
      return r;
    });

    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'ORDER_REFUNDED',
      entityType: 'Order',
      entityId: id,
      afterJson: { amountKobo: dto.amountKobo, reason: dto.reason },
      ip: ip ?? null,
    });
    return refund;
  }

  // ── Disputes / Verifications / Reports / Fraud ─────────────────────

  async listDisputes(status?: string) {
    return {
      items: await this.prisma.dispute.findMany({
        where: status ? { status: status as never } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          order: { select: { id: true, totalKobo: true, status: true } },
          opener: { include: { profile: true } },
        },
      }),
    };
  }

  async listVerifications(status = 'PENDING') {
    return {
      items: await this.prisma.verification.findMany({
        where: { status: status as VerificationStatus },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { include: { profile: true } },
        },
      }),
    };
  }

  async approveVerification(actor: AuthUser, id: string, ip?: string) {
    const row = await this.prisma.verification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Verification not found');
    const updated = await this.prisma.verification.update({
      where: { id },
      data: {
        status: VerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        rejectionReason: null,
      },
    });
    await this.notifications.notify({
      userId: row.userId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: 'Identity verified',
      body: 'Your identity verification was approved.',
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'VERIFICATION_APPROVED',
      entityType: 'Verification',
      entityId: id,
      ip: ip ?? null,
    });
    return updated;
  }

  async rejectVerification(
    actor: AuthUser,
    id: string,
    dto: AdminRejectVerificationDto,
    ip?: string,
  ) {
    const row = await this.prisma.verification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Verification not found');
    const updated = await this.prisma.verification.update({
      where: { id },
      data: {
        status: VerificationStatus.REJECTED,
        rejectionReason: dto.reason,
      },
    });
    await this.notifications.notify({
      userId: row.userId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: 'Verification rejected',
      body: dto.reason,
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'VERIFICATION_REJECTED',
      entityType: 'Verification',
      entityId: id,
      afterJson: { reason: dto.reason },
      ip: ip ?? null,
    });
    return updated;
  }

  async listReports() {
    return {
      items: await this.prisma.report.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          listing: { select: { id: true, title: true } },
          reportedUser: { include: { profile: true } },
          reporter: { include: { profile: true } },
        },
      }),
    };
  }

  async dismissReport(actor: AuthUser, id: string, ip?: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    await this.prisma.report.update({
      where: { id },
      data: {
        status: 'DISMISSED',
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'REPORT_DISMISSED',
      entityType: 'Report',
      entityId: id,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  async actionReport(
    actor: AuthUser,
    id: string,
    dto: AdminReportActionDto,
    ip?: string,
  ) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');

    if (dto.action === 'WARN' && report.reportedUserId) {
      await this.prisma.userWarning.create({
        data: {
          userId: report.reportedUserId,
          reportId: report.id,
          message: dto.message ?? report.reason,
          createdById: actor.id,
        },
      });
      await this.notifications.notify({
        userId: report.reportedUserId,
        category: NotificationCategory.VERIFICATION_UPDATE,
        title: 'Account warning',
        body: dto.message ?? report.reason,
      });
    } else if (dto.action === 'REMOVE_LISTING' && report.listingId) {
      await this.removeListing(actor, report.listingId, ip);
    } else if (dto.action === 'SUSPEND_USER' && report.reportedUserId) {
      try {
        await this.suspendUser(
          actor,
          report.reportedUserId,
          dto.message ?? report.reason,
          ip,
        );
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
      }
    }

    await this.prisma.report.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        action: dto.action,
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'REPORT_ACTIONED',
      entityType: 'Report',
      entityId: id,
      afterJson: { action: dto.action },
      ip: ip ?? null,
    });
    return { ok: true, action: dto.action };
  }

  async listRiskEvents() {
    const items = await this.prisma.riskEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { include: { profile: true } },
        listing: { select: { id: true, title: true } },
      },
    });
    const listingIds = [
      ...new Set(
        items
          .map((e) => e.listingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const assessments = listingIds.length
      ? await this.prisma.riskAssessment.findMany({
          where: { listingId: { in: listingIds } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const latestByListing = new Map<string, (typeof assessments)[0]>();
    for (const a of assessments) {
      if (a.listingId && !latestByListing.has(a.listingId)) {
        latestByListing.set(a.listingId, a);
      }
    }
    return {
      items: items.map((e) => ({
        ...e,
        assessment: e.listingId
          ? latestByListing.get(e.listingId) ?? null
          : null,
      })),
    };
  }

  async reviewRiskEvent(actor: AuthUser, id: string, ip?: string) {
    const row = await this.prisma.riskEvent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Risk event not found');
    const updated = await this.prisma.riskEvent.update({
      where: { id },
      data: { reviewedAt: new Date(), reviewedById: actor.id },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'RISK_EVENT_REVIEWED',
      entityType: 'RiskEvent',
      entityId: id,
      ip: ip ?? null,
    });
    return updated;
  }

  async listAppeals() {
    return this.moderation.listOpenAppeals();
  }

  async resolveAppeal(
    actor: AuthUser,
    id: string,
    dto: AdminAppealResolveDto,
    ip?: string,
  ) {
    const updated = await this.moderation.resolveAppeal(
      id,
      actor.id,
      dto.status,
      dto.note,
    );
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'MODERATION_APPEAL_RESOLVED',
      entityType: 'ModerationAppeal',
      entityId: id,
      afterJson: { status: dto.status, note: dto.note ?? null },
      ip: ip ?? null,
    });
    return updated;
  }

  // ── Support ────────────────────────────────────────────────────────

  async listSupportTickets() {
    return {
      items: await this.prisma.supportTicket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { include: { profile: true } },
          assignee: { include: { profile: true } },
          _count: { select: { notes: true } },
        },
      }),
    };
  }

  async getSupportTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { include: { profile: true } },
        assignee: { include: { profile: true } },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { include: { profile: true } } },
        },
        order: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async patchSupportTicket(
    actor: AuthUser,
    id: string,
    dto: AdminSupportPatchDto,
    ip?: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(dto.status
          ? { status: dto.status as SupportTicketStatus }
          : {}),
        ...(dto.assigneeId !== undefined
          ? { assigneeId: dto.assigneeId }
          : {}),
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'SUPPORT_TICKET_UPDATED',
      entityType: 'SupportTicket',
      entityId: id,
      afterJson: dto as unknown as Prisma.InputJsonValue,
      ip: ip ?? null,
    });
    return updated;
  }

  async addSupportNote(
    actor: AuthUser,
    id: string,
    dto: AdminSupportNoteDto,
    ip?: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const note = await this.prisma.supportTicketNote.create({
      data: {
        ticketId: id,
        authorId: actor.id,
        body: dto.body,
        internal: dto.internal ?? true,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'SUPPORT_NOTE_ADDED',
      entityType: 'SupportTicketNote',
      entityId: note.id,
      ip: ip ?? null,
    });
    return note;
  }

  async respondSupport(
    actor: AuthUser,
    id: string,
    dto: AdminSupportRespondDto,
    ip?: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const note = await this.addSupportNote(
      actor,
      id,
      { body: dto.body, internal: false },
      ip,
    );
    await this.notifications.notify({
      userId: ticket.userId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: 'Support reply',
      body: dto.body,
    });
    // Optional stub: system chat message if conversation linked — notify only for MVP
    return { note, notified: true };
  }

  // ── Catalog / Promotions / Analytics / Audit ───────────────────────

  async listCategories() {
    return {
      items: await this.prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    };
  }

  async createCategory(actor: AuthUser, data: Prisma.CategoryCreateInput, ip?: string) {
    const row = await this.prisma.category.create({ data });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'CATEGORY_CREATED',
      entityType: 'Category',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async updateCategory(
    actor: AuthUser,
    id: string,
    data: Prisma.CategoryUpdateInput,
    ip?: string,
  ) {
    const row = await this.prisma.category.update({ where: { id }, data });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'CATEGORY_UPDATED',
      entityType: 'Category',
      entityId: id,
      ip: ip ?? null,
    });
    return row;
  }

  async deleteCategory(actor: AuthUser, id: string, ip?: string) {
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'CATEGORY_DELETED',
      entityType: 'Category',
      entityId: id,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  async listMeetPoints() {
    return {
      items: await this.prisma.meetPoint.findMany({
        orderBy: { community: 'asc' },
      }),
    };
  }

  async createMeetPoint(
    actor: AuthUser,
    data: Prisma.MeetPointCreateInput,
    ip?: string,
  ) {
    const row = await this.prisma.meetPoint.create({ data });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'MEET_POINT_CREATED',
      entityType: 'MeetPoint',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async updateMeetPoint(
    actor: AuthUser,
    id: string,
    data: Prisma.MeetPointUpdateInput,
    ip?: string,
  ) {
    const row = await this.prisma.meetPoint.update({ where: { id }, data });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'MEET_POINT_UPDATED',
      entityType: 'MeetPoint',
      entityId: id,
      ip: ip ?? null,
    });
    return row;
  }

  async deleteMeetPoint(actor: AuthUser, id: string, ip?: string) {
    await this.prisma.meetPoint.delete({ where: { id } });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'MEET_POINT_DELETED',
      entityType: 'MeetPoint',
      entityId: id,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  async listChatScanRules() {
    return {
      items: await this.prisma.chatScanRule.findMany({
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async createChatScanRule(
    actor: AuthUser,
    data: Prisma.ChatScanRuleCreateInput,
    ip?: string,
  ) {
    const row = await this.prisma.chatScanRule.create({ data });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'CHAT_SCAN_RULE_CREATED',
      entityType: 'ChatScanRule',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async updateChatScanRule(
    actor: AuthUser,
    id: string,
    data: Prisma.ChatScanRuleUpdateInput,
    ip?: string,
  ) {
    const row = await this.prisma.chatScanRule.update({ where: { id }, data });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'CHAT_SCAN_RULE_UPDATED',
      entityType: 'ChatScanRule',
      entityId: id,
      ip: ip ?? null,
    });
    return row;
  }

  async deleteChatScanRule(actor: AuthUser, id: string, ip?: string) {
    await this.prisma.chatScanRule.delete({ where: { id } });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'CHAT_SCAN_RULE_DELETED',
      entityType: 'ChatScanRule',
      entityId: id,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  async listHeroBanners() {
    return {
      items: await this.prisma.heroBanner.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    };
  }

  async createHeroBanner(
    actor: AuthUser,
    dto: AdminHeroBannerDto,
    ip?: string,
  ) {
    const row = await this.prisma.heroBanner.create({
      data: {
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'HERO_BANNER_CREATED',
      entityType: 'HeroBanner',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async updateHeroBanner(
    actor: AuthUser,
    id: string,
    dto: Partial<AdminHeroBannerDto>,
    ip?: string,
  ) {
    const row = await this.prisma.heroBanner.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'HERO_BANNER_UPDATED',
      entityType: 'HeroBanner',
      entityId: id,
      ip: ip ?? null,
    });
    return row;
  }

  async deleteHeroBanner(actor: AuthUser, id: string, ip?: string) {
    await this.prisma.heroBanner.delete({ where: { id } });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'HERO_BANNER_DELETED',
      entityType: 'HeroBanner',
      entityId: id,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  async listCommunities() {
    const items = await this.prisma.community.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            memberships: true,
            listings: true,
            managers: true,
          },
        },
      },
    });
    return {
      items: items.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        type: c.type,
        privacy: c.privacy,
        coverUrl: c.coverUrl,
        about: c.about,
        verified: c.verified,
        active: c.active,
        geoLat: c.geoLat,
        geoLng: c.geoLng,
        membershipCount: c._count.memberships,
        listingCount: c._count.listings,
        managerCount: c._count.managers,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  async createCommunity(
    actor: AuthUser,
    data: {
      slug: string;
      name: string;
      active?: boolean;
      type?: string;
      privacy?: string;
      about?: string;
      verified?: boolean;
    },
    ip?: string,
  ) {
    const row = await this.prisma.community.create({
      data: {
        slug: data.slug,
        name: data.name,
        active: data.active ?? true,
        type: (data.type as CommunityType) ?? 'ESTATE',
        privacy: (data.privacy as CommunityPrivacy) ?? 'PUBLIC',
        about: data.about ?? '',
        verified: data.verified ?? false,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_CREATED',
      entityType: 'Community',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async patchCommunity(
    actor: AuthUser,
    id: string,
    dto: AdminPatchCommunityDto,
    ip?: string,
  ) {
    await this.assertCanManageCommunity(actor, id);
    const existing = await this.prisma.community.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Community not found');

    const row = await this.prisma.community.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined
          ? { type: dto.type as CommunityType }
          : {}),
        ...(dto.privacy !== undefined
          ? { privacy: dto.privacy as CommunityPrivacy }
          : {}),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl } : {}),
        ...(dto.about !== undefined ? { about: dto.about } : {}),
        ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.geoLat !== undefined ? { geoLat: dto.geoLat } : {}),
        ...(dto.geoLng !== undefined ? { geoLng: dto.geoLng } : {}),
        ...(dto.premium !== undefined ? { premium: dto.premium } : {}),
        ...(dto.membershipFeeKobo !== undefined
          ? { membershipFeeKobo: dto.membershipFeeKobo }
          : {}),
        ...(dto.listingFeeKobo !== undefined
          ? { listingFeeKobo: dto.listingFeeKobo }
          : {}),
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_UPDATED',
      entityType: 'Community',
      entityId: id,
      ip: ip ?? null,
    });
    return row;
  }

  async listCommunityMemberships(
    actor: AuthUser,
    communityId: string,
    status?: string,
  ) {
    await this.assertCanManageCommunity(actor, communityId);
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });
    if (!community) throw new NotFoundException('Community not found');

    const items = await this.prisma.communityMembership.findMany({
      where: {
        communityId,
        ...(status
          ? { status: status as CommunityMembershipStatus }
          : {}),
      },
      include: {
        user: { include: { profile: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      communityId,
      items: items.map((m) => ({
        id: m.id,
        userId: m.userId,
        status: m.status,
        joinedAt: m.joinedAt,
        createdAt: m.createdAt,
        displayName: m.user.profile?.displayName ?? null,
      })),
      kpi: await this.communityKpi(communityId),
    };
  }

  async approveMembership(actor: AuthUser, membershipId: string, ip?: string) {
    const membership = await this.requireMembership(membershipId);
    await this.assertCanManageCommunity(actor, membership.communityId);
    const updated = await this.prisma.communityMembership.update({
      where: { id: membershipId },
      data: {
        status: 'MEMBER',
        verifiedById: actor.id,
        joinedAt: new Date(),
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_MEMBERSHIP_APPROVED',
      entityType: 'CommunityMembership',
      entityId: membershipId,
      ip: ip ?? null,
    });
    return updated;
  }

  async rejectMembership(actor: AuthUser, membershipId: string, ip?: string) {
    const membership = await this.requireMembership(membershipId);
    await this.assertCanManageCommunity(actor, membership.communityId);
    const updated = await this.prisma.communityMembership.update({
      where: { id: membershipId },
      data: { status: 'LEFT', verifiedById: actor.id, joinedAt: null },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_MEMBERSHIP_REJECTED',
      entityType: 'CommunityMembership',
      entityId: membershipId,
      ip: ip ?? null,
    });
    return updated;
  }

  async suspendMembership(actor: AuthUser, membershipId: string, ip?: string) {
    const membership = await this.requireMembership(membershipId);
    await this.assertCanManageCommunity(actor, membership.communityId);
    const updated = await this.prisma.communityMembership.update({
      where: { id: membershipId },
      data: { status: 'SUSPENDED', verifiedById: actor.id },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_MEMBERSHIP_SUSPENDED',
      entityType: 'CommunityMembership',
      entityId: membershipId,
      ip: ip ?? null,
    });
    return updated;
  }

  async addCommunityManager(
    actor: AuthUser,
    communityId: string,
    userId: string,
    ip?: string,
  ) {
    this.assertUnrestrictedOps(actor);
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });
    if (!community) throw new NotFoundException('Community not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const row = await this.prisma.communityManager.upsert({
      where: {
        communityId_userId: { communityId, userId },
      },
      create: { communityId, userId },
      update: {},
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_MANAGER_ADDED',
      entityType: 'CommunityManager',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async removeCommunityManager(
    actor: AuthUser,
    communityId: string,
    userId: string,
    ip?: string,
  ) {
    this.assertUnrestrictedOps(actor);
    await this.prisma.communityManager.deleteMany({
      where: { communityId, userId },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'COMMUNITY_MANAGER_REMOVED',
      entityType: 'CommunityManager',
      entityId: `${communityId}:${userId}`,
      ip: ip ?? null,
    });
    return { ok: true };
  }

  /**
   * OPERATIONS / SUPER_ADMIN unrestricted; CommunityManager only for
   * their assigned community.
   */
  async assertCanManageCommunity(actor: AuthUser, communityId: string) {
    if (this.isUnrestrictedOps(actor)) return;
    const mgr = await this.prisma.communityManager.findUnique({
      where: {
        communityId_userId: { communityId, userId: actor.id },
      },
    });
    if (!mgr) {
      throw new ForbiddenException(
        'Not allowed to manage this community',
      );
    }
  }

  private isUnrestrictedOps(actor: AuthUser): boolean {
    return (
      actor.roles.includes(AdminRole.SUPER_ADMIN) ||
      actor.roles.includes(AdminRole.OPERATIONS)
    );
  }

  private assertUnrestrictedOps(actor: AuthUser) {
    if (!this.isUnrestrictedOps(actor)) {
      throw new ForbiddenException('OPERATIONS role required');
    }
  }

  private async requireMembership(id: string) {
    const membership = await this.prisma.communityMembership.findUnique({
      where: { id },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    return membership;
  }

  private async communityKpi(communityId: string) {
    const [members, pending, liveListings] = await Promise.all([
      this.prisma.communityMembership.count({
        where: {
          communityId,
          status: { in: ['MEMBER', 'APPROVED'] },
        },
      }),
      this.prisma.communityMembership.count({
        where: { communityId, status: 'INVITED' },
      }),
      this.prisma.listing.count({
        where: { communityId, status: 'LIVE' },
      }),
    ]);
    return { members, pending, liveListings };
  }

  async listPromotions() {
    return {
      items: await this.prisma.promotion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { listing: { select: { title: true } } },
      }),
    };
  }

  async createPromotion(
    actor: AuthUser,
    dto: AdminPromotionCreateDto,
    ip?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const row = await this.prisma.promotion.create({
      data: {
        listingId: dto.listingId,
        kind: dto.kind,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        feeKobo: dto.feeKobo ?? 0,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      actorUserId: actor.id,
      actorRole: actor.roles[0] ?? null,
      action: 'PROMOTION_CREATED',
      entityType: 'Promotion',
      entityId: row.id,
      ip: ip ?? null,
    });
    return row;
  }

  async analytics(from?: string, to?: string, community?: string, city?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const toDate = to ? new Date(to) : new Date();
    const listingWhere: Prisma.ListingWhereInput = {
      createdAt: { gte: fromDate, lte: toDate },
      ...(community ? { community } : {}),
      ...(city ? { city } : {}),
    };
    const orderWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: fromDate, lte: toDate },
      ...(community || city
        ? {
            listing: {
              ...(community ? { community } : {}),
              ...(city ? { city } : {}),
            },
          }
        : {}),
    };
    const [listings, orders, users] = await Promise.all([
      this.prisma.listing.count({ where: listingWhere }),
      this.prisma.order.findMany({
        where: orderWhere,
        select: { totalKobo: true, status: true, listing: { select: { community: true, city: true } } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: fromDate, lte: toDate } },
      }),
    ]);
    const gmvKobo = orders
      .filter((o) => o.status === 'COMPLETED')
      .reduce((s, o) => s + o.totalKobo, 0);
    const rows = [
      { metric: 'new_users', value: users },
      { metric: 'new_listings', value: listings },
      { metric: 'orders', value: orders.length },
      { metric: 'gmv_kobo', value: gmvKobo },
    ];
    return {
      from: fromDate,
      to: toDate,
      community: community ?? null,
      city: city ?? null,
      rows,
    };
  }

  async analyticsCsv(from?: string, to?: string, community?: string, city?: string) {
    const data = await this.analytics(from, to, community, city);
    const header = 'metric,value';
    const lines = data.rows.map((r) => `${r.metric},${r.value}`);
    return [header, ...lines].join('\n');
  }

  async listAudit(actorId?: string, action?: string, cursor?: string) {
    const take = 50;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(actorId ? { actorUserId: actorId } : {}),
        ...(action ? { action } : {}),
      },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const nextCursor = rows.length > take ? rows[take - 1]!.id : null;
    return { items: rows.slice(0, take), nextCursor };
  }
}
