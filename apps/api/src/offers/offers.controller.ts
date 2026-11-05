import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { CounterOfferDto, CreateOfferDto } from './dto/offers.dto';
import { OffersService } from './offers.service';

/**
 * Offers API.
 *
 * Response shapes:
 * - POST /listings/:id/offers → OfferDto
 * - GET /listings/:id/offers → OfferDto[]
 * - POST /offers/:id/accept → { offer: OfferDto, orderIntent: { id, reservedUntil, amountKobo } }
 * - POST /offers/:id/reject | counter → OfferDto
 * - DELETE /offers/:id → OfferDto (WITHDRAWN)
 *
 * OfferDto: { id, listingId, conversationId, buyerId, sellerId, amountKobo,
 *   note, status, parentOfferId, expiresAt, createdAt, updatedAt }
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post('listings/:id/offers')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') listingId: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offers.create(listingId, user.id, dto);
  }

  @Get('listings/:id/offers')
  list(@CurrentUser() user: AuthUser, @Param('id') listingId: string) {
    return this.offers.listForListing(listingId, user.id);
  }

  @Post('offers/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offers.accept(id, user.id);
  }

  @Post('offers/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offers.reject(id, user.id);
  }

  @Post('offers/:id/counter')
  counter(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.offers.counter(id, user.id, dto);
  }

  @Delete('offers/:id')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offers.withdraw(id, user.id);
  }

  @Get('order-intents/:id')
  getOrderIntent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offers.getOrderIntent(id, user.id);
  }
}
