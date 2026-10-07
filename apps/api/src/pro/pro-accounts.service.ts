import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { NotificationCategory } from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPsp } from '../providers/mock-psp';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { AdminProDecisionDto, ProApplyDto } from './dto/pro.dto';

@Injectable()
export class ProAccountsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProAccountsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly psp: PaymentProvider,
  ) {}

  onModuleInit() {
    const disabled =
      process.env.NODE_ENV === 'test' ||
      this.config.get<string>('PRO_SUBSCRIPTION_SCHEDULER') === 'false';
    if (disabled) return;
    const hourMs = 60 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.tickSubscriptions().catch((err) =>
        this.logger.warn(`Pro subscription tick failed: ${(err as Error).message}`),
      );
    }, hourMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  subscriptionKobo(): number {
    return Number(
      this.config.get<string>('PRO_SUBSCRIPTION_KOBO') ?? '1500000',
    );
  }

  graceDays(): number {
    return Number(this.config.get<string>('PRO_GRACE_DAYS') ?? '7');
  }

  async apply(userId: string, dto: ProApplyDto) {
    const existing = await this.prisma.proAccount.findUnique({
      where: { userId },
    });
    if (existing && !['REJECTED'].includes(existing.status)) {
      throw new ConflictException('Pro application already exists');
    }

    if (dto.handle) {
      const handle = dto.handle.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (handle.length < 3) {
        throw new BadRequestException('handle too short');
      }
      const taken = await this.prisma.profile.findFirst({
        where: { handle, userId: { not: userId } },
      });
      if (taken) throw new ConflictException('Handle already taken');
      await this.prisma.profile.update({
        where: { userId },
        data: { handle },
      });
    }

    if (existing?.status === 'REJECTED') {
      return this.prisma.proAccount.update({
        where: { id: existing.id },
        data: {
          status: 'APPLIED',
          businessName: dto.businessName,
          businessDetails: (dto.businessDetails ?? {}) as Prisma.InputJsonValue,
          sampleListingIds: dto.sampleListingIds ?? [],
          applicationNotes: dto.applicationNotes ?? null,
          reviewedAt: null,
          reviewedById: null,
        },
      });
    }

    return this.prisma.proAccount.create({
      data: {
        userId,
        status: 'APPLIED',
        businessName: dto.businessName,
        businessDetails: (dto.businessDetails ?? {}) as Prisma.InputJsonValue,
        sampleListingIds: dto.sampleListingIds ?? [],
        applicationNotes: dto.applicationNotes ?? null,
      },
    });
  }

  async getMine(userId: string) {
    const account = await this.prisma.proAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new NotFoundException('No pro account');
    return account;
  }

  async approve(adminId: string, proAccountId: string, _dto?: AdminProDecisionDto) {
    const account = await this.requireAccount(proAccountId);
    if (account.status !== 'APPLIED') {
      throw new ConflictException(`Cannot approve from ${account.status}`);
    }
    const updated = await this.prisma.proAccount.update({
      where: { id: proAccountId },
      data: {
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
    await this.notifications.notify({
      userId: account.userId,
      category: NotificationCategory.VERIFICATION_UPDATE,
      title: 'Pro seller approved',
      body: 'Subscribe to activate bulk tools and your storefront.',
      deepLink: 'reworth://pro',
      meta: { proAccountId },
    });
    return updated;
  }

  async reject(adminId: string, proAccountId: string, dto?: AdminProDecisionDto) {
    const account = await this.requireAccount(proAccountId);
    if (account.status !== 'APPLIED') {
      throw new ConflictException(`Cannot reject from ${account.status}`);
    }
    return this.prisma.proAccount.update({
      where: { id: proAccountId },
      data: {
        status: 'REJECTED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        applicationNotes: dto?.notes ?? account.applicationNotes,
      },
    });
  }

  async subscribe(userId: string, opts?: { fail?: boolean }) {
    const account = await this.prisma.proAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new NotFoundException('No pro account');
    if (!['APPROVED', 'ACTIVE', 'GRACE', 'SUSPENDED'].includes(account.status)) {
      throw new ConflictException(
        `Cannot subscribe from status ${account.status}`,
      );
    }

    const amountKobo = this.subscriptionKobo();
    const reference = `pro_sub_${account.id.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const initiated = await this.psp.initiate({
      amountKobo,
      currency: 'NGN',
      reference,
      email: user?.email ?? `${userId}@reworth.local`,
      metadata: { proAccountId: account.id, kind: 'PRO_SUBSCRIPTION' },
      idempotencyKey: `pro-sub:${account.id}:${reference}`,
    });

    if (opts?.fail) {
      return this.enterGraceOrSuspend(account.id, reference);
    }

    if (this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).simulateWebhookSuccess(initiated.reference);
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.prisma.proAccount.update({
      where: { id: account.id },
      data: {
        status: 'ACTIVE',
        subscriptionRef: initiated.reference,
        subscriptionStatus: 'active',
        mrrKobo: amountKobo,
        currentPeriodEnd: periodEnd,
        graceUntil: null,
      },
    });
  }

  /** Simulate payment failure → grace then suspend. */
  async failSubscription(userId: string) {
    const account = await this.prisma.proAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new NotFoundException('No pro account');
    return this.enterGraceOrSuspend(
      account.id,
      account.subscriptionRef ?? `fail_${Date.now()}`,
    );
  }

  private async enterGraceOrSuspend(proAccountId: string, subscriptionRef: string) {
    const account = await this.requireAccount(proAccountId);
    if (account.status === 'ACTIVE' || account.status === 'APPROVED') {
      const graceUntil = new Date(
        Date.now() + this.graceDays() * 24 * 60 * 60 * 1000,
      );
      return this.prisma.proAccount.update({
        where: { id: proAccountId },
        data: {
          status: 'GRACE',
          subscriptionStatus: 'past_due',
          subscriptionRef,
          graceUntil,
          warningCount: { increment: 1 },
        },
      });
    }
    if (account.status === 'GRACE') {
      return this.suspend(proAccountId);
    }
    return account;
  }

  async suspend(proAccountId: string) {
    return this.prisma.proAccount.update({
      where: { id: proAccountId },
      data: {
        status: 'SUSPENDED',
        subscriptionStatus: 'suspended',
        graceUntil: null,
      },
    });
  }

  /** True when bulk tools / storefront features are allowed. */
  async assertActivePro(userId: string) {
    const account = await this.prisma.proAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new ForbiddenException('Pro account required');
    if (account.status === 'SUSPENDED') {
      throw new ForbiddenException('Pro account suspended');
    }
    if (!['ACTIVE', 'GRACE', 'APPROVED'].includes(account.status)) {
      throw new ForbiddenException(`Pro status ${account.status} cannot use tools`);
    }
    // Bulk upload requires ACTIVE (or GRACE still has access until suspend)
    if (account.status === 'APPROVED') {
      throw new ForbiddenException('Subscribe to activate pro tools');
    }
    return account;
  }

  async listQueue(status?: string) {
    return this.prisma.proAccount.findMany({
      where: status ? { status: status as never } : { status: 'APPLIED' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { displayName: true, handle: true } },
          },
        },
      },
    });
  }

  async getStorefront(handle: string) {
    const normalized = handle.replace(/^@/, '').toLowerCase();
    const profile = await this.prisma.profile.findFirst({
      where: { handle: normalized },
      include: {
        user: {
          include: {
            proAccount: true,
            trustScore: true,
            _count: {
              select: {
                reviewsReceived: { where: { status: 'PUBLISHED' } },
              },
            },
          },
        },
      },
    });
    if (!profile?.user || profile.user.status === 'SUSPENDED') {
      throw new NotFoundException('Storefront not found');
    }
    const pro = profile.user.proAccount;
    const proBadge =
      pro && ['ACTIVE', 'GRACE'].includes(pro.status) ? 'Pro Seller' : null;

    const listings = await this.prisma.listing.findMany({
      where: { sellerId: profile.userId, status: 'LIVE' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        priceKobo: true,
        condition: true,
        community: true,
        publishedAt: true,
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { variants: true },
        },
      },
    });

    return {
      handle: profile.handle,
      displayName: profile.displayName,
      about: profile.bio ?? '',
      businessName: pro?.businessName ?? null,
      proBadge,
      rating:
        profile.user.trustScore?.avgRating != null
          ? Number(profile.user.trustScore.avgRating)
          : null,
      reviewCount: profile.user._count.reviewsReceived,
      responseMinutes: profile.user.trustScore?.medianResponseMinutes ?? null,
      listings,
    };
  }

  async tickSubscriptions(now = new Date()): Promise<number> {
    const graceExpired = await this.prisma.proAccount.findMany({
      where: {
        status: 'GRACE',
        graceUntil: { lte: now },
      },
      select: { id: true },
    });
    for (const row of graceExpired) {
      await this.suspend(row.id);
    }
    return graceExpired.length;
  }

  private async requireAccount(id: string) {
    const account = await this.prisma.proAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Pro account not found');
    return account;
  }
}
