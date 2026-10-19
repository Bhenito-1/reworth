import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAlertsModule } from '../admin/admin-alerts.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DELIVERY_PROVIDER } from '../providers/delivery.provider';
import { MockDeliveryProvider } from '../providers/mock-delivery.provider';
import { RegionConfigService } from '../region/region-config.service';
import {
  DeliveryWebhookController,
  MeetPointsController,
  OrderDeliveryController,
} from './delivery.controller';
import { DeliveryService } from './delivery.service';

export function createDeliveryProvider(
  config: ConfigService,
  regions?: RegionConfigService,
) {
  const provider = (
    config.get<string>('DELIVERY_PROVIDER') ?? 'mock'
  ).toLowerCase();
  void provider;
  return new MockDeliveryProvider(regions);
}

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    NotificationsModule,
    AdminAlertsModule,
  ],
  controllers: [
    MeetPointsController,
    OrderDeliveryController,
    DeliveryWebhookController,
  ],
  providers: [
    DeliveryService,
    {
      provide: DELIVERY_PROVIDER,
      useFactory: createDeliveryProvider,
      inject: [ConfigService, RegionConfigService],
    },
  ],
  exports: [DeliveryService, DELIVERY_PROVIDER],
})
export class DeliveryModule {}
