import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HomeModule } from '../home/home.module';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAlertsController } from './admin-alerts.controller';
import { AdminAlertsModule } from './admin-alerts.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPortalController } from './admin-portal.controller';
import { AdminPortalService } from './admin-portal.service';
import { AdminSeedService } from './admin-seed.service';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    HomeModule,
    AdminAlertsModule,
    NotificationsModule,
    ModerationModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [
    AdminAuthController,
    AdminAlertsController,
    AdminUsersController,
    AdminPortalController,
  ],
  providers: [
    AdminSeedService,
    AdminAuthService,
    AdminDashboardService,
    AdminPortalService,
    RolesGuard,
    AdminOnlyGuard,
  ],
  exports: [AdminPortalService, AdminDashboardService],
})
export class AdminModule {}
