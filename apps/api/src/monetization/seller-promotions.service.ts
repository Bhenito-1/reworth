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
import { PromotionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment.provider';
import { MockPsp } from '../providers/mock-psp';
import {
  NON_ORDER_CHARGE_PREFIXES,
  payReturnUrl,
  type NonOrderChargeResult,
} from '../common/pay-return-url';
import { FeeConfigService } from './fee-config.service';
import { RevenueLedgerService } from './revenue-ledger.service';

@Injectable()
export class SellerPromotionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SellerPromotionsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: FeeConfigService,
    private readonly ledger: RevenueLedgerService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly psp: PaymentProvider,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      this.config.get('BOOST_EXPIRY_SCHEDULER') === 'false'
    ) {
      return;
    }
    this.timer = setInterval(() => {
      void this.expireEnded().catch((e) =>
        this.logger.warn(`boost expiry: ${(e as Error).message}`),
      );
    }, 60_000);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async quoteBoost(hours: number) {
    const { rates, id, version } = await this.fees.getActive();
    if (!rates.boost.durationsHours.includes(hours)) {
      throw new BadRequestException(
        `Invalid boost duration. Allowed: ${rates.boost.durationsHours.join(', ')}h`,
      );
    }
    const priceKobo = rates.boost.priceByHoursKobo[String(hours)];
    if (priceKobo == null) {
      throw new BadRequestException('No price for duration');
    }
    return { hours, priceKobo, feeConfigVersionId: id, version };
  }

  async quoteFeatured() {
    const { rates, id, version } = await this.fees.getActive();
    return {
      hours: rates.featured.durationHours,
      priceKobo: rates.featured.priceKobo,
      feeConfigVersionId: id,
      version,
    };
  }

  async purchaseBoost(
    sellerId: string,
    listingId: string,
    hours: number,
    idempotencyKey: string,
  ) {
    return this.purchase('BOOST', sellerId, listingId, idempotencyKey, hours);
  }

  async purchaseFeatured(
    sellerId: string,
    listingId: string,
    idempotencyKey: string,
  ) {
    return this.purchase('FEATURED', sellerId, listingId, idempotencyKey);
  }

  /**
   * Creates the promotion as PENDING and returns the Paystack checkout link.
   * It goes live only in `activateFromPayment`, after the PSP confirms the
   * charge (webhook or buyer return). The promotion window starts then.
   */
  private async purchase(
    kind: 'BOOST' | 'FEATURED',
    sellerId: string,
    listingId: string,
    idempotencyKey: string,
    boostHours?: number,
  ) {
    const existing = await this.prisma.promotion.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.createdById !== sellerId) {
        throw new ForbiddenException('Not your promotion');
      }
      return this.toDto(existing);
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Not your listing');
    }
    if (listing.status !== 'LIVE') {
      throw new ConflictException(
        kind === 'BOOST'
          ? 'Only LIVE listings can be boosted'
          : 'Only LIVE listings can be featured',
      );
    }

    const quote =
      kind === 'BOOST'
        ? await this.quoteBoost(boostHours ?? 0)
        : await this.quoteFeatured();
    const seller = await this.prisma.user.findUnique({ where: { id: sellerId } });
    const email = seller?.email?.trim() || `payments+${sellerId}@reworth.ng`;
    const prefix =
      kind === 'BOOST'
        ? NON_ORDER_CHARGE_PREFIXES.BOOST
        : NON_ORDER_CHARGE_PREFIXES.FEATURED;
    const reference = `${prefix}${listingId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;

    const initiated = await this.psp.initiate({
      amountKobo: quote.priceKobo,
      currency: 'NGN',
      reference,
      email,
      metadata: { kind, listingId, sellerId },
      idempotencyKey,
      callbackUrl: payReturnUrl(this.psp.name),
    });

    // The window is stored now only to keep the duration. Activation moves it
    // to start when the charge is confirmed.
    const now = new Date();
    const promo = await this.prisma.promotion.create({
      data: {
        listingId,
        kind,
        startsAt: now,
        endsAt: new Date(now.getTime() + quote.hours * 3_600_000),
        feeKobo: quote.priceKobo,
        feeConfigVersionId: quote.feeConfigVersionId,
        pspReference: initiated.reference,
        paymentStatus: 'PENDING',
        idempotencyKey,
        createdById: sellerId,
      },
    });

    // Mock PSP has no hosted checkout: settle at once for local demos.
    if (this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).simulateWebhookSuccess(initiated.reference);
      await this.activateFromPayment(initiated.reference);
      const fresh = await this.prisma.promotion.findUnique({
        where: { id: promo.id },
      });
      return this.toDto(fresh ?? promo);
    }

    return { ...this.toDto(promo), checkoutUrl: initiated.checkoutUrl };
  }

  /**
   * Confirms a boost / featured charge with the PSP and switches the
   * promotion on. Safe to call from the webhook and the buyer return at the
   * same time: only the first caller activates and writes the RevenueLine.
   */
  async activateFromPayment(
    reference: string,
    expectedOwnerId?: string,
  ): Promise<NonOrderChargeResult | null> {
    const promo = await this.prisma.promotion.findFirst({
      where: { pspReference: reference },
    });
    if (!promo) return null;
    if (expectedOwnerId && promo.createdById !== expectedOwnerId) {
      throw new ForbiddenException('Not your promotion');
    }
    const result = (status: NonOrderChargeResult['status']) => ({
      id: promo.id,
      purpose: promo.kind === 'BOOST' ? ('BOOST' as const) : ('FEATURED' as const),
      reference,
      amountKobo: promo.feeKobo,
      status,
      ownerId: promo.createdById,
      listingId: promo.listingId,
    });
    if (promo.paymentStatus === 'SUCCESS' || promo.paymentStatus === 'none') {
      return result('SUCCESS');
    }

    const verified = await this.psp.verify(reference);
    if (verified.status === 'pending') return result('PENDING');
    if (verified.status === 'failed') {
      await this.prisma.promotion.updateMany({
        where: { id: promo.id, paymentStatus: 'PENDING' },
        data: { paymentStatus: 'FAILED' },
      });
      return result('FAILED');
    }
    if (
      this.psp.name === 'paystack' &&
      verified.amountKobo !== promo.feeKobo
    ) {
      this.logger.error(
        `Promotion ${promo.id}: Paystack amount ${verified.amountKobo} != fee ${promo.feeKobo}`,
      );
      throw new ConflictException('Paystack amount does not match this promotion');
    }

    // Duration stays what the seller bought; the window starts now.
    const durationMs = promo.endsAt.getTime() - promo.startsAt.getTime();
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationMs);
    const claimed = await this.prisma.promotion.updateMany({
      where: { id: promo.id, paymentStatus: { in: ['PENDING', 'FAILED'] } },
      data: { paymentStatus: 'SUCCESS', startsAt, endsAt },
    });
    if (claimed.count === 0) return result('SUCCESS');

    const listing = await this.prisma.listing.findUnique({
      where: { id: promo.listingId },
      select: { city: true, categoryId: true },
    });
    await this.ledger.record({
      stream: promo.kind === 'BOOST' ? 'BOOST' : 'FEATURED',
      grossKobo: promo.feeKobo,
      netKobo: promo.feeKobo,
      listingId: promo.listingId,
      sellerId: promo.createdById,
      city: listing?.city ?? 'Lagos',
      categoryId: listing?.categoryId ?? undefined,
      pspReference: reference,
      feeConfigVersionId: promo.feeConfigVersionId ?? undefined,
      referenceType: 'Promotion',
      referenceId: promo.id,
      ...(promo.kind === 'BOOST'
        ? { meta: { hours: Math.round(durationMs / 3_600_000) } }
        : {}),
    });
    this.logger.log({
      event: 'promotion.activated',
      promotionId: promo.id,
      kind: promo.kind,
      reference,
    });
    return result('SUCCESS');
  }

  async activeForListing(listingId: string) {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        listingId,
        startsAt: { lte: now },
        endsAt: { gt: now },
        paymentStatus: { in: ['SUCCESS', 'none'] },
      },
      orderBy: { endsAt: 'desc' },
    });
  }

  async expireEnded() {
    // Soft: ranking queries filter by endsAt; log for observability
    const now = new Date();
    const ended = await this.prisma.promotion.count({
      where: {
        kind: { in: ['BOOST', 'FEATURED'] as PromotionKind[] },
        endsAt: { lte: now, gte: new Date(now.getTime() - 120_000) },
      },
    });
    if (ended > 0) {
      this.logger.log({ event: 'promotions.expired_window', count: ended });
    }
  }

  private toDto(p: {
    id: string;
    listingId: string;
    kind: PromotionKind;
    startsAt: Date;
    endsAt: Date;
    feeKobo: number;
    paymentStatus: string;
    pspReference: string | null;
  }) {
    const now = Date.now();
    return {
      id: p.id,
      listingId: p.listingId,
      kind: p.kind,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      feeKobo: p.feeKobo,
      paymentStatus: p.paymentStatus,
      pspReference: p.pspReference,
      active: p.startsAt.getTime() <= now && p.endsAt.getTime() > now,
    };
  }
}
