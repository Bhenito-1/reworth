import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VerticalsModule } from '../verticals/verticals.module';
import { AdminAlertsModule } from '../admin/admin-alerts.module';
import { DisputeSellerExpiryScheduler } from './dispute-seller-expiry.scheduler';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    NotificationsModule,
    AdminAlertsModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => VerticalsModule),
  ],
  controllers: [DisputesController],
  providers: [
    DisputesService,
    DisputeSellerExpiryScheduler,
    RolesGuard,
    AdminOnlyGuard,
  ],
  exports: [DisputesService],
})
export class DisputesModule {}
