import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
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

const PLUS_CHECKOUT_OPERATION = 'seller_plus_checkout';
const PLUS_CHECKOUT_KEY_PREFIX = 'plus_checkout:';
const PLUS_PAID_KEY_PREFIX = 'plus_paid:';
const PLUS_PERIOD_MS = 30 * 86_400_000;

/** Pending Seller Plus checkout, stored in IdempotencyRecord.responseJson. */
type PlusCheckout = {
  reference: string;
  userId: string;
  priceKobo: number;
  feeConfigVersionId: string;
  checkoutUrl: string | null;
  idempotencyKey: string;
};

@Injectable()
export class SellerSubscriptionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SellerSubscriptionService.name);
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
      this.config.get('SELLER_SUB_SCHEDULER') === 'false'
    ) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick().catch((e) =>
        this.logger.warn(`seller sub tick: ${(e as Error).message}`),
      );
    }, 60 * 60 * 1000);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getOrCreate(userId: string) {
    const existing = await this.prisma.sellerSubscription.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    return this.prisma.sellerSubscription.create({
      data: { userId, tier: 'STARTER', status: 'NONE', priceKobo: 0 },
    });
  }

  async benefits(userId: string) {
    const sub = await this.getOrCreate(userId);
    const { rates } = await this.fees.getActive();
    const active =
      sub.status === 'ACTIVE' ||
      (sub.status === 'PAST_DUE' &&
        sub.graceUntil &&
        sub.graceUntil.getTime() > Date.now());
    const plus = active && sub.tier === 'PLUS';
    return {
      subscription: sub,
      maxActiveListings: plus
        ? rates.sellerPlus.maxActiveListings
        : rates.sellerStarter.maxActiveListings,
      featuredSlotsPerMonth: plus ? rates.sellerPlus.featuredSlotsPerMonth : 0,
      analytics: plus,
      prioritySupport: plus,
      tier: plus ? 'PLUS' : 'STARTER',
    };
  }

  /**
   * Starts a Seller Plus checkout. The plan does not change here: it switches
   * to PLUS only in `activateFromPayment`, after the PSP confirms the charge.
   * The pending checkout is kept as an IdempotencyRecord so the same
   * idempotency key returns the same checkout link.
   */
  async upgradeToPlus(userId: string, idempotencyKey: string) {
    const sub = await this.getOrCreate(userId);
    if (sub.status === 'ACTIVE' && sub.tier === 'PLUS') {
      throw new ConflictException('Already on Plus');
    }

    const checkoutKey = `${PLUS_CHECKOUT_KEY_PREFIX}${userId}:${idempotencyKey}`;
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { key: checkoutKey },
    });
    if (existing) {
      const pending = existing.responseJson as unknown as PlusCheckout;
      return {
        ...sub,
        paymentStatus: 'PENDING' as const,
        reference: pending.reference,
        checkoutUrl: pending.checkoutUrl,
      };
    }

    const { rates, id: feeConfigVersionId } = await this.fees.getActive();
    const priceKobo = rates.sellerPlus.monthlyKobo;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const email = user?.email?.trim() || `payments+${userId}@reworth.ng`;
    const reference = `${NON_ORDER_CHARGE_PREFIXES.SELLER_PLUS}${userId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;

    const initiated = await this.psp.initiate({
      amountKobo: priceKobo,
      currency: 'NGN',
      reference,
      email,
      metadata: { kind: 'SELLER_PLUS', userId, idempotencyKey },
      idempotencyKey,
      callbackUrl: payReturnUrl(this.psp.name),
    });

    const checkout: PlusCheckout = {
      reference: initiated.reference,
      userId,
      priceKobo,
      feeConfigVersionId,
      checkoutUrl: initiated.checkoutUrl ?? null,
      idempotencyKey,
    };
    await this.prisma.idempotencyRecord.create({
      data: {
        key: checkoutKey,
        operation: PLUS_CHECKOUT_OPERATION,
        responseJson: checkout as unknown as Prisma.InputJsonValue,
      },
    });

    // Mock PSP has no hosted checkout: settle at once for local demos.
    if (this.psp.name === 'mock-psp') {
      (this.psp as MockPsp).simulateWebhookSuccess(initiated.reference);
      await this.activateFromPayment(initiated.reference);
      const fresh = await this.getOrCreate(userId);
      return {
        ...fresh,
        paymentStatus: 'SUCCESS' as const,
        reference: initiated.reference,
        checkoutUrl: initiated.checkoutUrl,
      };
    }

    return {
      ...sub,
      paymentStatus: 'PENDING' as const,
      reference: initiated.reference,
      checkoutUrl: initiated.checkoutUrl,
    };
  }

  /**
   * Confirms a Seller Plus charge with the PSP and switches the plan on for
   * 30 days (added to any time left on a current Plus period). Safe to call
   * from the webhook and the buyer return together: a unique
   * IdempotencyRecord per reference lets only the first caller activate.
   */
  async activateFromPayment(
    reference: string,
    expectedOwnerId?: string,
  ): Promise<NonOrderChargeResult | null> {
    const record = await this.prisma.idempotencyRecord.findFirst({
      where: {
        operation: PLUS_CHECKOUT_OPERATION,
        responseJson: { path: ['reference'], equals: reference },
      },
    });
    if (!record) return null;
    const checkout = record.responseJson as unknown as PlusCheckout;
    if (expectedOwnerId && checkout.userId !== expectedOwnerId) {
      throw new ForbiddenException('Not your subscription payment');
    }
    const result = (status: NonOrderChargeResult['status']) => ({
      id: record.id,
      purpose: 'SELLER_PLUS' as const,
      reference,
      amountKobo: checkout.priceKobo,
      status,
      ownerId: checkout.userId,
    });

    const paidKey = `${PLUS_PAID_KEY_PREFIX}${reference}`;
    const alreadyPaid = await this.prisma.idempotencyRecord.findUnique({
      where: { key: paidKey },
    });
    if (alreadyPaid) return result('SUCCESS');

    const verified = await this.psp.verify(reference);
    if (verified.status === 'pending') return result('PENDING');
    if (verified.status === 'failed') return result('FAILED');
    if (
      this.psp.name === 'paystack' &&
      verified.amountKobo !== checkout.priceKobo
    ) {
      this.logger.error(
        `Seller Plus ${reference}: Paystack amount ${verified.amountKobo} != price ${checkout.priceKobo}`,
      );
      throw new ConflictException(
        'Paystack amount does not match this subscription',
      );
    }

    const sub = await this.getOrCreate(checkout.userId);
    const now = new Date();
    const periodStart =
      sub.tier === 'PLUS' &&
      sub.status === 'ACTIVE' &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd.getTime() > now.getTime()
        ? sub.currentPeriodEnd
        : now;
    const periodEnd = new Date(periodStart.getTime() + PLUS_PERIOD_MS);

    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyRecord.create({
          data: {
            key: paidKey,
            operation: 'seller_plus_paid',
            responseJson: {
              reference,
              userId: checkout.userId,
              periodEnd: periodEnd.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        return tx.sellerSubscription.update({
          where: { userId: checkout.userId },
          data: {
            tier: 'PLUS',
            status: 'ACTIVE',
            priceKobo: checkout.priceKobo,
            feeConfigVersionId: checkout.feeConfigVersionId,
            subscriptionRef: reference,
            currentPeriodEnd: periodEnd,
            graceUntil: null,
            cancelAtPeriodEnd: false,
          },
        });
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        return result('SUCCESS');
      }
      throw err;
    }

    await this.ledger.record({
      stream: 'SUBSCRIPTION',
      grossKobo: checkout.priceKobo,
      netKobo: checkout.priceKobo,
      sellerId: checkout.userId,
      pspReference: reference,
      feeConfigVersionId: checkout.feeConfigVersionId,
      referenceType: 'SellerSubscription',
      referenceId: `${updated.id}:${reference}`,
      meta: { tier: 'PLUS', idempotencyKey: checkout.idempotencyKey },
    });
    this.logger.log({
      event: 'seller_plus.activated',
      userId: checkout.userId,
      reference,
      periodEnd: periodEnd.toISOString(),
    });
    return result('SUCCESS');
  }

  async cancel(userId: string) {
    const sub = await this.getOrCreate(userId);
    if (sub.tier !== 'PLUS') {
      throw new BadRequestException('No Plus subscription to cancel');
    }
    return this.prisma.sellerSubscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });
  }

  async downgradeNow(userId: string) {
    return this.prisma.sellerSubscription.update({
      where: { userId },
      data: {
        tier: 'STARTER',
        status: 'CANCELLED',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        graceUntil: null,
      },
    });
  }

  /** Simulate failed renewal → 7-day grace then suspend. */
  async simulatePaymentFailure(userId: string) {
    const { rates } = await this.fees.getActive();
    const graceUntil = new Date(
      Date.now() + rates.sellerPlus.graceDays * 86_400_000,
    );
    return this.prisma.sellerSubscription.update({
      where: { userId },
      data: { status: 'PAST_DUE', graceUntil },
    });
  }

  async tick() {
    const now = new Date();
    const pastDue = await this.prisma.sellerSubscription.findMany({
      where: { status: 'PAST_DUE', graceUntil: { lte: now } },
    });
    for (const s of pastDue) {
      await this.prisma.sellerSubscription.update({
        where: { id: s.id },
        data: { status: 'SUSPENDED', tier: 'STARTER' },
      });
    }
    const cancelDue = await this.prisma.sellerSubscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
        status: 'ACTIVE',
      },
    });
    for (const s of cancelDue) {
      await this.prisma.sellerSubscription.update({
        where: { id: s.id },
        data: {
          status: 'CANCELLED',
          tier: 'STARTER',
          cancelAtPeriodEnd: false,
        },
      });
    }
  }
}
