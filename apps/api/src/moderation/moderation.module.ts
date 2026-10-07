import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAlertsModule } from '../admin/admin-alerts.module';
import { VisionModule } from '../vision/vision.module';
import { IMAGE_MODERATION_PROVIDER } from './image-moderation.provider';
import { MockImageModerationProvider } from './mock-image-moderation.provider';
import { ModerationService } from './moderation.service';

@Module({
  imports: [PrismaModule, NotificationsModule, VisionModule, AdminAlertsModule],
  providers: [
    ModerationService,
    {
      provide: IMAGE_MODERATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (_config: ConfigService) => {
        // Prod adapter deferred — mock is deterministic for Phase 9.
        void _config;
        return new MockImageModerationProvider();
      },
    },
  ],
  exports: [ModerationService, IMAGE_MODERATION_PROVIDER],
})
export class ModerationModule {}
