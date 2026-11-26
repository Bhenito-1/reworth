import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCE, OPS } from '../admin/admin-roles';
import { FeeConfigService } from './fee-config.service';
import { FinanceDashboardService } from './finance-dashboard.service';
import { ReconciliationService } from './reconciliation.service';
import { SellerPromotionsService } from './seller-promotions.service';
import { SellerSubscriptionService } from './seller-subscription.service';
import {
  BoostPurchaseDto,
  BoostQuoteDto,
  FeaturedPurchaseDto,
  PublishFeeConfigDto,
  SellerPlusUpgradeDto,
} from './dto/monetization.dto';

@Controller()
export class MonetizationController {
  constructor(
    private readonly promotions: SellerPromotionsService,
    private readonly subscriptions: SellerSubscriptionService,
    private readonly fees: FeeConfigService,
    private readonly finance: FinanceDashboardService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get('monetization/fees/active')
  async activeFees() {
    return this.fees.getActive();
  }

  @Get('monetization/boost/quote')
  @UseGuards(JwtAuthGuard)
  boostQuote(@Query() q: BoostQuoteDto) {
    return this.promotions.quoteBoost(Number(q.hours));
  }

  @Post('monetization/boost')
  @UseGuards(JwtAuthGuard)
  boost(
    @CurrentUser() user: AuthUser,
    @Body() dto: BoostPurchaseDto,
    @Headers('origin') origin?: string,
  ) {
    return this.promotions.purchaseBoost(
      user.id,
      dto.listingId,
      dto.hours,
      dto.idempotencyKey,
      origin,
    );
  }

  @Get('monetization/featured/quote')
  @UseGuards(JwtAuthGuard)
  featuredQuote() {
    return this.promotions.quoteFeatured();
  }

  @Post('monetization/featured')
  @UseGuards(JwtAuthGuard)
  featured(
    @CurrentUser() user: AuthUser,
    @Body() dto: FeaturedPurchaseDto,
    @Headers('origin') origin?: string,
  ) {
    return this.promotions.purchaseFeatured(
      user.id,
      dto.listingId,
      dto.idempotencyKey,
      origin,
    );
  }

  @Get('listings/:id/promotions')
  listingPromotions(@Param('id') id: string) {
    return this.promotions.activeForListing(id);
  }

  @Get('me/seller-plan')
  @UseGuards(JwtAuthGuard)
  myPlan(@CurrentUser() user: AuthUser) {
    return this.subscriptions.benefits(user.id);
  }

  @Post('me/seller-plan/plus')
  @UseGuards(JwtAuthGuard)
  upgradePlus(
    @CurrentUser() user: AuthUser,
    @Body() dto: SellerPlusUpgradeDto,
    @Headers('origin') origin?: string,
  ) {
    return this.subscriptions.upgradeToPlus(user.id, dto.idempotencyKey, origin);
  }

  @Post('me/seller-plan/cancel')
  @UseGuards(JwtAuthGuard)
  cancelPlus(@CurrentUser() user: AuthUser) {
    return this.subscriptions.cancel(user.id);
  }

  @Post('me/seller-plan/downgrade')
  @UseGuards(JwtAuthGuard)
  downgrade(@CurrentUser() user: AuthUser) {
    return this.subscriptions.downgradeNow(user.id);
  }

  /** Test/demo: failed renewal → grace. */
  @Post('me/seller-plan/simulate-failure')
  @UseGuards(JwtAuthGuard)
  simulateFail(@CurrentUser() user: AuthUser) {
    return this.subscriptions.simulatePaymentFailure(user.id);
  }

  // ── Admin finance ─────────────────────────────────────────────────

  @Get('admin/finance/summary')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...FINANCE, ...OPS)
  summary(@Query('days') days?: string) {
    return this.finance.summary(days ? Number(days) : 30);
  }

  @Get('admin/finance/fees')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...FINANCE, ...OPS)
  listFees() {
    return this.fees.listVersions();
  }

  @Post('admin/finance/fees')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...FINANCE)
  publishFees(
    @CurrentUser() user: AuthUser,
    @Body() dto: PublishFeeConfigDto,
  ) {
    return this.fees.publishNew(user.id, dto.rates as never, dto.note);
  }

  @Get('admin/finance/reconciliation')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...FINANCE, ...OPS)
  async reconStatus() {
    const [latest, alerts] = await Promise.all([
      this.reconciliation.latest(),
      this.reconciliation.listAlerts(true),
    ]);
    return { latest, alerts };
  }

  @Post('admin/finance/reconciliation/run')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...FINANCE)
  runRecon(@Body() body?: { injectMismatch?: boolean }) {
    return this.reconciliation.run({
      injectMismatch: body?.injectMismatch === true,
    });
  }

  @Post('admin/finance/alerts/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...FINANCE)
  resolveAlert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.reconciliation.resolveAlert(id, user.id);
  }
}
