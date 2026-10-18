import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CounterSwapProposalDto,
  CreateGiveawayClaimDto,
  CreateSwapProposalDto,
} from './dto/swap.dto';
import { GiveawayClaimsService } from './giveaway-claims.service';
import { SwapProposalsService } from './swap-proposals.service';

/**
 * Swap + Give-Away API (Phase 2.1).
 *
 * Swap:
 * - POST /listings/:id/swap-proposals
 * - GET  /listings/:id/swap-proposals
 * - POST /swap-proposals/:id/accept|reject|counter
 * - DELETE /swap-proposals/:id
 *
 * Give-away:
 * - POST /listings/:id/giveaway-claims
 * - GET  /listings/:id/giveaway-claims
 * - POST /giveaway-claims/:id/approve|reject
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class SwapController {
  constructor(
    private readonly proposals: SwapProposalsService,
    private readonly claims: GiveawayClaimsService,
  ) {}

  @Post('listings/:id/swap-proposals')
  createProposal(
    @CurrentUser() user: AuthUser,
    @Param('id') listingId: string,
    @Body() dto: CreateSwapProposalDto,
  ) {
    return this.proposals.create(listingId, user.id, dto);
  }

  @Get('listings/:id/swap-proposals')
  listProposals(
    @CurrentUser() user: AuthUser,
    @Param('id') listingId: string,
  ) {
    return this.proposals.listForListing(listingId, user.id);
  }

  @Post('listings/:id/swap-offer')
  startOffer(@CurrentUser() user: AuthUser, @Param('id') listingId: string) {
    return this.proposals.startOffer(listingId, user.id);
  }

  @Post('swap-proposals/:id/accept')
  acceptProposal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proposals.accept(id, user.id);
  }

  @Post('swap-proposals/:id/reject')
  rejectProposal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proposals.reject(id, user.id);
  }

  @Post('swap-proposals/:id/counter')
  counterProposal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CounterSwapProposalDto,
  ) {
    return this.proposals.counter(id, user.id, dto);
  }

  @Post('swap-proposals/:id/cancel')
  cancelProposal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proposals.cancel(id, user.id);
  }

  @Delete('swap-proposals/:id')
  withdrawProposal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proposals.withdraw(id, user.id);
  }

  @Get('listings/:id/gift-delivery-quote')
  giftDeliveryQuote(
    @CurrentUser() user: AuthUser,
    @Param('id') listingId: string,
  ) {
    return this.claims.previewDelivery(listingId, user.id);
  }

  @Post('listings/:id/giveaway-claims')
  claim(
    @CurrentUser() user: AuthUser,
    @Param('id') listingId: string,
    @Body() dto: CreateGiveawayClaimDto,
  ) {
    return this.claims.claim(listingId, user.id, dto);
  }

  @Get('listings/:id/giveaway-claims')
  listClaims(@CurrentUser() user: AuthUser, @Param('id') listingId: string) {
    return this.claims.listForListing(listingId, user.id);
  }

  @Post('giveaway-claims/:id/approve')
  approveClaim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.claims.approve(id, user.id);
  }

  @Post('giveaway-claims/:id/reject')
  rejectClaim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.claims.reject(id, user.id);
  }
}
