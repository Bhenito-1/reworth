/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { computeDeliveryFeeKobo } from '../providers/delivery.provider';
import { haversineKm } from '../providers/search.provider';
import { MockDeliveryProvider } from '../providers/mock-delivery.provider';
import { MockEmailProvider } from '../providers/mock-email.provider';
import { MockPushProvider } from '../providers/mock-push.provider';
import {
  NotificationCategory,
  PUSH_FREQUENCY_CAP_PER_HOUR,
} from '../notifications/notification-categories';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryService } from './delivery.service';

describe('delivery quote math', () => {
  it('feeKobo = 150000 + 15000 * ceil(km)', () => {
    expect(computeDeliveryFeeKobo(0)).toBe(150_000);
    expect(computeDeliveryFeeKobo(0.1)).toBe(150_000 + 15_000);
    expect(computeDeliveryFeeKobo(1)).toBe(150_000 + 15_000);
    expect(computeDeliveryFeeKobo(1.01)).toBe(150_000 + 30_000);
    expect(computeDeliveryFeeKobo(5)).toBe(150_000 + 75_000);
  });

  it('MockDeliveryProvider quote uses haversine + formula', async () => {
    const provider = new MockDeliveryProvider();
    // ~0 km same point
    const q0 = await provider.quote({
      fromLat: 6.45,
      fromLng: 3.45,
      toLat: 6.45,
      toLng: 3.45,
    });
    expect(q0.feeKobo).toBe(150_000);
    expect(q0.distanceKm).toBe(0);

    const km = haversineKm(6.45, 3.45, 6.5, 3.5);
    const q = await provider.quote({
      fromLat: 6.45,
      fromLng: 3.45,
      toLat: 6.5,
      toLng: 3.5,
    });
    expect(q.feeKobo).toBe(computeDeliveryFeeKobo(km));
  });
});

describe('address disclose one-way', () => {
  function makeDeliveryService(state: {
    disclosure: any | null;
    orderStatus?: string;
  }) {
    const order = {
      id: 'order-1',
      sellerId: 'seller-1',
      buyerId: 'buyer-1',
      status: state.orderStatus ?? 'FUNDED',
      listing: { addressPrivate: '12 Admiralty Way, Lekki' },
      addressDisclosure: state.disclosure,
    };
    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => order),
      },
      addressDisclosure: {
        create: jest.fn(async ({ data }: any) => {
          if (state.disclosure) {
            throw new ConflictException('Address already disclosed');
          }
          state.disclosure = {
            id: 'disc-1',
            ...data,
            createdAt: new Date(),
          };
          order.addressDisclosure = state.disclosure;
          return state.disclosure;
        }),
      },
    };
    const notifications = {
      notify: jest.fn(async () => ({ created: [], skipped: [] })),
      log: jest.fn(),
    } as unknown as NotificationsService;
    const provider = new MockDeliveryProvider();
    return new DeliveryService(prisma, notifications, provider);
  }

  it('discloses once and rejects second call with 409', async () => {
    const state = { disclosure: null as any };
    const svc = makeDeliveryService(state);
    const first = await svc.discloseAddress('order-1', 'seller-1');
    expect(first.addressSnapshot).toBe('12 Admiralty Way, Lekki');

    await expect(svc.discloseAddress('order-1', 'seller-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('cannot revoke — no revoke API; disclosure remains', async () => {
    const state = {
      disclosure: {
        id: 'disc-1',
        orderId: 'order-1',
        addressSnapshot: 'locked address',
        createdAt: new Date(),
      },
    };
    const svc = makeDeliveryService(state);
    await expect(svc.discloseAddress('order-1', 'seller-1')).rejects.toThrow(
      /already disclosed/i,
    );
    expect(state.disclosure.addressSnapshot).toBe('locked address');
  });
});

