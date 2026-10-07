import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MockPsp } from '../providers/mock-psp';
import { PAYMENT_PROVIDER } from '../providers/payment.provider';
import { PaystackAdapter } from '../providers/paystack.adapter';
import { PlatformServicesModule } from '../platform-services/platform-services.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { VerticalsModule } from '../verticals/verticals.module';
import { AdminAlertsModule } from '../admin/admin-alerts.module';
import { AutoReleaseScheduler } from './auto-release.scheduler';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

export function createPaymentProvider(config: ConfigService) {
  const provider = (
    config.get<string>('PAYMENTS_PROVIDER') ?? 'mock'
  ).toLowerCase();
  if (provider === 'paystack') {
    return new PaystackAdapter(
      config.get<string>('PAYSTACK_SECRET_KEY') ?? undefined,
      config.get<string>('PAYSTACK_WEBHOOK_SECRET') ?? undefined,
    );
  }
  return new MockPsp(
    config.get<string>('PAYSTACK_WEBHOOK_SECRET') ?? 'mock-webhook-secret',
  );
}

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    NotificationsModule,
    AdminAlertsModule,
    ReviewsModule,
    forwardRef(() => DeliveryModule),
    forwardRef(() => VerticalsModule),
    forwardRef(() => PlatformServicesModule),
    ReferralsModule,
    InventoryModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    AutoReleaseScheduler,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: createPaymentProvider,
      inject: [ConfigService],
    },
  ],
  exports: [OrdersService, PAYMENT_PROVIDER],
})
export class OrdersModule {}
