import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AnalyticsService } from '../listings/analytics.service';
import { ListingsModule } from '../listings/listings.module';
import { MonetizationModule } from '../monetization/monetization.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RoomScanModule } from '../room-scan/room-scan.module';
import { ConsignmentExpiryScheduler } from './consignment.scheduler';
import { ConsignmentService } from './consignment.service';
import { ManagedPickupService } from './managed-pickup.service';
import { PlatformServicesController } from './platform-services.controller';
import { ValuationProductService } from './valuation-product.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    forwardRef(() => ListingsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => IntelligenceModule),
    forwardRef(() => RoomScanModule),
    MonetizationModule,
  ],
  controllers: [PlatformServicesController],
  providers: [
    AnalyticsService,
    ConsignmentService,
    ConsignmentExpiryScheduler,
    ManagedPickupService,
    ValuationProductService,
  ],
  exports: [
    ConsignmentService,
    ManagedPickupService,
    ValuationProductService,
  ],
})
export class PlatformServicesModule {}
