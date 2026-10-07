import { InstantBuyService } from './instant-buy.service';
import { MockFulfilmentService } from './mock-fulfilment.service';
import { OrderStateMachine } from '../orders/order-state.machine';

describe('Instant Buy (Phase 3.1)', () => {
  it('allows FUNDED → REFUND_ISSUED for SLA path', () => {
    expect(OrderStateMachine.canTransition('FUNDED', 'REFUND_ISSUED')).toBe(
      true,
    );
  });

  it('SLA breach auto-refund uses idempotent key instant-buy-refund:{orderId}', async () => {
    const orderId = 'order-1';
    const fulfilmentId = 'ful-1';
    const refunds: unknown[] = [];
    const orderUpdates: string[] = [];

    const prisma: any = {
      instantBuyFulfilment: {
        findUnique: jest.fn().mockResolvedValue({
          id: fulfilmentId,
          orderId,
          listingId: 'listing-1',
          status: 'PENDING_PICKUP',
          slaDeadlineAt: new Date(Date.now() - 60_000),
          refundIdempotencyKey: null,
          order: {
            id: orderId,
            totalKobo: 100_000_00,
            status: 'FUNDED',
            buyerId: 'b1',
            sellerId: 's1',
          },
        }),
        findMany: jest.fn().mockResolvedValue([{ id: fulfilmentId }]),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: fulfilmentId,
          ...data,
        })),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          refunds.push(data);
          return data;
        }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pay-1',
          reference: 'ref-1',
          status: 'SUCCESS',
        }),
        update: jest.fn(),
      },
      order: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: orderId,
          status: 'FUNDED',
          totalKobo: 100_000_00,
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          orderUpdates.push(data.status);
          return { id: orderId, status: data.status };
        }),
      },
      orderEvent: { create: jest.fn() },
      idempotencyRecord: { upsert: jest.fn() },
      $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
    };

    const psp = {
      refund: jest.fn().mockResolvedValue({ status: 'refunded' }),
    };
    const config = { get: () => '48' };
    const fulfilment = {
      name: 'mock',
      schedulePickup: jest.fn(),
      markPickedUp: jest.fn(),
      markDelivered: jest.fn(),
      checkSla: jest.fn().mockResolvedValue({ breached: [fulfilmentId] }),
    };

    const svc = new InstantBuyService(
      prisma,
      config as never,
      fulfilment as never,
      psp as never,
      undefined,
    );

    const count = await svc.processSlaBreaches(new Date());
    expect(count).toBe(1);
    expect(refunds[0]).toMatchObject({
      idempotencyKey: `instant-buy-refund:${orderId}`,
      reason: 'instant_buy_sla_breach',
    });
    expect(orderUpdates).toContain('REFUND_ISSUED');
    expect(psp.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `instant-buy-refund:${orderId}`,
      }),
    );

    // Second pass idempotent
    prisma.instantBuyFulfilment.findUnique.mockResolvedValue({
      id: fulfilmentId,
      orderId,
      status: 'REFUNDED',
      slaDeadlineAt: new Date(Date.now() - 60_000),
      refundIdempotencyKey: `instant-buy-refund:${orderId}`,
      order: { id: orderId, totalKobo: 100_000_00, status: 'REFUND_ISSUED' },
    });
    const again = await svc.refundOnSlaBreach(fulfilmentId);
    expect(again).toBe(false);
  });

  it('MockFulfilmentService.checkSla returns breached ids', async () => {
    const prisma: any = {
      instantBuyFulfilment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
        update: jest.fn(),
      },
    };
    const mock = new MockFulfilmentService(prisma);
    const { breached } = await mock.checkSla(new Date());
    expect(breached).toEqual(['a', 'b']);
  });
});
