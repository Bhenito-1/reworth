import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockNibssNameEnquiry } from './mock-nibss-name-enquiry';
import { PaystackAccountResolveAdapter } from './paystack-account-resolve.adapter';
import { ACCOUNT_NAME_ENQUIRY } from './nibss-name-enquiry.provider';
import { SellerPayoutController } from './seller-payout.controller';
import { SellerPayoutService } from './seller-payout.service';

@Module({
  imports: [ConfigModule],
  controllers: [SellerPayoutController],
  providers: [
    SellerPayoutService,
    {
      provide: ACCOUNT_NAME_ENQUIRY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider =
          config.get<string>('ACCOUNT_NAME_PROVIDER') ??
          config.get<string>('NIBSS_NAME_ENQUIRY_PROVIDER') ??
          'mock';
        if (provider === 'paystack') {
          return new PaystackAccountResolveAdapter(config);
        }
        return new MockNibssNameEnquiry();
      },
    },
  ],
  exports: [SellerPayoutService],
})
export class PayoutsModule {}
