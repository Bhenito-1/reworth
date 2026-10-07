import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { NIGERIAN_BANKS } from './banks';
import { VerifyPayoutAccountDto } from './dto/verify-payout-account.dto';
import { SellerPayoutService } from './seller-payout.service';

@Controller('sellers')
@UseGuards(JwtAuthGuard)
export class SellerPayoutController {
  constructor(private readonly payouts: SellerPayoutService) {}

  @Get('banks')
  banks() {
    return { items: NIGERIAN_BANKS };
  }

  @Get('payout-account')
  async current(@CurrentUser() user: AuthUser) {
    const account = await this.payouts.current(user.id);
    return {
      account,
      nameEnquiryMode: this.payouts.nameEnquiryMode(),
    };
  }

  @Post('payout-account/verify')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyPayoutAccountDto) {
    return this.payouts.verify(user.id, dto);
  }
}
