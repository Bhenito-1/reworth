import { Module } from '@nestjs/common';
import { SellerPayoutController } from './seller-payout.controller';
import { SellerPayoutService } from './seller-payout.service';

@Module({
  controllers: [SellerPayoutController],
  providers: [SellerPayoutService],
  exports: [SellerPayoutService],
})
export class PayoutsModule {}
