/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { MockPsp } from '../providers/mock-psp';
import {
  PspRejectedError,
  transferReferenceFor,
} from '../providers/payment.provider';
import {
  computeOrderTotalKobo,
  computeProtectionFeeKobo,
} from './order-fees';
import { OrderStateMachine } from './order-state.machine';
import { mockAddressesService } from '../test/addresses.mock';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { DisputesService } from '../disputes/disputes.service';
import type { NotificationsService } from '../notifications/notifications.service';

function mockNotifications(): NotificationsService {
  return {
    log: jest.fn(),
    notify: jest.fn(async () => ({ created: [], skipped: [] })),
  } as unknown as NotificationsService;
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    reference: 'RW-ORD-TESTORDER1',
    listingId: 'listing-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    paymentId: null as string | null,
    offerId: null as string | null,
    orderIntentId: null as string | null,
    amountKobo: 100_000_00,
    protectionFeeKobo: 250_000,
    deliveryFeeKobo: 0,
    totalKobo: 102_500_00,
    fulfilmentMethod: 'PICKUP' as const,
    status: 'PAYMENT_PENDING' as string,
    buyerProtection: true,
    coverageEndsAt: null as Date | null,
    autoReleaseAt: null as Date | null,
    fundedAt: null as Date | null,
    completedAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockRefundTable(rows: any[] = []) {
  let n = 0;
  const statusOk = (actual: string, f: any) => {
    if (f == null) return true;
    if (typeof f === 'string') return actual === f;
    if (f.not) return actual !== f.not;
    if (f.in) return f.in.includes(actual);
    return true;
  };
  const match = (r: any, where: any = {}) =>
    (!where.id || r.id === where.id) &&
    (!where.paymentId || r.paymentId === where.paymentId) &&
    statusOk(r.status, where.status);
  return {
    findUnique: jest.fn(async ({ where }: any) =>
      rows.find(
        (r) =>
          (where.idempotencyKey && r.idempotencyKey === where.idempotencyKey) ||
          (where.id && r.id === where.id),
      ) ?? null,
    ),
    findMany: jest.fn(async (args: any = {}) =>
      rows.filter((r) => match(r, args.where)),
    ),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `refund-${++n}`, createdAt: new Date(), ...data };
      rows.push(row);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => match(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
  };
}

function matchesStatus(
  actual: string,
  filter?: string | { in?: string[] },
): boolean {
  if (!filter) return true;
  if (typeof filter === 'string') return actual === filter;
  return filter.in?.includes(actual) ?? true;
}

function basePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    payerId: 'buyer-1',
    payeeId: 'seller-1',
    provider: 'mock-psp',
    reference: 'RW-PAY-TESTPAY1',
    amountKobo: 102_500_00,
    status: 'PENDING' as string,
    idempotencyKey: null as string | null,
    providerPayload: { checkoutUrl: 'https://mock-psp.local/checkout/RW-PAY-TESTPAY1' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('order fee math', () => {
  it('applies 2.5% with ₦5000 cap', () => {
    expect(computeProtectionFeeKobo(100_000_00)).toBe(250_000);
    expect(computeProtectionFeeKobo(1_000_000_00)).toBe(500_000);
    expect(computeProtectionFeeKobo(1)).toBe(1);
  });

  it('total = amount + protection + delivery', () => {
    const fee = computeProtectionFeeKobo(40_000_00);
    expect(
      computeOrderTotalKobo({
        amountKobo: 40_000_00,
        protectionFeeKobo: fee,
        deliveryFeeKobo: 500_00,
      }),
    ).toBe(40_000_00 + fee + 500_00);
  });

  it('property: fee never exceeds cap or ceil(amount*pct)', () => {
    const amounts = [0, 1, 99, 100_00, 50_000_00, 200_000_00, 999_999_99];
    for (const a of amounts) {
      const fee = computeProtectionFeeKobo(a);
      expect(fee).toBeLessThanOrEqual(500_000);
      expect(fee).toBe(Math.min(Math.ceil(a * 0.025), 500_000));
    }
  });
});

describe('OrderStateMachine', () => {
  it('allows escrow happy path transitions', () => {
    OrderStateMachine.assertTransition('CREATED', 'PAYMENT_PENDING');
    OrderStateMachine.assertTransition('PAYMENT_PENDING', 'FUNDED');
    OrderStateMachine.assertTransition('FUNDED', 'HANDED_OVER');
    OrderStateMachine.assertTransition('FUNDED', 'SHIPPED');
    OrderStateMachine.assertTransition('SHIPPED', 'DELIVERED');
    OrderStateMachine.assertTransition('DELIVERED', 'RECEIVED');
    OrderStateMachine.assertTransition('HANDED_OVER', 'RECEIVED');
    OrderStateMachine.assertTransition('RECEIVED', 'COMPLETED');
  });

  it('rejects invalid transitions', () => {
    expect(() =>
      OrderStateMachine.assertTransition('COMPLETED', 'FUNDED'),
    ).toThrow();
  });
});

describe('MockPsp', () => {
  it('initiate → simulate success; release/refund idempotent', async () => {
    const psp = new MockPsp();
    const init = await psp.initiate({
      amountKobo: 1000,
      currency: 'NGN',
      reference: 'r1',
      email: 'a@b.c',
      idempotencyKey: 'k1',
    });
    expect(init.status).toBe('pending');
    expect(init.checkoutUrl).toContain('r1');

    const again = await psp.initiate({
      amountKobo: 1000,
      currency: 'NGN',
      reference: 'r1',
      email: 'a@b.c',
      idempotencyKey: 'k1',
    });
    expect(again.paymentId).toBe(init.paymentId);

    psp.simulateWebhookSuccess('r1');
    psp.simulateWebhookSuccess('r1');
    expect((await psp.verify('r1')).status).toBe('success');

    const rel1 = await psp.release({
      reference: 'r1',
      amountKobo: 900,
      idempotencyKey: 'rel-1',
    });
    const rel2 = await psp.release({
      reference: 'r1',
      amountKobo: 900,
      idempotencyKey: 'rel-1',
    });
    expect(rel2).toEqual(rel1);
  });
});

describe('escrow happy path + webhook replay', () => {
  const config = {
    get: (k: string) => {
      const map: Record<string, string> = {
        BUYER_PROTECTION_FEE_PCT: '0.025',
        BUYER_PROTECTION_FEE_CAP_KOBO: '500000',
        ORDER_AUTO_RELEASE_DAYS: '3',
        BUYER_PROTECTION_COVERAGE_DAYS: '7',
      };
      return map[k];
    },
  } as unknown as ConfigService;
  const notifications = mockNotifications();
  const psp = new MockPsp();

  function makePrisma(state: {
    order: ReturnType<typeof baseOrder>;
    payment: ReturnType<typeof basePayment>;
    payouts: unknown[];
    idem: Map<string, unknown>;
  }): any {
    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => ({ ...state.order })),
        findUniqueOrThrow: jest.fn(async () => ({ ...state.order })),
        findMany: jest.fn(async () => []),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state.order, data);
          return { ...state.order };
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: {
              status?: string | { in?: string[] };
              id?: string;
              paymentId?: null;
            };
            data: Record<string, unknown>;
          }) => {
            if (where.id && where.id !== state.order.id) return { count: 0 };
            if (where.paymentId === null && state.order.paymentId) {
              return { count: 0 };
            }
            const statusOk = (() => {
              if (!where.status) return true;
              if (typeof where.status === 'string') {
                return state.order.status === where.status;
              }
              return where.status.in?.includes(state.order.status) ?? true;
            })();
            if (!statusOk) return { count: 0 };
            Object.assign(state.order, data);
            return { count: 1 };
          },
        ),
        create: jest.fn(),
      },
      orderEvent: {
        create: jest.fn(async () => ({})),
        findFirst: jest.fn(async () => null),
      },
      payment: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: { reference?: string; idempotencyKey?: string; id?: string };
          }) => {
            if (where.reference && where.reference === state.payment.reference) {
              return { ...state.payment };
            }
            if (
              where.idempotencyKey &&
              where.idempotencyKey === state.payment.idempotencyKey
            ) {
              return { ...state.payment };
            }
            if (where.id === state.payment.id) return { ...state.payment };
            return null;
          },
        ),
        findFirst: jest.fn(
          async (args?: { where?: { status?: string | { in?: string[] } } }) =>
            matchesStatus(state.payment.status, args?.where?.status)
              ? { ...state.payment }
              : null,
        ),
        findMany: jest.fn(
          async (args?: { where?: { status?: string | { in?: string[] } } }) =>
            matchesStatus(state.payment.status, args?.where?.status)
              ? [{ ...state.payment }]
              : [],
        ),
        findUniqueOrThrow: jest.fn(async () => ({ ...state.payment })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state.payment, data, { id: 'pay-1' });
          return { ...state.payment };
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state.payment, data);
          return { ...state.payment };
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id?: string; status?: string | { in?: string[] } };
            data: Record<string, unknown>;
          }) => {
            if (where.id && where.id !== state.payment.id) return { count: 0 };
            if (!matchesStatus(state.payment.status, where.status)) {
              return { count: 0 };
            }
            Object.assign(state.payment, data);
            return { count: 1 };
          },
        ),
      },
      financeAlert: { create: jest.fn(async (args: { data: unknown }) => args.data) },
      payout: {
        findFirst: jest.fn(async (args?: any) =>
          (state.payouts as any[]).find((p) =>
            matchesStatus(p.status, args?.where?.status),
          ) ?? null,
        ),
        findMany: jest.fn(async (args?: any) =>
          (state.payouts as any[])
            .filter((p) => matchesStatus(p.status, args?.where?.status))
            .map((p) => ({
              ...p,
              order: { sellerId: state.order.sellerId, status: state.order.status },
            })),
        ),
        create: jest.fn(async ({ data }: { data: any }) => {
          const row = {
            id: `payout-${state.payouts.length + 1}`,
            failureReason: null,
            createdAt: new Date(),
            ...data,
          };
          state.payouts.push(row);
          return { ...row };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = (state.payouts as any[]).find((p) => p.id === where.id);
          Object.assign(row, data);
          return { ...row };
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = (state.payouts as any[]).find(
            (p) => p.id === where.id && matchesStatus(p.status, where.status),
          );
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
      sellerPayoutAccount: {
        findUnique: jest.fn(async () => ({
          id: 'acct-1',
          userId: 'seller-1',
          bankCode: '058',
          accountNumber: '0123456789',
          firstName: 'Ada',
          middleName: '',
          lastName: 'Demo',
          nibssAccountName: 'Ada Demo',
          verifiedAt: new Date(),
          paystackRecipientCode: null,
          paystackRecipientBankCode: null,
          paystackRecipientAccountNumber: null,
        })),
        update: jest.fn(async () => ({})),
      },
      idempotencyRecord: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          state.idem.get(where.key)
            ? { key: where.key, responseJson: state.idem.get(where.key) }
            : null,
        ),
        create: jest.fn(async ({ data }: any) => {
          if (state.idem.has(data.key)) {
            throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
          }
          state.idem.set(data.key, data.responseJson);
          return data;
        }),
        upsert: jest.fn(
          async ({
            where,
            create,
          }: {
            where: { key: string };
            create: { responseJson: unknown };
          }) => {
            state.idem.set(where.key, create.responseJson);
            return create;
          },
        ),
      },
      listing: {
        findUnique: jest.fn(async () => ({
          id: 'listing-1',
          status: 'RESERVED',
          sellerId: 'seller-1',
          priceKobo: 100_000_00,
        })),
        update: jest.fn(async () => ({})),
      },
      favourite: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      listingEvent: { create: jest.fn(async () => ({})) },
      user: {
        findUnique: jest.fn(async () => ({
          id: 'buyer-1',
          email: 'buyer@test.local',
        })),
      },
      orderIntent: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      offer: { findUnique: jest.fn() },
      refund: mockRefundTable(),
      revenueLine: { updateMany: jest.fn(async () => ({ count: 0 })) },
      dispute: {
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(async () => []),
      },
      disputeEvidence: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    return prisma;
  }

  it('initiate → webhook → handed_over → confirm → release → payout once', async () => {
    const state = {
      order: baseOrder(),
      payment: basePayment(),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const prisma = makePrisma(state);
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    const payments = new PaymentsService(
      prisma as never,
      orders,
      notifications,
      {
        getActive: jest.fn().mockResolvedValue({
          id: 'fee-1',
          version: 1,
          rates: {
            protectionFeePct: 0.025,
            protectionFeeCapKobo: 500_000,
            deliveryMarginPct: 0.15,
          },
        }),
      } as never,
      { record: jest.fn().mockResolvedValue({}) } as never,
      psp,
    );

    await psp.initiate({
      amountKobo: state.order.totalKobo,
      currency: 'NGN',
      reference: 'ref-1',
      email: 'buyer@test.local',
      idempotencyKey: 'idem-1',
    });

    const pay = await payments.initiate('buyer-1', {
      orderId: 'order-1',
      idempotencyKey: 'idem-1',
    });
    const pay2 = await payments.initiate('buyer-1', {
      orderId: 'order-1',
      idempotencyKey: 'idem-1',
    });
    expect(pay2.id).toBe(pay.id);
    expect(state.order.paymentId).toBe('pay-1');

    await payments.handleMockWebhook({ reference: pay.reference });
    expect(state.order.status).toBe('FUNDED');
    expect(state.payment.status).toBe('SUCCESS');

    await payments.handleMockWebhook({ reference: pay.reference });
    await payments.handleMockWebhook({ reference: pay.reference });
    await payments.handleMockWebhook({ reference: pay.reference });
    expect(state.order.status).toBe('FUNDED');

    state.order.status = 'FUNDED';
    await orders.markHandedOver('order-1', 'seller-1');
    expect(state.order.status).toBe('HANDED_OVER');

    await orders.confirmReceipt('order-1', 'buyer-1');
    // Payout waits for buyer protection to end.
    expect(state.order.status).toBe('RECEIVED');
    expect(state.payouts).toHaveLength(0);
    expect(state.order.coverageEndsAt).toBeInstanceOf(Date);

    prisma.order.findMany = jest.fn(async () => [{ id: 'order-1' }]);
    await expect(
      orders.releaseEscrow('order-1', null, 'cover_ended'),
    ).rejects.toThrow('not ended');
    expect(await orders.releaseAfterCover()).toBe(0);

    state.order.coverageEndsAt = new Date(Date.now() - 1000);
    expect(await orders.releaseAfterCover()).toBe(1);
    expect(state.order.status).toBe('COMPLETED');
    expect(state.payouts).toHaveLength(1);
    expect(state.payment.status).toBe('RELEASED');

    await orders.releaseEscrow('order-1', null, 'cover_ended');
    expect(state.payouts).toHaveLength(1);
  });

  it('auto-release cron releases handed-over orders past autoReleaseAt', async () => {
    const state = {
      order: baseOrder({
        status: 'HANDED_OVER',
        fundedAt: new Date(Date.now() - 4 * 86400000),
        autoReleaseAt: new Date(Date.now() - 1000),
      }),
      payment: basePayment({ status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    await psp.initiate({
      amountKobo: state.order.totalKobo,
      currency: 'NGN',
      reference: 'ref-auto',
      email: 'b@t.c',
      idempotencyKey: 'auto-1',
    });
    psp.simulateWebhookSuccess('ref-auto');
    state.payment.reference = 'ref-auto';

    const prisma = makePrisma(state);
    prisma.order.findMany = jest.fn(async () => [{ ...state.order }]);
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    const n = await orders.autoReleaseDue();
    expect(n).toBe(1);
    // Silence counts as receipt: cover starts, no money moves yet.
    expect(state.order.status).toBe('RECEIVED');
    expect(state.payouts).toHaveLength(0);

    state.order.coverageEndsAt = new Date(Date.now() - 1000);
    prisma.order.findMany = jest.fn(async () => [{ id: 'order-1' }]);
    expect(await orders.releaseAfterCover()).toBe(1);
    expect(state.order.status).toBe('COMPLETED');
    expect(state.payouts).toHaveLength(1);
  });

  function makeServices(
    state: Parameters<typeof makePrisma>[0],
    pspOverride: MockPsp = psp,
  ) {
    const prisma = makePrisma(state);
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      pspOverride,
    );
    const payments = new PaymentsService(
      prisma as never,
      orders,
      notifications,
      {
        getActive: jest.fn().mockResolvedValue({
          id: 'fee-1',
          version: 1,
          rates: {
            protectionFeePct: 0.025,
            protectionFeeCapKobo: 500_000,
            deliveryMarginPct: 0.15,
          },
        }),
      } as never,
      { record: jest.fn().mockResolvedValue({}) } as never,
      pspOverride,
    );
    return { prisma, orders, payments };
  }

  it('a second payment on an already funded order is refunded', async () => {
    await psp.initiate({
      amountKobo: 102_500_00,
      currency: 'NGN',
      reference: 'ref-dup',
      email: 'b@t.c',
      idempotencyKey: 'dup-1',
    });
    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-0' }),
      payment: basePayment({ reference: 'ref-dup' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, payments } = makeServices(state);

    await payments.handleMockWebhook({ reference: 'ref-dup' });

    expect(state.payment.status).toBe('REFUNDED');
    expect(state.order.paymentId).toBe('pay-0');
    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: 'pay-1',
          amountKobo: 102_500_00,
          idempotencyKey: 'auto-refund:pay-1',
        }),
      }),
    );
    expect(psp.getStored('ref-dup')?.refundedKobo).toBe(102_500_00);
  });

  it('paying an old checkout after cancelling is refunded', async () => {
    await psp.initiate({
      amountKobo: 102_500_00,
      currency: 'NGN',
      reference: 'ref-cxl',
      email: 'b@t.c',
      idempotencyKey: 'cxl-1',
    });
    const state = {
      order: baseOrder({ paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-cxl' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders, payments } = makeServices(state);

    await orders.cancel('order-1', 'buyer-1');
    expect(state.order.status).toBe('CANCELLED');
    expect(state.payment.status).toBe('FAILED');

    // Buyer finishes the Paystack page in another tab anyway.
    await payments.handleMockWebhook({ reference: 'ref-cxl' });

    expect(state.order.status).toBe('CANCELLED');
    expect(state.payment.status).toBe('REFUNDED');
    expect(prisma.refund.create).toHaveBeenCalledTimes(1);
  });

  it('cancel is refused once the open checkout has been paid', async () => {
    await psp.initiate({
      amountKobo: 102_500_00,
      currency: 'NGN',
      reference: 'ref-paid',
      email: 'b@t.c',
      idempotencyKey: 'paid-1',
    });
    psp.simulateWebhookSuccess('ref-paid');
    const state = {
      order: baseOrder(),
      payment: basePayment({ reference: 'ref-paid' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { orders } = makeServices(state);

    await expect(orders.cancel('order-1', 'buyer-1')).rejects.toThrow(
      'already been paid',
    );
    expect(state.order.status).toBe('PAYMENT_PENDING');
  });

  it('a second checkout attempt reuses the open one', async () => {
    const state = {
      order: baseOrder(),
      payment: basePayment({ reference: 'ref-never-started' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, payments } = makeServices(state);

    const first = await payments.initiate('buyer-1', {
      orderId: 'order-1',
      idempotencyKey: 'click-1',
    });
    const second = await payments.initiate('buyer-1', {
      orderId: 'order-1',
      idempotencyKey: 'click-2',
    });

    expect(second.reference).toBe(first.reference);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
  });

  it('an idempotency key from another buyer is rejected', async () => {
    const state = {
      order: baseOrder(),
      payment: basePayment({ idempotencyKey: 'shared-key' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { payments } = makeServices(state);
    await expect(
      payments.initiate('buyer-2', {
        orderId: 'order-1',
        idempotencyKey: 'shared-key',
      }),
    ).rejects.toThrow('new idempotency key');
  });

  /** MockPsp whose refunds stay pending, like Paystack's queue. */
  function queuedRefundPsp(): MockPsp {
    const queued = new MockPsp();
    queued.refund = async (input) => ({
      reference: input.reference,
      amountKobo: input.amountKobo,
      status: 'pending',
      providerRef: 'rf_123',
    });
    return queued;
  }

  async function fundedRef(p: MockPsp, reference: string) {
    await p.initiate({
      amountKobo: 102_500_00,
      currency: 'NGN',
      reference,
      email: 'b@t.c',
      idempotencyKey: `init-${reference}`,
    });
    p.simulateWebhookSuccess(reference);
  }

  it('seller cancels a paid order: full refund, buyer told, no double refund', async () => {
    await fundedRef(psp, 'ref-scancel');
    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-scancel', status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    (notifications.notify as jest.Mock).mockClear();

    const dto = await orders.cancel('order-1', 'seller-1', 'Item damaged');

    expect(state.order.status).toBe('CANCELLED');
    expect(state.payment.status).toBe('REFUNDED');
    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountKobo: 102_500_00,
          reason: 'order_cancelled_by_seller',
          idempotencyKey: 'cancel-refund:order-1',
          status: 'REFUNDED',
        }),
      }),
    );
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'CANCELLED_AFTER_PAYMENT' }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'buyer-1', title: 'Order cancelled' }),
    );
    expect(dto.status).toBe('CANCELLED');

    await expect(orders.cancel('order-1', 'seller-1')).rejects.toThrow();
    expect(prisma.refund.create).toHaveBeenCalledTimes(1);
  });

  it('buyer can cancel a paid order, but not after handover', async () => {
    await fundedRef(psp, 'ref-bcancel');
    const shipped = {
      order: baseOrder({ status: 'HANDED_OVER', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-bcancel', status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const late = makeServices(shipped);
    await expect(late.orders.cancel('order-1', 'buyer-1')).rejects.toThrow(
      'already been handed over',
    );
    expect(late.prisma.refund.create).not.toHaveBeenCalled();

    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-bcancel', status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { orders } = makeServices(state);
    await expect(orders.cancel('order-1', 'stranger')).rejects.toThrow(
      'Not a participant',
    );
    await orders.cancel('order-1', 'buyer-1');
    expect(state.order.status).toBe('CANCELLED');
    expect(state.payment.status).toBe('REFUNDED');
  });

  it('handover after a cancel is refused (no overwrite)', async () => {
    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-1' }),
      payment: basePayment({ status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    // Cancel lands between the seller reading FUNDED and writing SHIPPED.
    prisma.order.updateMany.mockImplementationOnce(async () => ({ count: 0 }));
    await expect(orders.markHandedOver('order-1', 'seller-1')).rejects.toThrow(
      'changed',
    );
  });

  it('queued Paystack refund settles on refund.processed', async () => {
    const queued = queuedRefundPsp();
    await fundedRef(queued, 'ref-queued');
    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-queued', status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders, payments } = makeServices(state, queued);

    await orders.cancel('order-1', 'buyer-1');
    const [row] = await prisma.refund.findMany({});
    expect(row.status).toBe('PENDING');
    expect(state.payment.status).toBe('REFUNDED');
    expect((state.payment.providerPayload as any).refunds[0]).toEqual(
      expect.objectContaining({ refundId: row.id, providerRef: 'rf_123' }),
    );
    expect(prisma.revenueLine.updateMany).not.toHaveBeenCalled();

    const webhook = (event: string) =>
      payments.handleWebhook('{}', 'mock-ok', {
        event,
        data: {
          id: 'rf_123',
          status: event.split('.')[1],
          transaction_reference: 'ref-queued',
          amount: String(102_500_00),
        },
      });
    await webhook('refund.pending');
    expect(row.status).toBe('PENDING');
    await webhook('refund.processed');
    expect(row.status).toBe('REFUNDED');
    expect(prisma.revenueLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pspReference: 'ref-queued', status: 'SETTLED' },
      }),
    );
    await webhook('refund.processed');
    expect(prisma.revenueLine.updateMany).toHaveBeenCalledTimes(1);
  });

  it('failed Paystack refund restores the payment and alerts finance', async () => {
    const queued = queuedRefundPsp();
    await fundedRef(queued, 'ref-rfail');
    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-rfail', status: 'SUCCESS' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state, queued);
    await orders.cancel('order-1', 'seller-1');
    expect(state.payment.status).toBe('REFUNDED');

    // No Paystack refund id this time: matched by charge + amount.
    await orders.applyRefundWebhook({
      paymentReference: 'ref-rfail',
      event: 'refund.failed',
      amountKobo: 102_500_00,
    });
    const [row] = await prisma.refund.findMany({});
    expect(row.status).toBe('FAILED');
    expect(state.payment.status).toBe('SUCCESS');
    expect(prisma.financeAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'REFUND_FAILED', severity: 'critical' }),
      }),
    );
  });

  it('unpaid orders expire after the payment window', async () => {
    const state = {
      order: baseOrder({ createdAt: new Date(Date.now() - 25 * 3_600_000) }),
      payment: basePayment({ reference: 'ref-never-paid', status: 'FAILED' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    prisma.order.findMany = jest.fn(async () => [{ ...state.order }]);
    // Seller confirmed 2h ago: still inside the window.
    prisma.orderEvent.findFirst = jest.fn(async () => ({
      createdAt: new Date(Date.now() - 2 * 3_600_000),
    }));
    expect(await orders.expireUnpaid()).toBe(0);
    expect(state.order.status).toBe('PAYMENT_PENDING');

    prisma.orderEvent.findFirst = jest.fn(async () => null);
    (notifications.notify as jest.Mock).mockClear();
    expect(await orders.expireUnpaid()).toBe(1);
    expect(state.order.status).toBe('CANCELLED');
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'PAYMENT_EXPIRED', actorUserId: null }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'buyer-1', title: 'Order expired' }),
    );
  });

  it('expiry leaves an order whose open checkout was paid', async () => {
    await fundedRef(psp, 'ref-late-pay');
    const state = {
      order: baseOrder({ createdAt: new Date(Date.now() - 30 * 3_600_000) }),
      payment: basePayment({ reference: 'ref-late-pay' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    prisma.order.findMany = jest.fn(async () => [{ ...state.order }]);
    expect(await orders.expireUnpaid()).toBe(0);
    expect(state.order.status).toBe('PAYMENT_PENDING');
  });

  function disputeFor(
    prisma: any,
    orders: OrdersService,
    state: Parameters<typeof makePrisma>[0],
  ) {
    const dispute: any = {
      id: 'disp-x',
      orderId: 'order-1',
      openerId: 'buyer-1',
      status: 'AWAITING_ADMIN',
      resolution: null,
      get order() {
        return { ...state.order };
      },
    };
    prisma.dispute.findUnique = jest.fn(async () => dispute);
    prisma.dispute.update = jest.fn(async ({ data }: any) => {
      Object.assign(dispute, data);
      return { ...dispute };
    });
    const disputes = new DisputesService(
      prisma as never,
      orders,
      notifications,
      { log: jest.fn().mockResolvedValue(null) } as never,
      psp,
    );
    return { dispute, disputes };
  }

  it('partial dispute refund comes out of the seller share; rest released', async () => {
    await fundedRef(psp, 'ref-split');
    const state = {
      order: baseOrder({ status: 'DISPUTE_HOLD', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-split', status: 'SUCCESS' }),
      payouts: [] as any[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    const { disputes } = disputeFor(prisma, orders, state);
    const release = jest.spyOn(psp, 'release');

    // Item ₦100,000; buyer gets ₦30,000 back; seller gets ₦70,000.
    await disputes.resolve('disp-x', 'admin-1', {
      resolution: 'PARTIAL_REFUND',
      amountKobo: 30_000_00,
    });

    const refunds = await prisma.refund.findMany({});
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amountKobo).toBe(30_000_00);
    expect(state.payouts).toHaveLength(1);
    expect(state.payouts[0]).toEqual(
      expect.objectContaining({ netKobo: 70_000_00 }),
    );
    expect(release).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'ref-split', amountKobo: 70_000_00 }),
    );
    release.mockRestore();
    expect(state.order.status).toBe('COMPLETED');
    expect(state.payment.status).toBe('PARTIALLY_REFUNDED');
  });

  it('dispute CANCEL refunds everything and puts the units back', async () => {
    await fundedRef(psp, 'ref-dcancel');
    const state = {
      order: baseOrder({ status: 'DISPUTE_HOLD', paymentId: 'pay-1' }),
      payment: basePayment({ reference: 'ref-dcancel', status: 'SUCCESS' }),
      payouts: [] as any[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    const { disputes, dispute } = disputeFor(prisma, orders, state);

    await disputes.resolve('disp-x', 'admin-1', { resolution: 'CANCEL' });

    expect(dispute.status).toBe('RESOLVED');
    expect(state.order.status).toBe('CANCELLED');
    expect(state.payment.status).toBe('REFUNDED');
    const [refund] = await prisma.refund.findMany({});
    expect(refund.amountKobo).toBe(102_500_00);
    expect(refund.reason).toBe('dispute_cancel');
    expect(state.payouts).toHaveLength(0);
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DISPUTE_CANCELLED' }),
      }),
    );
  });

  it('refund resolutions are refused once the seller has been paid', async () => {
    const state = {
      order: baseOrder({ status: 'DISPUTE_HOLD', paymentId: 'pay-1' }),
      payment: basePayment({ status: 'RELEASED' }),
      payouts: [{ status: 'PAID', netKobo: 100_000_00 }] as any[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    const { disputes, dispute } = disputeFor(prisma, orders, state);
    for (const resolution of ['FULL_REFUND', 'PARTIAL_REFUND', 'CANCEL'] as const) {
      await expect(
        disputes.resolve('disp-x', 'admin-1', {
          resolution,
          amountKobo: resolution === 'PARTIAL_REFUND' ? 1_000_00 : undefined,
        }),
      ).rejects.toThrow('already been paid');
    }
    expect(dispute.status).toBe('AWAITING_ADMIN');
    expect(prisma.refund.create).not.toHaveBeenCalled();
  });

  it('escrow is never released before receipt', async () => {
    const state = {
      order: baseOrder({ status: 'FUNDED', paymentId: 'pay-1' }),
      payment: basePayment({ status: 'SUCCESS' }),
      payouts: [] as any[],
      idem: new Map<string, unknown>(),
    };
    const { orders } = makeServices(state);
    await expect(
      orders.releaseEscrow('order-1', null, 'cover_ended'),
    ).rejects.toThrow('cannot be released while the order is FUNDED');
    expect(state.payouts).toHaveLength(0);
  });

  it('no bank account: seller is nudged once a day, not every run', async () => {
    await fundedRef(psp, 'ref-nobank');
    const state = {
      order: baseOrder({
        status: 'RECEIVED',
        paymentId: 'pay-1',
        coverageEndsAt: new Date(Date.now() - 1000),
      }),
      payment: basePayment({ reference: 'ref-nobank', status: 'SUCCESS' }),
      payouts: [] as any[],
      idem: new Map<string, unknown>(),
    };
    const { prisma, orders } = makeServices(state);
    prisma.order.findMany = jest.fn(async () => [{ id: 'order-1' }]);
    prisma.sellerPayoutAccount.findUnique = jest.fn(async () => null);
    const events: any[] = [];
    prisma.orderEvent.create = jest.fn(async ({ data }: any) => {
      events.push({ ...data, createdAt: new Date() });
      return data;
    });
    prisma.orderEvent.findFirst = jest.fn(async ({ where }: any) =>
      events.find((e) => e.type === where.type) ?? null,
    );
    (notifications.notify as jest.Mock).mockClear();

    expect(await orders.releaseAfterCover()).toBe(0);
    expect(await orders.releaseAfterCover()).toBe(0);
    expect(await orders.releaseAfterCover()).toBe(0);

    const nudges = (notifications.notify as jest.Mock).mock.calls.filter(
      ([arg]) => arg.title === 'Add a bank account to get paid',
    );
    expect(nudges).toHaveLength(1);
    expect(state.order.status).toBe('RECEIVED');
    expect(state.payouts).toHaveLength(0);
  });


  it('payment emails go to buyer and seller, even with the Email switch off', async () => {
    await fundedRef(psp, 'ref-emails');
    const state = {
      order: baseOrder({ deliveryDate: new Date('2026-12-01T10:00:00Z') }),
      payment: basePayment({ reference: 'ref-emails' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { payments } = makeServices(state);
    (notifications.notify as jest.Mock).mockClear();

    await payments.handleMockWebhook({ reference: 'ref-emails' });
    expect(state.order.status).toBe('FUNDED');

    const calls = (notifications.notify as jest.Mock).mock.calls.map(([a]) => a);
    const receipt = calls.find((c) => String(c.title).startsWith('Receipt —'));
    const sale = calls.find((c) => String(c.title).startsWith('New sale —'));
    expect(receipt).toEqual(
      expect.objectContaining({ userId: 'buyer-1', channels: ['EMAIL'], transactional: true }),
    );
    expect(sale).toEqual(
      expect.objectContaining({ userId: 'seller-1', channels: ['EMAIL'], transactional: true }),
    );
    expect(sale.body).toContain('Mark handed over');
    expect(sale.body).toContain('7 days after the buyer confirms');
    // In-app notices no longer also send a duplicate email.
    for (const c of calls.filter((x) => x.title === 'Payment received' || x.title === 'Payment confirmed')) {
      expect(c.channels).toEqual(['IN_APP', 'PUSH']);
    }
  });

  it('an email provider failure does not stop the order being funded', async () => {
    await fundedRef(psp, 'ref-email-down');
    const state = {
      order: baseOrder(),
      payment: basePayment({ reference: 'ref-email-down' }),
      payouts: [] as unknown[],
      idem: new Map<string, unknown>(),
    };
    const { payments } = makeServices(state);
    const notify = notifications.notify as jest.Mock;
    const original = notify.getMockImplementation();
    notify.mockImplementation(async (input: { channels?: string[] }) => {
      if (input.channels?.includes('EMAIL')) throw new Error('Resend 503');
      return { created: [], skipped: [] };
    });
    try {
      await payments.handleMockWebhook({ reference: 'ref-email-down' });
    } finally {
      notify.mockImplementation(original);
    }
    expect(state.order.status).toBe('FUNDED');
    expect(state.payment.status).toBe('SUCCESS');
  });

  describe('seller transfer bookkeeping (write-ahead payout)', () => {
    function receivedState(reference: string) {
      return {
        order: baseOrder({
          status: 'RECEIVED',
          paymentId: 'pay-1',
          coverageEndsAt: new Date(Date.now() - 1000),
        }),
        payment: basePayment({ reference, status: 'SUCCESS' }),
        payouts: [] as any[],
        idem: new Map<string, unknown>(),
      };
    }
    async function freshPsp(reference: string): Promise<MockPsp> {
      const p = new MockPsp();
      await fundedRef(p, reference);
      return p;
    }

    it('transfer references match the Paystack format', () => {
      for (const ref of ['RW-PAY-ABC123DEF456', 'ref-auto', 'x']) {
        for (const attempt of [1, 2, 7]) {
          const t = transferReferenceFor(ref, attempt);
          expect(t).toMatch(/^[a-z0-9_-]{16,50}$/);
        }
      }
      expect(transferReferenceFor('RW-PAY-ABC123DEF456')).toBe(
        'rel_rw-pay-abc123def456',
      );
      expect(transferReferenceFor('RW-PAY-ABC123DEF456', 2)).toBe(
        'rel_rw-pay-abc123def456_2',
      );
    });

    it('payout is recorded before Paystack is called', async () => {
      const p = await freshPsp('RW-PAY-WRITEAHEAD1');
      const state = receivedState('RW-PAY-WRITEAHEAD1');
      const { orders } = makeServices(state, p);
      const seen: any[] = [];
      const send = p.release.bind(p);
      p.release = async (input) => {
        seen.push(state.payouts.map((r: any) => ({ ...r })));
        return send(input);
      };
      await orders.releaseEscrow('order-1', null, 'cover_ended');
      expect(seen[0]).toEqual([
        expect.objectContaining({
          status: 'PROCESSING',
          pspReference: 'rel_rw-pay-writeahead1',
          netKobo: 100_000_00,
        }),
      ]);
      expect(state.payouts[0].status).toBe('PAID');
      expect(state.order.status).toBe('COMPLETED');
    });

    it('DB failure after Paystack accepted: never resent, reconciled to PAID', async () => {
      const p = await freshPsp('RW-PAY-DBFAIL0001');
      const state = receivedState('RW-PAY-DBFAIL0001');
      const { prisma, orders } = makeServices(state, p);
      const release = jest.spyOn(p, 'release');
      const realTx = prisma.$transaction;
      let txCalls = 0;
      prisma.$transaction = jest.fn(async (fn: any) => {
        txCalls++;
        if (txCalls === 2) throw new Error('connection reset');
        return realTx(fn);
      });

      await expect(
        orders.releaseEscrow('order-1', null, 'cover_ended'),
      ).rejects.toThrow('connection reset');
      expect(release).toHaveBeenCalledTimes(1);
      expect(state.payouts).toHaveLength(1);
      expect(state.payouts[0]).toEqual(
        expect.objectContaining({
          status: 'PROCESSING',
          pspReference: 'rel_rw-pay-dbfail0001',
        }),
      );
      prisma.$transaction = realTx;

      // Next job run finishes the order without a second transfer.
      await orders.releaseEscrow('order-1', null, 'cover_ended');
      expect(release).toHaveBeenCalledTimes(1);
      expect(state.order.status).toBe('COMPLETED');

      // Reconciler confirms with Paystack.
      state.payouts[0].createdAt = new Date(Date.now() - 10 * 60_000);
      expect(await orders.reconcileProcessingPayouts()).toBe(1);
      expect(state.payouts[0].status).toBe('PAID');
    });

    it('timeout but Paystack made the transfer: recorded as PAID', async () => {
      const p = await freshPsp('RW-PAY-TIMEOUTOK1');
      const state = receivedState('RW-PAY-TIMEOUTOK1');
      const { orders } = makeServices(state, p);
      p.release = async (input) => {
        p.setTransferStatus(input.transferReference!, 'success');
        throw new Error('socket hang up');
      };
      (notifications.notify as jest.Mock).mockClear();

      await orders.releaseEscrow('order-1', null, 'cover_ended');

      expect(state.payouts[0].status).toBe('PAID');
      expect(state.order.status).toBe('COMPLETED');
      expect(notifications.notify).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Payout was not sent' }),
      );
    });

    it('timeout and Paystack has no record: held, then failed after grace', async () => {
      const p = await freshPsp('RW-PAY-TIMEOUTNO1');
      const state = receivedState('RW-PAY-TIMEOUTNO1');
      const { prisma, orders } = makeServices(state, p);
      p.release = async () => {
        throw new Error('ETIMEDOUT');
      };
      await orders.releaseEscrow('order-1', null, 'cover_ended');
      expect(state.payouts[0].status).toBe('PROCESSING');
      expect(state.payouts[0].failureReason).toMatch(/^not_found_since:/);
      expect(state.order.status).toBe('COMPLETED');

      state.payouts[0].createdAt = new Date(Date.now() - 10 * 60_000);
      expect(await orders.reconcileProcessingPayouts()).toBe(0);
      expect(state.payouts[0].status).toBe('PROCESSING');

      state.payouts[0].failureReason = `not_found_since:${new Date(
        Date.now() - 31 * 60_000,
      ).toISOString()}`;
      (notifications.notify as jest.Mock).mockClear();
      expect(await orders.reconcileProcessingPayouts()).toBe(1);
      expect(state.payouts[0].status).toBe('FAILED');
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'seller-1', title: 'Payout was not sent' }),
      );
      expect(prisma.financeAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'PAYOUT_FAILED' }),
        }),
      );
    });

    it('definite Paystack rejection: FAILED, seller can retry', async () => {
      const p = await freshPsp('RW-PAY-REJECTED01');
      const state = receivedState('RW-PAY-REJECTED01');
      const { orders } = makeServices(state, p);
      const send = p.release.bind(p);
      p.release = async () => {
        throw new PspRejectedError('Paystack release failed: 400 Insufficient balance');
      };
      await orders.releaseEscrow('order-1', null, 'cover_ended');
      expect(state.payouts[0].status).toBe('FAILED');
      expect(state.order.status).toBe('COMPLETED');

      p.release = send;
      const release = jest.spyOn(p, 'release');
      await orders.retryPayout('order-1', 'seller-1');
      expect(release).toHaveBeenCalledWith(
        expect.objectContaining({
          transferReference: 'rel_rw-pay-rejected01_2',
          amountKobo: 100_000_00,
        }),
      );
      expect(state.payouts[0].status).toBe('PAID');
      expect(state.payouts[0].pspReference).toBe('rel_rw-pay-rejected01_2');
    });

    it('retry does not resend when the "failed" transfer actually went through', async () => {
      const p = await freshPsp('RW-PAY-RETRYDUP01');
      const state = receivedState('RW-PAY-RETRYDUP01');
      state.order.status = 'COMPLETED';
      state.payouts.push({
        id: 'payout-1',
        orderId: 'order-1',
        grossKobo: 102_500_00,
        feesKobo: 2_500_00,
        netKobo: 100_000_00,
        status: 'FAILED',
        pspReference: 'rel_rw-pay-retrydup01',
        failureReason: 'transfer.failed webhook',
        createdAt: new Date(),
      });
      p.setTransferStatus('rel_rw-pay-retrydup01', 'success');
      const { orders } = makeServices(state, p);
      const release = jest.spyOn(p, 'release');

      await orders.retryPayout('order-1', 'seller-1');

      expect(release).not.toHaveBeenCalled();
      expect(state.payouts[0].status).toBe('PAID');
    });

    it('a transfer under the old uppercase reference is recorded, not resent', async () => {
      const p = await freshPsp('RW-PAY-LEGACY0001');
      p.setTransferStatus('rel_RW-PAY-LEGACY0001', 'success');
      const state = receivedState('RW-PAY-LEGACY0001');
      const { orders } = makeServices(state, p);
      const release = jest.spyOn(p, 'release');

      await orders.releaseEscrow('order-1', null, 'cover_ended');

      expect(release).not.toHaveBeenCalled();
      expect(state.payouts[0]).toEqual(
        expect.objectContaining({
          status: 'PAID',
          pspReference: 'rel_RW-PAY-LEGACY0001',
        }),
      );
      expect(state.order.status).toBe('COMPLETED');
    });

    it('a release already holding the claim is not duplicated', async () => {
      const p = await freshPsp('RW-PAY-RACE000001');
      const state = receivedState('RW-PAY-RACE000001');
      state.idem.set('payout-claim:order-1', { transferReference: 'x' });
      const { orders } = makeServices(state, p);
      const release = jest.spyOn(p, 'release');

      await orders.releaseEscrow('order-1', null, 'cover_ended');

      expect(release).not.toHaveBeenCalled();
      expect(state.payouts).toHaveLength(0);
    });
  });
});

