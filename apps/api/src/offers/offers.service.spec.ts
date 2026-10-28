import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OffersService } from './offers.service';
import { NotificationStub } from '../chat/notification.stub';

function baseOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    listingId: 'listing-1',
    conversationId: 'conv-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountKobo: 50_000_00,
    note: null,
    status: 'PENDING' as const,
    parentOfferId: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('OffersService lifecycle', () => {
  const config = {
    get: (k: string) =>
      k === 'OFFER_EXPIRY_HOURS'
        ? '24'
        : k === 'LISTING_RESERVE_HOURS'
          ? '1'
          : undefined,
  } as unknown as ConfigService;
  const notifications = new NotificationStub();

  function makeAcceptTx(getOffer: () => ReturnType<typeof baseOffer>) {
    return {
      offer: {
        findUnique: jest.fn().mockImplementation(async () => getOffer()),
        updateMany: jest.fn().mockImplementation(async ({ where }: { where: { status?: string } }) => {
          const o = getOffer();
          if (where.status && o.status !== where.status) return { count: 0 };
          if (o.status !== 'PENDING') return { count: 0 };
          (o as { status: string }).status = 'ACCEPTED';
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          ...getOffer(),
          status: 'ACCEPTED',
        })),
      },
      listing: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'listing-1',
          status: 'LIVE',
          sellerId: 'seller-1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      listingEvent: { create: jest.fn().mockResolvedValue({}) },
      offerEvent: { create: jest.fn().mockResolvedValue({}) },
      orderIntent: {
        create: jest.fn().mockResolvedValue({
          id: 'oi-1',
          reservedUntil: new Date(),
          amountKobo: 50_000_00,
        }),
      },
    };
  }

  it('accept transitions listing to RESERVED and creates OrderIntent', async () => {
    const offer = baseOffer();
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeAcceptTx(() => offer)),
      ),
    };
    const service = new OffersService(prisma as never, config, notifications);
    const result = await service.accept('offer-1', 'seller-1');
    expect(result.offer.status).toBe('ACCEPTED');
    expect(result.orderIntent.id).toBe('oi-1');
  });

  it('counter chain marks parent COUNTERED and creates child PENDING', async () => {
    const parent = baseOffer();
    const child = baseOffer({
      id: 'offer-2',
      amountKobo: 45_000_00,
      parentOfferId: 'offer-1',
    });
    const prisma = {
      offer: {
        findUnique: jest.fn().mockResolvedValue(parent),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          offer: {
            update: jest
              .fn()
              .mockResolvedValue({ ...parent, status: 'COUNTERED' }),
            create: jest.fn().mockResolvedValue(child),
          },
          offerEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      }),
    };
    const service = new OffersService(prisma as never, config, notifications);
    const result = await service.counter('offer-1', 'seller-1', {
      amountKobo: 45_000_00,
    });
    expect(result.id).toBe('offer-2');
    expect(result.parentOfferId).toBe('offer-1');
    expect(result.status).toBe('PENDING');
  });

  it('rejects a buyer countering their own offer', async () => {
    const prisma = {
      offer: { findUnique: jest.fn().mockResolvedValue(baseOffer()) },
    };
    const service = new OffersService(prisma as never, config, notifications);
    await expect(
      service.counter('offer-1', 'buyer-1', { amountKobo: 45_000_00 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('double-accept race → second call 409', async () => {
    const offer = baseOffer();
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeAcceptTx(() => offer)),
      ),
    };
    const service = new OffersService(prisma as never, config, notifications);
    await service.accept('offer-1', 'seller-1');
    await expect(service.accept('offer-1', 'seller-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('expireDueOffers marks PENDING past expiresAt as EXPIRED', async () => {
    const prisma = {
      offer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'offer-old' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      offerEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new OffersService(prisma as never, config, notifications);
    const count = await service.expireDueOffers(new Date());
    expect(count).toBe(1);
    expect(prisma.offer.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['offer-old'] } },
      data: { status: 'EXPIRED' },
    });
  });
});
