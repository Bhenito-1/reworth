import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAlertsModule } from '../admin/admin-alerts.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DELIVERY_PROVIDER } from '../providers/delivery.provider';
import { MockDeliveryProvider } from '../providers/mock-delivery.provider';
import { PartnerDeliveryProvider } from '../providers/partner-delivery.provider';
import { RegionConfigService } from '../region/region-config.service';
import {
  DeliveryWebhookController,
  DriverDeliveryController,
  MeetPointsController,
  OrderDeliveryController,
} from './delivery.controller';
import { DeliveryDriverGuard } from './driver.guard';
import { DeliveryService } from './delivery.service';

export function createDeliveryProvider(
  config: ConfigService,
  regions?: RegionConfigService,
) {
  const provider = (
    config.get<string>('DELIVERY_PROVIDER') ?? 'mock'
  ).toLowerCase();
  if (provider === 'partner') {
    return PartnerDeliveryProvider.fromEnv(regions);
  }
  return new MockDeliveryProvider(regions);
}

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    ConfigModule,
    NotificationsModule,
    AdminAlertsModule,
  ],
  controllers: [
    MeetPointsController,
    OrderDeliveryController,
    DriverDeliveryController,
    DeliveryWebhookController,
  ],
  providers: [
    DeliveryService,
    DeliveryDriverGuard,
    RolesGuard,
    AdminOnlyGuard,
    {
      provide: DELIVERY_PROVIDER,
      useFactory: createDeliveryProvider,
      inject: [ConfigService, RegionConfigService],
    },
  ],
  exports: [DeliveryService, DELIVERY_PROVIDER],
})
export class DeliveryModule {}