describe('disputes', () => {
  const config = {
    get: () => undefined,
  } as unknown as ConfigService;
  const notifications = mockNotifications();
  const psp = new MockPsp();

  it('dispute → seller respond → admin full refund', async () => {
    const order = baseOrder({
      status: 'RECEIVED',
      coverageEndsAt: new Date(Date.now() + 86400000),
      totalKobo: 102_500_00,
    });
    const dispute: any = {
      id: 'disp-1',
      orderId: 'order-1',
      openerId: 'buyer-1',
      reason: 'NEVER_RECEIVED',
      status: 'AWAITING_SELLER',
      detail: null,
      sellerResponse: null,
      sellerRespondBy: new Date(Date.now() + 72 * 3600000),
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: new Date(),
      order,
      evidence: [],
    };
    const payment = basePayment({ status: 'SUCCESS', reference: 'ref-d1' });
    await psp.initiate({
      amountKobo: order.totalKobo,
      currency: 'NGN',
      reference: 'ref-d1',
      email: 'b@t.c',
      idempotencyKey: 'd1',
    });
    psp.simulateWebhookSuccess('ref-d1');

    const refunds: unknown[] = [];
    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => ({ ...order })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(order, data);
          return { ...order };
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { status?: { in?: string[] } };
            data: Record<string, unknown>;
          }) => {
            if (where.status?.in && !where.status.in.includes(order.status)) {
              return { count: 0 };
            }
            Object.assign(order, data);
            return { count: 1 };
          },
        ),
      },
      orderEvent: { create: jest.fn(async () => ({})) },
      payment: {
        findFirst: jest.fn(async () => ({ ...payment })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(payment, data);
          return { ...payment };
        }),
      },
      refund: {
        ...mockRefundTable(refunds as any[]),
      },
      revenueLine: { updateMany: jest.fn(async () => ({ count: 0 })) },
      dispute: {
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async () => ({ ...dispute, order, evidence: [] })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(dispute, data);
          return { ...dispute };
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(dispute, data);
          return { ...dispute };
        }),
        findMany: jest.fn(async () => []),
      },
      payout: { findFirst: jest.fn(async () => null), create: jest.fn() },
      idempotencyRecord: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(),
      },
      listing: {
        findUnique: jest.fn(async () => ({
          id: 'listing-1',
          status: 'RESERVED',
        })),
        update: jest.fn(),
      },
      listingEvent: { create: jest.fn() },
      favourite: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };

    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );

    await disputes.open('order-1', 'buyer-1', {
      reason: 'NEVER_RECEIVED',
      detail: 'Item never arrived',
    });
    expect(order.status).toBe('DISPUTE_HOLD');

    await disputes.sellerRespond('disp-1', 'seller-1', {
      text: 'I shipped it',
    });
    expect(dispute.status).toBe('AWAITING_ADMIN');

    await disputes.resolve('disp-1', 'admin-1', {
      resolution: 'FULL_REFUND',
      note: 'Buyer wins',
    });
    expect(dispute.status).toBe('RESOLVED');
    expect(order.status).toBe('REFUND_ISSUED');
    expect(refunds).toHaveLength(1);
    expect(payment.status).toBe('REFUNDED');
  });

  it('partial refund that covers the whole item price closes the order', async () => {
    const order = baseOrder({
      status: 'DISPUTE_HOLD',
      amountKobo: 30_000,
      totalKobo: 100_000,
    });
    const dispute: any = {
      id: 'disp-2',
      orderId: 'order-1',
      openerId: 'buyer-1',
      status: 'AWAITING_ADMIN',
      order,
    };
    const payment = basePayment({ status: 'SUCCESS', reference: 'ref-p' });
    await psp.initiate({
      amountKobo: 100_000,
      currency: 'NGN',
      reference: 'ref-p',
      email: 'b@t.c',
      idempotencyKey: 'p1',
    });
    psp.simulateWebhookSuccess('ref-p');

    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => ({ ...order })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(order, data);
          return order;
        }),
      },
      orderEvent: { create: jest.fn() },
      payment: {
        findFirst: jest.fn(async () => payment),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(payment, data);
          return payment;
        }),
      },
      payout: { findFirst: jest.fn(async () => null) },
      refund: mockRefundTable(),
      revenueLine: { updateMany: jest.fn(async () => ({ count: 0 })) },
      dispute: {
        findUnique: jest.fn(async () => dispute),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(dispute, data);
          return dispute;
        }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );
    prisma.order.updateMany = jest.fn(async ({ data }: any) => {
      Object.assign(order, data);
      return { count: 1 };
    });
    await disputes.resolve('disp-2', 'admin-1', {
      resolution: 'PARTIAL_REFUND',
      amountKobo: 40_000,
    });
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
    // ₦400 refunded > ₦300 item price: nothing left for the seller.
    expect(order.status).toBe('REFUND_ISSUED');
  });

  it('coverage window blocks late dispute', async () => {
    const order = baseOrder({
      status: 'COMPLETED',
      coverageEndsAt: new Date(Date.now() - 1000),
    });
    const prisma = {
      order: { findUnique: jest.fn(async () => order) },
      dispute: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(),
    };
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );
    await expect(
      disputes.open('order-1', 'buyer-1', { reason: 'COUNTERFEIT' }),
    ).rejects.toThrow(/coverage window/i);
  });

  it('confirm vs dispute race — first valid wins', async () => {
    const order = baseOrder({
      status: 'HANDED_OVER',
      coverageEndsAt: null,
    });
    let payout: unknown = null;
    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => ({ ...order })),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { status?: string | { in?: string[] } };
            data: Record<string, unknown>;
          }) => {
            const ok =
              typeof where.status === 'string'
                ? order.status === where.status
                : where.status?.in?.includes(order.status);
            if (!ok) return { count: 0 };
            Object.assign(order, data);
            return { count: 1 };
          },
        ),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(order, data);
          return order;
        }),
        findUniqueOrThrow: jest.fn(async () => ({ ...order })),
      },
      orderEvent: { create: jest.fn() },
      payment: {
        findFirst: jest.fn(async () =>
          basePayment({ status: 'SUCCESS', reference: 'ref-race' }),
        ),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
          data,
        ),
      },
      payout: {
        findFirst: jest.fn(async () => payout),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          payout = data;
          return data;
        }),
      },
      sellerPayoutAccount: {
        findUnique: jest.fn(async () => ({
          id: 'acct-1',
          userId: 'seller-1',
          bankCode: '058',
          accountNumber: '0123456789',
          firstName: 'Ada',
          middleName: '',
          lastName: 'Demo',
          nibssAccountName: 'Ada Demo',
          verifiedAt: new Date(),
          paystackRecipientCode: null,
          paystackRecipientBankCode: null,
          paystackRecipientAccountNumber: null,
        })),
        update: jest.fn(async () => ({})),
      },
      idempotencyRecord: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({})),
      },
      listing: {
        findUnique: jest.fn(async () => ({
          id: 'listing-1',
          status: 'RESERVED',
        })),
        update: jest.fn(),
      },
      favourite: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      listingEvent: { create: jest.fn() },
      dispute: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: unknown }) => data),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    await psp.initiate({
      amountKobo: 1000,
      currency: 'NGN',
      reference: 'ref-race',
      email: 'b@t.c',
      idempotencyKey: 'race',
    });
    psp.simulateWebhookSuccess('ref-race');

    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    await orders.confirmReceipt('order-1', 'buyer-1');
    expect(order.status).toBe('RECEIVED');

    const order2 = baseOrder({
      status: 'RECEIVED',
      coverageEndsAt: new Date(Date.now() + 86400000),
    });
    prisma.order.findUnique = jest.fn(async () => ({ ...order2 }));
    prisma.order.updateMany = jest.fn(
      async ({
        where,
        data,
      }: {
        where: { status?: string | { in?: string[] } };
        data: Record<string, unknown>;
      }) => {
        const ok =
          typeof where.status === 'string'
            ? order2.status === where.status
            : where.status?.in?.includes(order2.status);
        if (!ok) return { count: 0 };
        Object.assign(order2, data);
        return { count: 1 };
      },
    );

    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );
    await disputes.open('order-1', 'buyer-1', { reason: 'UNDISCLOSED_DAMAGE' });
    expect(order2.status).toBe('DISPUTE_HOLD');

    prisma.order.findUnique = jest.fn(async () => ({ ...order2 }));
    await expect(
      orders.confirmReceipt('order-1', 'buyer-1'),
    ).rejects.toThrow(/dispute hold/i);
  });

  it('seller response expiry → AWAITING_ADMIN', async () => {
    const due = [
      {
        id: 'd1',
        orderId: 'o1',
        status: 'AWAITING_SELLER',
        sellerRespondBy: new Date(Date.now() - 1000),
      },
    ];
    const prisma = {
      dispute: {
        findMany: jest.fn(async () => due),
        update: jest.fn(async ({ data }: { data: { status: string } }) => {
          due[0].status = data.status;
          return due[0];
        }),
      },
    };
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
      mockAddressesService(),
    );
    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );
    const n = await disputes.expireSellerResponses();
    expect(n).toBe(1);
    expect(due[0].status).toBe('AWAITING_ADMIN');
  });
});
