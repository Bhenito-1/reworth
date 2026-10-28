import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { HomeModule } from '../home/home.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VisionModule } from '../vision/vision.module';
import { GiveawayClaimsService } from './giveaway-claims.service';
import { SwapController } from './swap.controller';
import { SwapExpiryScheduler } from './swap-expiry.scheduler';
import { SwapProposalsService } from './swap-proposals.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    NotificationsModule,
    VisionModule,
    ChatModule,
    HomeModule,
  ],
  controllers: [SwapController],
  providers: [
    SwapProposalsService,
    GiveawayClaimsService,
    SwapExpiryScheduler,
  ],
  exports: [
    SwapProposalsService,
    GiveawayClaimsService,
    SwapExpiryScheduler,
  ],
})
export class SwapModule {}
