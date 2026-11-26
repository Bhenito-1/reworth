import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { RegionModule } from '../region/region.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryAnalyticsService } from '../discovery/discovery-analytics.service';
import {
  OpenSearchSearchProvider,
  PostgresFullTextSearchProvider,
  SEARCH_PROVIDER,
} from '../providers/search.provider';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, CommunitiesModule, RegionModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    DiscoveryAnalyticsService,
    {
      provide: SEARCH_PROVIDER,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const postgres = new PostgresFullTextSearchProvider(prisma);
        const provider = (
          config.get<string>('SEARCH_PROVIDER') ?? 'postgres'
        ).toLowerCase();
        const useFallback =
          (config.get<string>('SEARCH_USE_POSTGRES_FTS_FALLBACK') ?? 'true') ===
            'true' ||
          !config.get<string>('OPENSEARCH_NODE');

        if (provider === 'opensearch') {
          return new OpenSearchSearchProvider(postgres, useFallback);
        }
        return postgres;
      },
    },
  ],
  exports: [SearchService, SEARCH_PROVIDER],
})
export class SearchModule {}
