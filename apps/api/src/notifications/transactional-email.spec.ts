import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { NotificationsService } from './notifications.service';

function makeService(consents: { channel: string; granted: boolean }[]) {
  const prisma: any = {
    notificationPreference: { findMany: jest.fn(async () => []) },
    profile: { findUnique: jest.fn(async () => null) },
    user: { findUnique: jest.fn(async () => ({ email: 'ayo@example.com' })) },
    consentRecord: { findMany: jest.fn(async () => consents) },
    notification: {
      create: jest.fn(async ({ data }: any) => ({ id: 'n1', ...data })),
    },
  };
  const email = { send: jest.fn(async () => ({ id: 'e1' })) };
  const config = { get: () => undefined } as unknown as ConfigService;
  const svc = new NotificationsService(prisma, config, { send: jest.fn() } as any, email as any);
  return { svc, email, prisma };
}

describe('transactional payment emails', () => {
  const receipt = {
    userId: 'u1',
    category: 'PAYMENT_RECEIVED',
    title: 'Receipt — RW-ORD-1',
    body: 'Total paid: ₦10,000',
    channels: [NotificationChannel.EMAIL],
    forceDelivery: true,
  };

  it('ordinary email still needs the Email switch on', async () => {
    const { svc, email } = makeService([]);
    const r = await svc.notify(receipt);
    expect(email.send).not.toHaveBeenCalled();
    expect(r.skipped).toEqual([{ channel: 'EMAIL', reason: 'email_consent' }]);
  });

  it('a payment receipt is sent even with the Email switch off', async () => {
    const { svc, email } = makeService([]);
    await svc.notify({ ...receipt, transactional: true });
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ayo@example.com', subject: 'Receipt — RW-ORD-1' }),
    );
  });

  it('transactional never overrides marketing consent', async () => {
    const { svc, email } = makeService([]);
    await svc.notify({ ...receipt, category: 'PRICE_DROP', transactional: true });
    expect(email.send).not.toHaveBeenCalled();
  });
});
