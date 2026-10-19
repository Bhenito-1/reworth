/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../orders/orders.service';
import { GiveawayClaimsService } from './giveaway-claims.service';
import { SwapExpiryScheduler } from './swap-expiry.scheduler';
import { SwapProposalsService } from './swap-proposals.service';

function configStub(overrides: Record<string, string> = {}): ConfigService {
  const map: Record<string, string> = {
    SWAP_PROPOSAL_EXPIRY_HOURS: '72',
    GIVEAWAY_CLAIM_EXPIRY_HOURS: '72',
    BUYER_PROTECTION_FEE_PCT: '0.025',
    BUYER_PROTECTION_FEE_CAP_KOBO: '500000',
    ...overrides,
  };
  return {
    get: (k: string) => map[k],
  } as unknown as ConfigService;
}

function baseProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    listingId: 'listing-target',
    proposerId: 'proposer-1',
    offeredListingId: 'listing-offered',
    note: null,
    status: 'PENDING' as const,
    parentProposalId: null,
    conversationId: 'conv-1',
    expiresAt: new Date(Date.now() + 72 * 3600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    listingId: 'listing-target',
    buyerId: 'proposer-1',
    sellerId: 'seller-1',
    offerId: null,
    orderIntentId: null,
    amountKobo: 0,
    protectionFeeKobo: 0,
    deliveryFeeKobo: 0,
    totalKobo: 0,
    fulfilmentMethod: 'MEET_POINT' as const,
    status: 'CREATED' as const,
    buyerProtection: false,
    coverageEndsAt: null,
    autoReleaseAt: null,
    fundedAt: null,
    completedAt: null,
    transactionType: 'SWAP' as const,
    swapProposalId: 'prop-1',
    giveawayClaimId: null,
    swapListingAId: 'listing-target',
    swapListingBId: 'listing-offered',
    legAStatus: 'PENDING' as const,
    legBStatus: 'PENDING' as const,
    meetPointId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Swap and give-away', () => {
  const notifications = {
    log: jest.fn(),
    notify: jest.fn(async () => ({ created: [], skipped: [] })),
  };

  describe('swap', () => {
    it('accept starts two delivery orders, then both confirms complete the swap', async () => {
      const proposal = baseProposal();
      const orderState = baseOrder();
      const paymentsCreate = jest.fn();

      const acceptTx = {
        swapProposal: {
          findUnique: jest.fn().mockResolvedValue(proposal),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest
            .fn()
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValue({ count: 0 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...proposal,
            status: 'ACCEPTED',
          }),
        },
        listing: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'listing-target',
              sellerId: 'seller-1',
              status: 'LIVE',
              sellingMode: 'SWAP',
            })
            .mockResolvedValueOnce({
              id: 'listing-offered',
              sellerId: 'proposer-1',
              status: 'LIVE',
              sellingMode: 'SWAP',
            }),
          update: jest.fn().mockResolvedValue({}),
        },
        listingEvent: { create: jest.fn().mockResolvedValue({}) },
        favourite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        order: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            Object.assign(orderState, data, { id: 'order-1' });
            return { ...orderState };
          }),
        },
        orderEvent: { create: jest.fn().mockResolvedValue({}) },
        deliveryShipment: {
          create: jest.fn().mockResolvedValue({ id: 'ship-1' }),
        },
        deliveryEvent: { create: jest.fn().mockResolvedValue({}) },
      };

      const proposalPrisma = {
        $transaction: jest.fn(async (fn: any) => fn(acceptTx)),
      };

      const proposals = new SwapProposalsService(
        proposalPrisma as never,
        configStub(),
        notifications as never,
      );

      const accepted = await proposals.accept('prop-1', 'seller-1');
      expect(accepted.proposal.status).toBe('ACCEPTED');
      expect(accepted.order.id).toBe('order-1');
      expect(acceptTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amountKobo: 0,
            deliveryFeeKobo: 150_000,
            swapFeeKobo: 50_000,
            totalKobo: 200_000,
            fulfilmentMethod: 'DELIVERY',
            transactionType: 'SWAP',
            status: 'PAYMENT_PENDING',
          }),
        }),
      );
      expect(acceptTx.order.create).toHaveBeenCalledTimes(2);
      expect(paymentsCreate).not.toHaveBeenCalled();

      // Dual-leg confirm via OrdersService
      const trust = { recompute: jest.fn().mockResolvedValue({}) };
      let current = { ...baseOrder() };

      const ordersPrisma: any = {
        order: {
          findUnique: jest.fn().mockImplementation(async () => ({ ...current })),
          update: jest.fn().mockImplementation(async ({ data }) => {
            current = { ...current, ...data };
            return { ...current };
          }),
        },
        orderEvent: { create: jest.fn().mockResolvedValue({}) },
        listing: {
          findUnique: jest.fn().mockImplementation(async ({ where }) => ({
            id: where.id,
            status: 'RESERVED',
          })),
          update: jest.fn().mockResolvedValue({}),
        },
        listingEvent: { create: jest.fn().mockResolvedValue({}) },
        swapProposal: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        giveawayClaim: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: any) =>
          fn({
            order: ordersPrisma.order,
            orderEvent: ordersPrisma.orderEvent,
            listing: ordersPrisma.listing,
            listingEvent: ordersPrisma.listingEvent,
            swapProposal: ordersPrisma.swapProposal,
            giveawayClaim: ordersPrisma.giveawayClaim,
            favourite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }),
        ),
      };

      const orders = new OrdersService(
        ordersPrisma,
        configStub(),
        notifications as never,
        {} as never,
        undefined,
        undefined,
        trust as never,
      );

      await orders.markLegHandedOver('order-1', 'A', 'seller-1');
      expect(current.legAStatus).toBe('HANDED_OVER');
      await orders.confirmLegReceipt('order-1', 'A', 'proposer-1');
      expect(current.legAStatus).toBe('RECEIVED');

      await orders.markLegHandedOver('order-1', 'B', 'proposer-1');
      const completed = await orders.confirmLegReceipt(
        'order-1',
        'B',
        'seller-1',
      );
      expect(completed.status).toBe('COMPLETED');
      expect(trust.recompute).toHaveBeenCalledWith(
        'proposer-1',
        'order_completed',
      );
      expect(trust.recompute).toHaveBeenCalledWith(
        'seller-1',
        'order_completed',
      );
      expect(paymentsCreate).not.toHaveBeenCalled();
    });

    it('cancel returns only the original listing and removes the proposal', async () => {
      const proposal = baseProposal({ status: 'ACCEPTED' });
      const listings = new Map<string, Record<string, unknown>>([
        [
          'listing-target',
          {
            id: 'listing-target',
            sellerId: 'seller-1',
            status: 'RESERVED',
            sellingMode: 'SWAP',
            riskFlags: [],
            quantityAvailable: 0,
            quantityReserved: 1,
            quantitySold: 0,
          },
        ],
        [
          'listing-offered',
          {
            id: 'listing-offered',
            sellerId: 'proposer-1',
            status: 'RESERVED',
            sellingMode: 'SWAP',
            riskFlags: ['swap-response'],
            quantityAvailable: 0,
            quantityReserved: 1,
            quantitySold: 0,
          },
        ],
      ]);
      const tx = {
        swapProposal: {
          update: jest.fn().mockResolvedValue({ ...proposal, status: 'CANCELLED' }),
        },
        order: { update: jest.fn().mockResolvedValue({}) },
        orderEvent: { create: jest.fn().mockResolvedValue({}) },
        listing: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
            listings.get(where.id),
          ),
          update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const current = listings.get(where.id);
            if (current) listings.set(where.id, { ...current, ...data });
            return listings.get(where.id);
          }),
        },
      };
      const prisma = {
        swapProposal: {
          findUnique: jest.fn().mockResolvedValue(proposal),
        },
        listing: {
          findUnique: jest.fn().mockResolvedValue(listings.get('listing-target')),
        },
        order: { findMany: jest.fn().mockResolvedValue([]) },
        message: { create: jest.fn().mockResolvedValue({}) },
        conversation: { update: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      };
      const service = new SwapProposalsService(
        prisma as never,
        configStub(),
        notifications as never,
      );

      await service.cancel('prop-1', 'seller-1');

      expect(listings.get('listing-target')).toMatchObject({
        status: 'LIVE',
        quantityAvailable: 1,
        quantityReserved: 0,
      });
      expect(listings.get('listing-offered')).toMatchObject({
        status: 'REMOVED',
        quantityAvailable: 0,
        quantityReserved: 0,
      });
    });

    it('reject removes the internal proposal and does not publish it', async () => {
      const proposal = baseProposal();
      const offered = {
        id: 'listing-offered',
        sellerId: 'proposer-1',
        status: 'LIVE',
        riskFlags: ['swap-response'],
        quantityAvailable: 0,
        quantityReserved: 0,
        quantitySold: 0,
      };
      const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
      const prisma = {
        swapProposal: {
          findUnique: jest.fn().mockResolvedValue(proposal),
          update: jest.fn().mockResolvedValue({ ...proposal, status: 'REJECTED' }),
        },
        listing: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            if (where.id === 'listing-target') {
              return {
                id: 'listing-target',
                sellerId: 'seller-1',
                status: 'LIVE',
                riskFlags: [],
              };
            }
            return offered;
          }),
          update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            updates.push({ id: where.id, data });
            return { ...offered, ...data };
          }),
        },
      };
      const service = new SwapProposalsService(
        prisma as never,
        configStub(),
        notifications as never,
      );

      await service.reject('prop-1', 'seller-1');

      expect(updates).toEqual([
        {
          id: 'listing-offered',
          data: {
            status: 'REMOVED',
            quantityAvailable: 0,
            quantityReserved: 0,
          },
        },
      ]);
    });
  });

  describe('counter chain', () => {
    it('marks parent COUNTERED and creates child PENDING', async () => {
      const parent = baseProposal();
      const child = baseProposal({
        id: 'prop-2',
        parentProposalId: 'prop-1',
      });
      const prisma = {
        swapProposal: {
          findUnique: jest.fn().mockResolvedValue(parent),
        },
        listing: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'listing-target',
            sellerId: 'seller-1',
          }),
        },
        $transaction: jest.fn(async (fn: any) => {
          const txx = {
            swapProposal: {
              update: jest
                .fn()
                .mockResolvedValue({ ...parent, status: 'COUNTERED' }),
              create: jest.fn().mockResolvedValue(child),
            },
          };
          return fn(txx);
        }),
      };
      const service = new SwapProposalsService(
        prisma as never,
        configStub(),
        notifications as never,
      );
      const result = await service.counter('prop-1', 'seller-1', {});
      expect(result.id).toBe('prop-2');
      expect(result.parentProposalId).toBe('prop-1');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('giveaway', () => {
    it('seller approval is not how a gift is awarded', async () => {
      const claimA = {
        id: 'claim-a',
        listingId: 'listing-ga',
        claimantId: 'user-a',
        status: 'CLAIMED' as const,
        note: null,
        expiresAt: new Date(Date.now() + 72 * 3600_000),
        createdAt: new Date(),
        reviewedAt: null,
      };
      const claimB = {
        ...claimA,
        id: 'claim-b',
        claimantId: 'user-b',
      };

      const tx = {
        giveawayClaim: {
          findUnique: jest.fn().mockResolvedValue(claimA),
          updateMany: jest
            .fn()
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 }),
          findMany: jest.fn().mockResolvedValue([claimB]),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...claimA,
            status: 'APPROVED',
            reviewedAt: new Date(),
          }),
        },
        listing: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'listing-ga',
            sellerId: 'seller-1',
            status: 'LIVE',
            sellingMode: 'GIVE_AWAY',
            priceKobo: 0,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        listingEvent: { create: jest.fn().mockResolvedValue({}) },
        order: {
          create: jest.fn().mockResolvedValue({
            id: 'order-ga',
            transactionType: 'GIVEAWAY',
          }),
        },
        orderEvent: { create: jest.fn().mockResolvedValue({}) },
        deliveryShipment: {
          create: jest.fn().mockResolvedValue({ id: 'ship-ga' }),
        },
        deliveryEvent: { create: jest.fn().mockResolvedValue({}) },
      };

      const prisma = {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        giveawayClaim: {
          findUnique: jest.fn().mockResolvedValue({
            ...claimB,
            status: 'REJECTED',
          }),
        },
      };

      const service = new GiveawayClaimsService(
        prisma as never,
        configStub(),
        notifications as never,
      );
      await expect(service.approve('claim-a', 'seller-1')).rejects.toThrow(
        'first come, first served',
      );
    });

    it('claim requires L2+ verification', async () => {
      const prisma = {
        verification: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new GiveawayClaimsService(
        prisma as never,
        configStub(),
        notifications as never,
      );
      await expect(
        service.claim('listing-ga', 'user-a', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('claim expiry', () => {
    it('expireDueClaims marks CLAIMED past expiresAt as EXPIRED', async () => {
      const prisma = {
        giveawayClaim: {
          findMany: jest.fn().mockResolvedValue([{ id: 'old-claim' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const service = new GiveawayClaimsService(
        prisma as never,
        configStub(),
        notifications as never,
      );
      const count = await service.expireDueClaims(new Date());
      expect(count).toBe(1);
      expect(prisma.giveawayClaim.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-claim'] } },
        data: { status: 'EXPIRED' },
      });
    });

    it('scheduler expires proposals and claims', async () => {
      const proposals = {
        expireDueProposals: jest.fn().mockResolvedValue(2),
      };
      const claims = {
        expireDueClaims: jest.fn().mockResolvedValue(1),
      };
      const scheduler = new SwapExpiryScheduler(
        proposals as never,
        claims as never,
        configStub({ SWAP_EXPIRY_SCHEDULER: 'false' }),
      );
      const result = await scheduler.expireAll(new Date());
      expect(result).toEqual({ proposals: 2, claims: 1 });
    });
  });

  describe('double confirm idempotent', () => {
    it('confirm-receipt twice on same leg returns without error', async () => {
      const current = baseOrder({
        legAStatus: 'RECEIVED',
        legBStatus: 'PENDING',
      });
      const prisma: any = {
        order: {
          findUnique: jest.fn().mockResolvedValue(current),
          update: jest.fn(),
        },
        orderEvent: { create: jest.fn() },
        $transaction: jest.fn(),
      };
      const orders = new OrdersService(
        prisma,
        configStub(),
        notifications as never,
        {} as never,
      );
      const first = await orders.confirmLegReceipt(
        'order-1',
        'A',
        'proposer-1',
      );
      const second = await orders.confirmLegReceipt(
        'order-1',
        'A',
        'proposer-1',
      );
      expect(first.legAStatus).toBe('RECEIVED');
      expect(second.legAStatus).toBe('RECEIVED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('trust recompute on complete', () => {
    it('calls trust.recompute for both parties', async () => {
      const current = baseOrder({
        legAStatus: 'RECEIVED',
        legBStatus: 'RECEIVED',
        status: 'CREATED',
      });
      const trust = { recompute: jest.fn().mockResolvedValue({}) };
      const prisma: any = {
        order: {
          findUnique: jest.fn().mockResolvedValue(current),
          update: jest.fn().mockImplementation(async ({ data }) => ({
            ...current,
            ...data,
          })),
        },
        orderEvent: { create: jest.fn().mockResolvedValue({}) },
        listing: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'listing-target',
            status: 'RESERVED',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        listingEvent: { create: jest.fn().mockResolvedValue({}) },
        swapProposal: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        giveawayClaim: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: any) =>
          fn({
            order: {
              update: jest.fn().mockImplementation(async ({ data }) => ({
                ...current,
                ...data,
              })),
            },
            orderEvent: { create: jest.fn().mockResolvedValue({}) },
            listing: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'x',
                status: 'RESERVED',
              }),
              update: jest.fn().mockResolvedValue({}),
            },
            listingEvent: { create: jest.fn().mockResolvedValue({}) },
            swapProposal: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            giveawayClaim: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            favourite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }),
        ),
      };
      const orders = new OrdersService(
        prisma,
        configStub(),
        notifications as never,
        {} as never,
        undefined,
        undefined,
        trust as never,
      );
      const result = await orders.completeSwapOrGiveaway('order-1', 'seller-1');
      expect(result.status).toBe('COMPLETED');
      expect(trust.recompute).toHaveBeenCalledTimes(2);
    });
  });

  describe('accept race', () => {
    it('second accept throws ConflictException', async () => {
      const proposal = baseProposal({ status: 'ACCEPTED' });
      const tx = {
        swapProposal: {
          findUnique: jest.fn().mockResolvedValue(proposal),
        },
        listing: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'listing-target',
            sellerId: 'seller-1',
            status: 'LIVE',
          }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      };
      const service = new SwapProposalsService(
        prisma as never,
        configStub(),
        notifications as never,
      );
      await expect(service.accept('prop-1', 'seller-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
