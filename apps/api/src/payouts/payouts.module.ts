import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SellerPayoutController } from './seller-payout.controller';
import { SellerPayoutService } from './seller-payout.service';
import {
  ACCOUNT_NAME_ENQUIRY,
  type AccountNameEnquiry,
} from './nibss-name-enquiry.provider';
import { MockNibssNameEnquiry } from './mock-nibss-name-enquiry';
import { PaystackAccountResolveAdapter } from './paystack-account-resolve.adapter';

function accountNameProvider(config: ConfigService): AccountNameEnquiry {
  const mode = (
    config.get<string>('ACCOUNT_NAME_PROVIDER') ?? 'mock'
  ).trim()
    .toLowerCase();
  if (mode === 'paystack') {
    return new PaystackAccountResolveAdapter(config);
  }
  return new MockNibssNameEnquiry();
}

@Module({
  imports: [ConfigModule],
  controllers: [SellerPayoutController],
  providers: [
    SellerPayoutService,
    {
      provide: ACCOUNT_NAME_ENQUIRY,
      useFactory: accountNameProvider,
      inject: [ConfigService],
    },
  ],
  exports: [SellerPayoutService],
})
export class PayoutsModule {}