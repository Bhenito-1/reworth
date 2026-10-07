import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { MovingSalesModule } from '../moving-sales/moving-sales.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryAnalyticsService } from '../discovery/discovery-analytics.service';
import { HomeCache } from './home.cache';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    MovingSalesModule,
    CommunitiesModule,
    IntelligenceModule,
  ],
  controllers: [HomeController],
  providers: [HomeService, HomeCache, DiscoveryAnalyticsService],
  exports: [HomeService, HomeCache],
})
export class HomeModule {}
