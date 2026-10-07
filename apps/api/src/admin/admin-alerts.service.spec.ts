import { AdminRole, UserStatus } from '@prisma/client';
import { AdminAlertsService } from './admin-alerts.service';

describe('AdminAlertsService', () => {
  const admins = [
    { id: 'mod-1', email: 'mod@reworth.test' },
    { id: 'super-1', email: null as string | null },
  ];

  function setup() {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(admins),
      },
      adminAlert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `alert-${created.length}`, ...data };
        }),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const email = { name: 'mock', send: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: (key: string) =>
        key === 'ADMIN_ORIGIN' ? 'https://admin.reworth.test' : undefined,
    };
    const service = new AdminAlertsService(
      prisma as never,
      config as never,
      email,
    );
    return { service, prisma, email, created };
  }

  it('pings each active admin for the role and emails those with an address', async () => {
    const { service, prisma, email, created } = setup();

    await service.notify({
      roles: [AdminRole.CONTENT_MODERATOR],
      kind: 'LISTING_REVIEW',
      title: 'Listing needs review',
      body: '"Sunglasses" is waiting for a photo and details check.',
      href: '/listings',
      entityType: 'Listing',
      entityId: 'listing-1',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: UserStatus.ACTIVE,
          roles: {
            some: {
              role: {
                in: expect.arrayContaining([
                  AdminRole.CONTENT_MODERATOR,
                  AdminRole.SUPER_ADMIN,
                ]),
              },
            },
          },
        }),
      }),
    );
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      userId: 'mod-1',
      kind: 'LISTING_REVIEW',
      href: '/listings',
      entityId: 'listing-1',
    });
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'mod@reworth.test',
        subject: 'Listing needs review',
      }),
    );
  });

  it('does not send a second ping while the same alert is unread', async () => {
    const { service, prisma, email } = setup();
    prisma.adminAlert.findFirst.mockImplementation(
      async ({ where }: { where: { userId: string } }) =>
        where.userId === 'mod-1' ? { id: 'open' } : null,
    );

    await service.notify({
      roles: [AdminRole.OPERATIONS],
      kind: 'DISPUTE',
      title: 'Dispute opened',
      body: 'A buyer opened a dispute.',
      href: '/disputes',
      entityType: 'Dispute',
      entityId: 'dispute-1',
    });

    expect(prisma.adminAlert.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'super-1' }),
      }),
    );
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not throw when the lookup fails', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockRejectedValue(new Error('db down'));

    await expect(
      service.notify({
        roles: [AdminRole.RISK_FRAUD],
        kind: 'RISK',
        title: 'High risk',
        body: 'Seller risk is HIGH.',
        href: '/fraud',
        entityType: 'Listing',
        entityId: 'listing-9',
      }),
    ).resolves.toBeUndefined();
  });
});
