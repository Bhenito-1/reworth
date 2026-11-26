import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { HomeModule } from '../home/home.module';
import { RegionModule } from '../region/region.module';
import { RoutingModule } from '../routing/routing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GiveawayClaimsService } from './giveaway-claims.service';
import { SwapController } from './swap.controller';
import { SwapExpiryScheduler } from './swap-expiry.scheduler';
import { SwapDeliveryQuotesService } from './swap-delivery-quotes.service';
import { SwapProposalsService } from './swap-proposals.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    NotificationsModule,
    ChatModule,
    HomeModule,
    DeliveryModule,
    RegionModule,
    RoutingModule,
  ],
  controllers: [SwapController],
  providers: [
    SwapDeliveryQuotesService,
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
