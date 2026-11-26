import { ConflictException } from '@nestjs/common';
import {
  assertBuyerCanMeetupOnListing,
  buyerCheckoutUnitCap,
  negotiatedUnitKoboForBuyer,
} from './buyer-listing-checkout';

describe('buyer-listing-checkout', () => {
  it('allows LIVE listings without extra checks', async () => {
    const prisma = {
      offer: { findFirst: jest.fn() },
      orderIntent: { findFirst: jest.fn() },
    };
    await expect(
      assertBuyerCanMeetupOnListing(
        prisma,
        { id: 'l1', status: 'LIVE' },
        'buyer-1',
      ),
    ).resolves.toBeUndefined();
    expect(prisma.offer.findFirst).not.toHaveBeenCalled();
  });

  it('allows RESERVED when buyer has accepted offer', async () => {
    const prisma = {
      offer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1' }),
      },
      orderIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      assertBuyerCanMeetupOnListing(
        prisma,
        { id: 'l1', status: 'RESERVED' },
        'buyer-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects RESERVED without buyer checkout lane', async () => {
    const prisma = {
      offer: { findFirst: jest.fn().mockResolvedValue(null) },
      orderIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      assertBuyerCanMeetupOnListing(
        prisma,
        { id: 'l1', status: 'RESERVED' },
        'buyer-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 0 cap when buyer has unpaid order', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ord-1' }),
      },
      offer: { findFirst: jest.fn() },
      orderIntent: { findFirst: jest.fn() },
    };
  const cap = await buyerCheckoutUnitCap(
      prisma,
      {
        id: 'l1',
        status: 'LIVE',
        quantityAvailable: 2,
        quantityReserved: 0,
        quantityTotal: 2,
        quantitySold: 0,
      },
      'buyer-1',
      { negotiated: false },
    );
    expect(cap).toEqual({ cap: 0, openOrderId: 'ord-1' });
  });

  it('allows one unit on RESERVED offer lane when counts drift', async () => {
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue(null) },
      offer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1' }),
      },
      orderIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const cap = await buyerCheckoutUnitCap(
      prisma,
      {
        id: 'l1',
        status: 'RESERVED',
        quantityAvailable: 0,
        quantityReserved: 0,
        quantityTotal: 1,
        quantitySold: 0,
      },
      'buyer-1',
      { negotiated: true },
    );
    expect(cap).toEqual({ cap: 1, openOrderId: null });
  });

  it('uses accepted offer amount when present', async () => {
    const prisma = {
      offer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1', amountKobo: 42_000_00 }),
      },
    };
    await expect(
      negotiatedUnitKoboForBuyer(prisma, 'l1', 'buyer-1', 50_000_00),
    ).resolves.toEqual({ amountKobo: 42_000_00, offerId: 'o1' });
  });
});