describe('NotificationsService', () => {
  function buildService(opts: {
    prefs?: { category: string; channel: NotificationChannel; enabled: boolean }[];
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
    email?: string | null;
    tokens?: string[];
  }) {
    const created: any[] = [];
    const prisma: any = {
      notificationPreference: {
        findMany: jest.fn(async () => opts.prefs ?? []),
        upsert: jest.fn(async ({ create, update, where }: any) => ({
          id: 'pref-1',
          ...where.userId_category_channel,
          ...create,
          ...update,
        })),
      },
      profile: {
        findUnique: jest.fn(async () => ({
          quietHoursStart: opts.quietHoursStart ?? null,
          quietHoursEnd: opts.quietHoursEnd ?? null,
        })),
      },
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          email: opts.email ?? 'buyer@reworth.local',
        })),
      },
      devicePushToken: {
        findMany: jest.fn(async () =>
          (opts.tokens ?? ['tok-1']).map((token) => ({ token })),
        ),
      },
      notification: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `n-${created.length + 1}`, ...data };
          created.push(row);
          return row;
        }),
      },
    };
    const push = new MockPushProvider();
    const email = new MockEmailProvider();
    const config = {
      get: (key: string) =>
        key === 'APP_URL' || key === 'WEB_ORIGIN'
          ? 'http://localhost:3000'
          : undefined,
    } as unknown as import('@nestjs/config').ConfigService;
    const svc = new NotificationsService(prisma, config, push, email);
    return { svc, push, email, created, prisma };
  }

  it('delivery status fan-out creates IN_APP + PUSH + EMAIL', async () => {
    const { svc, push, email, created } = buildService({});
    const result = await svc.notify({
      userId: 'user-1',
      category: NotificationCategory.DELIVERY_UPDATE,
      title: 'Delivery assigned',
      body: 'Courier assigned',
      deepLink: 'reworth://orders/o1',
      meta: { orderId: 'o1' },
    });
    const channels = result.created.map((c) => c.channel).sort();
    expect(channels).toEqual(['EMAIL', 'IN_APP', 'PUSH'].sort());
    expect(created).toHaveLength(3);
    expect(push.sent).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
  });

  it('disable PRICE_DROP push → no push; PAYMENT_RECEIVED still gets IN_APP', async () => {
    const { svc, push, created } = buildService({
      prefs: [
        {
          category: NotificationCategory.PRICE_DROP,
          channel: NotificationChannel.PUSH,
          enabled: false,
        },
        {
          category: NotificationCategory.PAYMENT_RECEIVED,
          channel: NotificationChannel.IN_APP,
          enabled: false,
        },
      ],
    });

    await svc.notify({
      userId: 'user-1',
      category: NotificationCategory.PRICE_DROP,
      title: 'Price drop',
      body: 'Item cheaper',
    });
    expect(push.sent).toHaveLength(0);
    expect(
      created.some(
        (c) =>
          c.category === NotificationCategory.PRICE_DROP &&
          c.channel === NotificationChannel.PUSH,
      ),
    ).toBe(false);

    created.length = 0;
    const payment = await svc.notify({
      userId: 'user-1',
      category: NotificationCategory.PAYMENT_RECEIVED,
      title: 'Paid',
      body: 'Funds in escrow',
      channels: [NotificationChannel.IN_APP],
    });
    expect(payment.created.some((c) => c.channel === 'IN_APP')).toBe(true);
  });

  it('setPreference forces IN_APP enabled for PAYMENT_RECEIVED', async () => {
    const { svc, prisma } = buildService({});
    const pref = await svc.setPreference(
      'user-1',
      NotificationCategory.PAYMENT_RECEIVED,
      NotificationChannel.IN_APP,
      false,
    );
    expect(pref.enabled).toBe(true);
    expect(prisma.notificationPreference.upsert).toHaveBeenCalled();
  });

  it('quiet hours skip push', async () => {
    // Force quiet hours: 0–24 covers all hours
    const { svc, push } = buildService({
      quietHoursStart: 0,
      quietHoursEnd: 23,
    });
    // If current WAT hour is 23, window is [0,23) so hour 23 is outside — use wrap
    // Safer: spy isQuietHours
    jest.spyOn(svc, 'isQuietHours').mockReturnValue(true);

    const result = await svc.notify({
      userId: 'user-1',
      category: NotificationCategory.PRICE_DROP,
      title: 'Quiet',
      body: 'Should skip push',
    });
    expect(push.sent).toHaveLength(0);
    expect(
      result.skipped.some(
        (s) => s.channel === NotificationChannel.PUSH && s.reason === 'quiet_hours',
      ),
    ).toBe(true);
  });

  it('isQuietHours wraps midnight (22→7)', () => {
    const { svc } = buildService({});
    // 23:00 WAT = 22:00 UTC
    const at23 = new Date('2026-09-13T22:00:00Z');
    expect(svc.isQuietHours(22, 7, at23)).toBe(true);
    // 08:00 WAT = 07:00 UTC
    const at8 = new Date('2026-09-13T07:00:00Z');
    expect(svc.isQuietHours(22, 7, at8)).toBe(false);
    // 06:00 WAT = 05:00 UTC
    const at6 = new Date('2026-09-13T05:00:00Z');
    expect(svc.isQuietHours(22, 7, at6)).toBe(true);
  });

  it('frequency cap bundles excess PUSH into digest', async () => {
    const { svc, push, created } = buildService({});
    svc.resetPushCaps();
    const conversationId = 'conv-1';

    for (let i = 0; i < PUSH_FREQUENCY_CAP_PER_HOUR; i++) {
      await svc.notify({
        userId: 'user-1',
        category: NotificationCategory.NEW_MESSAGE,
        title: `Msg ${i}`,
        body: 'hi',
        meta: { conversationId },
        channels: [NotificationChannel.PUSH],
      });
    }
    expect(push.sent).toHaveLength(PUSH_FREQUENCY_CAP_PER_HOUR);

    const over = await svc.notify({
      userId: 'user-1',
      category: NotificationCategory.NEW_MESSAGE,
      title: 'Msg overflow',
      body: 'digest me',
      meta: { conversationId },
      channels: [NotificationChannel.PUSH],
    });
    expect(push.sent).toHaveLength(PUSH_FREQUENCY_CAP_PER_HOUR);
    expect(
      over.skipped.some((s) => s.reason === 'frequency_cap_digest'),
    ).toBe(true);
    expect(
      created.some(
        (c) =>
          c.channel === NotificationChannel.IN_APP &&
          c.meta?.digest === true,
      ),
    ).toBe(true);
  });
});
