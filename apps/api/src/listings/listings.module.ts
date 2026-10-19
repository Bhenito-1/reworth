import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MediaModule } from '../media/media.module';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { FavouritesModule } from '../favourites/favourites.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RiskModule } from '../risk/risk.module';
import {
  AI_LISTING_PROVIDER,
} from '../providers/ai-listing.provider';
import { RuleBasedAiMock } from '../providers/rule-based-ai.mock';
import { OpenAiListingProvider } from '../providers/openai-listing.provider';
import {
  GEOCODING_PROVIDER,
  MockGeocodingProvider,
} from '../providers/geocoding.provider';
import { RegionConfigService } from '../region/region-config.service';
import { AnalyticsService } from './analytics.service';
import { FraudRulesService } from './fraud-rules.service';
import { ListingAssistService } from './listing-assist.service';
import { ListingExpiryScheduler } from './listing-expiry.scheduler';
import { AdminAlertsModule } from '../admin/admin-alerts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { PriceIntelligenceService } from './price-intelligence.service';

@Module({
  imports: [
    ConfigModule,
    MediaModule,
    AuthModule,
    CommunitiesModule,
    forwardRef(() => FavouritesModule),
    forwardRef(() => IntelligenceModule),
    forwardRef(() => RiskModule),
    ModerationModule,
    NotificationsModule,
    AdminAlertsModule,
    InventoryModule,
    PayoutsModule,
  ],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    AnalyticsService,
    FraudRulesService,
    ListingAssistService,
    PriceIntelligenceService,
    ListingExpiryScheduler,
    {
      provide: AI_LISTING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('AiListingProvider');
        const provider = (
          config.get<string>('AI_PROVIDER') ?? 'mock'
        ).toLowerCase();
        const apiKey = config.get<string>('OPENAI_API_KEY')?.trim();
        const model = config.get<string>('OPENAI_MODEL') ?? 'gpt-4o';
        const wantsOpenAi =
          provider === 'openai' || provider === 'gpt' || provider === 'gpt-4o';

        if (wantsOpenAi && apiKey) {
          logger.log(`Using OpenAiListingProvider model=${model}`);
          return new OpenAiListingProvider({
            apiKey,
            model,
            baseUrl: config.get<string>('OPENAI_BASE_URL') || undefined,
            fallback: new RuleBasedAiMock(),
          });
        }

        if (wantsOpenAi && !apiKey) {
          logger.warn(
            'AI_PROVIDER=openai but OPENAI_API_KEY is empty — falling back to rule-based mock',
          );
        } else {
          logger.log('Using RuleBasedAiMock listing assist');
        }
        return new RuleBasedAiMock();
      },
    },
    {
      provide: GEOCODING_PROVIDER,
      useFactory: (regions: RegionConfigService) =>
        new MockGeocodingProvider(regions),
      inject: [RegionConfigService],
    },
  ],
  exports: [ListingsService, FraudRulesService, ListingExpiryScheduler],
})
export class ListingsModule {}
