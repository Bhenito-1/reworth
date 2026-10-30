/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { MockPsp } from '../providers/mock-psp';
import {
  computeOrderTotalKobo,
  computeProtectionFeeKobo,
} from './order-fees';
import { OrderStateMachine } from './order-state.machine';
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
    listingId: 'listing-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
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

function basePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    provider: 'mock-psp',
    reference: 'ref-1',
    amountKobo: 102_500_00,
    status: 'PENDING' as string,
    idempotencyKey: 'idem-1',
    providerPayload: { checkoutUrl: 'https://mock-psp.local/checkout/ref-1' },
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
            where: { status?: string | { in?: string[] } };
            data: Record<string, unknown>;
          }) => {
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
      orderEvent: { create: jest.fn(async () => ({})) },
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
        findFirst: jest.fn(async () => ({ ...state.payment })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state.payment, data, { id: 'pay-1' });
          return { ...state.payment };
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state.payment, data);
          return { ...state.payment };
        }),
      },
      payout: {
        findFirst: jest.fn(async () => state.payouts[0] ?? null),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          state.payouts.push(data);
          return data;
        }),
      },
      idempotencyRecord: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          state.idem.get(where.key)
            ? { key: where.key, responseJson: state.idem.get(where.key) }
            : null,
        ),
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
      refund: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args: { data: unknown }) => args.data),
      },
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

    await payments.handleMockWebhook({ reference: 'ref-1' });
    expect(state.order.status).toBe('FUNDED');
    expect(state.payment.status).toBe('SUCCESS');

    await payments.handleMockWebhook({ reference: 'ref-1' });
    await payments.handleMockWebhook({ reference: 'ref-1' });
    await payments.handleMockWebhook({ reference: 'ref-1' });
    expect(state.order.status).toBe('FUNDED');

    state.order.status = 'FUNDED';
    await orders.markHandedOver('order-1', 'seller-1');
    expect(state.order.status).toBe('HANDED_OVER');

    await orders.confirmReceipt('order-1', 'buyer-1');
    expect(state.order.status).toBe('COMPLETED');
    expect(state.payouts).toHaveLength(1);
    expect(state.payment.status).toBe('RELEASED');

    await orders.releaseEscrow('order-1', 'buyer-1', 'confirm_receipt');
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
    prisma.order.findMany = jest.fn(async () => [{ id: 'order-1' }]);
    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
    );
    const n = await orders.autoReleaseDue();
    expect(n).toBe(1);
    expect(state.order.status).toBe('COMPLETED');
    expect(state.payouts).toHaveLength(1);
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
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          refunds.push(data);
          return data;
        }),
      },
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
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };

    const orders = new OrdersService(
      prisma as never,
      config,
      notifications,
      psp,
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

  it('partial refund', async () => {
    const order = baseOrder({
      status: 'DISPUTE_HOLD',
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
      refund: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: unknown }) => data),
      },
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
    );
    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );
    await disputes.resolve('disp-2', 'admin-1', {
      resolution: 'PARTIAL_REFUND',
      amountKobo: 40_000,
    });
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
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
    );
    await orders.confirmReceipt('order-1', 'buyer-1');
    expect(order.status).toBe('COMPLETED');

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
    );
    const disputes = new DisputesService(prisma as never, orders, notifications, { log: jest.fn().mockResolvedValue(null) } as never, psp,
    );
    const n = await disputes.expireSellerResponses();
    expect(n).toBe(1);
    expect(due[0].status).toBe('AWAITING_ADMIN');
  });
});
