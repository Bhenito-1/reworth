import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { DeliveryModule } from './delivery/delivery.module';
import { DisputesModule } from './disputes/disputes.module';
import { FavouritesModule } from './favourites/favourites.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { IdentityModule } from './identity/identity.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { ListingsModule } from './listings/listings.module';
import { MediaModule } from './media/media.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OffersModule } from './offers/offers.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReviewsModule } from './reviews/reviews.module';
import { RiskModule } from './risk/risk.module';
import { SearchModule } from './search/search.module';
import { SwapModule } from './swap/swap.module';
import { MovingSalesModule } from './moving-sales/moving-sales.module';
import { CommunitiesModule } from './communities/communities.module';
import { UsersModule } from './users/users.module';
import { VerticalsModule } from './verticals/verticals.module';
import { ProModule } from './pro/pro.module';
import { ReferralsModule } from './referrals/referrals.module';
import { AssistantModule } from './assistant/assistant.module';
import { RoomScanModule } from './room-scan/room-scan.module';
import { PlatformServicesModule } from './platform-services/platform-services.module';
import { RegionModule } from './region/region.module';
import { CorporateModule } from './corporate/corporate.module';
import { PartnerModule } from './partner/partner.module';
import { CircularModule } from './circular/circular.module';
import { MonetizationModule } from './monetization/monetization.module';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Prefer monorepo-root .env; apps/api/.env is only a local override/mirror.
      envFilePath: [join(process.cwd(), '../../.env'), '.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: true,
        // Drop headers (including the bearer token) so each request log stays small.
        serializers: {
          req(req: { id?: string; method?: string; url?: string }) {
            return { id: req.id, method: req.method, url: req.url };
          },
          res(res: { statusCode?: number }) {
            return { statusCode: res.statusCode };
          },
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 20,
      },
      {
        name: 'search',
        ttl: 60_000,
        limit: 60,
      },
      {
        name: 'upload',
        ttl: 60_000,
        limit: 30,
      },
    ]),
    PrismaModule,
    RegionModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    IdentityModule,
    AdminModule,
    MediaModule,
    ListingsModule,
    RiskModule,
    ModerationModule,
    SearchModule,
    HomeModule,
    IntelligenceModule,
    FavouritesModule,
    ChatModule,
    OffersModule,
    SwapModule,
    MovingSalesModule,
    CommunitiesModule,
    NotificationsModule,
    DeliveryModule,
    OrdersModule,
    CartModule,
    PaymentsModule,
    PayoutsModule,
    DisputesModule,
    ReviewsModule,
    VerticalsModule,
    ProModule,
    ReferralsModule,
    AssistantModule,
    RoomScanModule,
    PlatformServicesModule,
    CorporateModule,
    PartnerModule,
    CircularModule,
    MonetizationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
