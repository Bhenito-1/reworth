import { UsersService } from './users.service';

describe('UsersService privacy', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      profile: {
        update: jest.fn(),
      },
      address: {
        updateMany: jest.fn(),
      },
      listing: {
        updateMany: jest.fn(),
      },
      addressDisclosure: {
        updateMany: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
      device: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      consentRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { update: jest.fn() },
          profile: { update: jest.fn() },
          address: { updateMany: jest.fn() },
          listing: { updateMany: jest.fn() },
          addressDisclosure: { updateMany: jest.fn() },
          refreshToken: { updateMany: jest.fn() },
          device: { updateMany: jest.fn() },
        };
        return fn(tx);
      }),
      ...overrides,
    };
  }

  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  it('exportMe returns profile, addresses, listings, orders, consents, devices without secrets', async () => {
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      phone: '+234801',
      email: 'a@b.com',
      status: 'ACTIVE',
      passwordHash: 'secret',
      createdAt: new Date(),
      profile: { displayName: 'Ada', fullName: 'Ada Lovelace' },
      addresses: [{ id: 'a1', line1: '12 Admiralty' }],
      devices: [{ id: 'd1', name: 'iPhone', platform: 'IOS' }],
      consentRecords: [{ channel: 'MARKETING', granted: true }],
      listings: [{ id: 'l1', title: 'Sofa', status: 'LIVE' }],
      ordersAsBuyer: [{ id: 'o1', status: 'COMPLETED', totalKobo: 100 }],
      ordersAsSeller: [],
    });

    const service = new UsersService(prisma as never, audit as never);
    const dump = await service.exportMe('u1');

    expect(dump.profile!.displayName).toBe('Ada');
    expect(dump.addresses[0].line1).toBe('12 Admiralty');
    expect(dump.listings).toHaveLength(1);
    expect(dump.orders.asBuyer[0].id).toBe('o1');
    expect(dump.consents).toHaveLength(1);
    expect(dump.devices).toHaveLength(1);
    expect(JSON.stringify(dump)).not.toContain('secret');
    expect(JSON.stringify(dump)).not.toContain('passwordHash');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_DATA_EXPORTED' }),
    );
  });

  it('requestDelete sets DELETED, pseudonymises, revokes tokens', async () => {
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      phone: '+234801',
      email: 'a@b.com',
      status: 'ACTIVE',
      profile: { displayName: 'Ada' },
      addresses: [],
    });

    const service = new UsersService(prisma as never, audit as never);
    const result = await service.requestDelete('u1', '127.0.0.1');

    expect(result.deleted).toBe(true);
    expect(result.pseudonymised).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_DELETED_PSEUDONYMISED',
        afterJson: expect.objectContaining({ status: 'DELETED' }),
      }),
    );
  });

  it('getConsents defaults all channels to false', async () => {
    const prisma = buildPrisma();
    const service = new UsersService(prisma as never, audit as never);
    const result = await service.getConsents('u1');
    expect(result.consents).toHaveLength(3);
    expect(result.consents.every((c) => c.granted === false)).toBe(true);
  });

  it('updateConsents upserts channels', async () => {
    const prisma = buildPrisma();
    (prisma.consentRecord.findMany as jest.Mock).mockResolvedValue([
      { channel: 'MARKETING', granted: true, updatedAt: new Date() },
    ]);
    const service = new UsersService(prisma as never, audit as never);
    await service.updateConsents('u1', {
      consents: [{ channel: 'MARKETING', granted: true }],
    });
    expect(prisma.consentRecord.upsert).toHaveBeenCalled();
  });
});
