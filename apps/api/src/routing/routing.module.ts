import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  GEOCODING_PROVIDER,
  MockGeocodingProvider,
} from '../providers/geocoding.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { RegionModule } from '../region/region.module';
import { RegionConfigService } from '../region/region-config.service';
import { OpenRouteServiceClient } from './openrouteservice.client';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';
import { StreetGeocodeAnchorService } from './street-geocode-anchor.service';

@Module({
  imports: [ConfigModule, RegionModule, PrismaModule],
  controllers: [RoutingController],
  providers: [
    OpenRouteServiceClient,
    StreetGeocodeAnchorService,
    {
      provide: GEOCODING_PROVIDER,
      useFactory: (regions: RegionConfigService) =>
        new MockGeocodingProvider(regions),
      inject: [RegionConfigService],
    },
    RoutingService,
  ],
  exports: [RoutingService, OpenRouteServiceClient, StreetGeocodeAnchorService],
})
export class RoutingModule {}