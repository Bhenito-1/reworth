/**
 * Demo: driver → customer delivery milestone flow.
 *
 * Usage (from repo root):
 *   pnpm --filter @reworth/api demo:delivery
 *
 * Creates a funded DELIVERY order, assigns a demo driver, then submits
 * milestones via DeliveryService.submitDriverMilestone (same path as the app).
 */
import { NestFactory } from '@nestjs/core';
import { FulfilmentMethod, OrderStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { DeliveryService } from '../src/delivery/delivery.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeDeliveryFeeKobo } from '../src/providers/delivery.provider';
import { haversineKm } from '../src/providers/search.provider';
import { computeOrderTotalKobo, computeProtectionFeeKobo } from '../src/orders/order-fees';

const DRIVER_STATUSES = [
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

async function ensureDemoDriver(prisma: PrismaService) {
  const existing = await prisma.user.findFirst({
    where: { email: 'demo-driver@reworth.local' },
  });
  if (existing) {
    if (!existing.isDeliveryDriver) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { isDeliveryDriver: true },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email: 'demo-driver@reworth.local',
      emailVerifiedAt: new Date(),
      isDeliveryDriver: true,
      profile: {
        create: {
          displayName: 'Demo Rider',
          preferredCommunity: 'Yaba',
        },
      },
    },
  });
}

async function createFundedDeliveryOrder(prisma: PrismaService) {
  const seller =
    (await prisma.user.findFirst({ where: { email: 'demo-seller@reworth.local' } })) ??
    (await prisma.user.create({
      data: {
        email: 'demo-seller@reworth.local',
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: 'Demo Seller',
            preferredCommunity: 'Lekki Ph1',
          },
        },
      },
    }));

  const buyer =
    (await prisma.user.findFirst({ where: { email: 'demo-buyer@reworth.local' } })) ??
    (await prisma.user.create({
      data: {
        email: 'demo-buyer@reworth.local',
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: 'Demo Buyer',
            preferredCommunity: 'VI',
          },
        },
      },
    }));

  const category = await prisma.category.findFirst({
    where: { parentId: null },
  });

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      title: 'Demo Sofa — driver milestones',
      description: 'Seeded for demo:delivery (driver path)',
      categoryId: category?.id,
      priceKobo: 50_000_00,
      status: 'RESERVED',
      community: 'Lekki Ph1',
      geoLat: 6.45,
      geoLng: 3.47,
      addressPrivate: '12 Admiralty Way, Lekki Phase 1',
      fulfilmentDelivery: true,
      publishedAt: new Date(),
    },
  });

  const toLat = 6.43;
  const toLng = 3.43;
  const distanceKm = haversineKm(
    listing.geoLat!,
    listing.geoLng!,
    toLat,
    toLng,
  );
  const deliveryFeeKobo = computeDeliveryFeeKobo(distanceKm);
  const amountKobo = listing.priceKobo;
  const protectionFeeKobo = computeProtectionFeeKobo(amountKobo);
  const totalKobo = computeOrderTotalKobo({
    amountKobo,
    protectionFeeKobo,
    deliveryFeeKobo,
  });

  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amountKobo,
      protectionFeeKobo,
      deliveryFeeKobo,
      totalKobo,
      fulfilmentMethod: FulfilmentMethod.DELIVERY,
      status: OrderStatus.FUNDED,
      fundedAt: new Date(),
      autoReleaseAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      deliveryShipment: {
        create: {
          provider: 'mock-delivery',
          providerRef: `demo_${Date.now()}`,
          quoteKobo: deliveryFeeKobo,
          distanceKm,
          status: 'QUOTED',
          events: {
            create: {
              status: 'QUOTED',
              source: 'SYSTEM',
              payload: { toLat, toLng, demo: true },
            },
          },
        },
      },
    },
    include: { deliveryShipment: true },
  });

  // eslint-disable-next-line no-console
  console.info(`[demo:delivery] Created funded order ${order.id}`);
  return order;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const delivery = app.get(DeliveryService);

  const driver = await ensureDemoDriver(prisma);
  const order = await createFundedDeliveryOrder(prisma);

  // eslint-disable-next-line no-console
  console.info(
    `[demo:delivery] Driver ${driver.email} → order ${order.id} (driver→customer)`,
  );

  await delivery.assignDriver(order.id, driver.id);

  for (const status of DRIVER_STATUSES) {
    const key = `demo-${order.id}-${status}`;
    const result = await delivery.submitDriverMilestone(
      driver.id,
      order.id,
      { status, occurredAt: new Date().toISOString(), note: 'demo:delivery' },
      key,
    );
    // eslint-disable-next-line no-console
    console.info(
      `  → ${status} accepted=${Boolean(result.accepted)} status=${(result as { status?: string }).status ?? (result as { currentStatus?: string }).currentStatus}`,
    );

    // Replay same key — must be idempotent (same acceptance + status)
    const replay = await delivery.submitDriverMilestone(
      driver.id,
      order.id,
      { status },
      key,
    );
    const a = result as { accepted?: boolean; status?: string };
    const b = replay as { accepted?: boolean; status?: string };
    if (a.accepted !== b.accepted || a.status !== b.status) {
      throw new Error(
        `Idempotency mismatch on ${status}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      );
    }
  }

  // Stale delayed update should not regress
  const stale = await delivery.submitDriverMilestone(
    driver.id,
    order.id,
    {
      status: 'PICKED_UP',
      occurredAt: new Date(Date.now() - 3600_000).toISOString(),
      note: 'offline queue',
    },
    `demo-${order.id}-stale`,
  );
  // eslint-disable-next-line no-console
  console.info(
    `  → stale PICKED_UP accepted=${stale.accepted} reason=${(stale as { reason?: string }).reason}`,
  );

  const shipment = await prisma.deliveryShipment.findUnique({
    where: { orderId: order.id },
    include: { events: true },
  });
  // eslint-disable-next-line no-console
  console.info(
    `[demo:delivery] Done. Final status=${shipment?.status}, events=${shipment?.events.length}, driver=${shipment?.assignedDriverId}`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
