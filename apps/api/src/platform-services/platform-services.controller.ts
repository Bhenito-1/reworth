import {
  Body,
  Controller,
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
import { ConsignmentService } from './consignment.service';
import {
  CreateConsignmentDto,
  CreateManagedPickupDto,
  CreateValuationDto,
  MarkConsignmentSoldDto,
} from './dto/platform-services.dto';
import { ManagedPickupService } from './managed-pickup.service';
import { ValuationProductService } from './valuation-product.service';

@Controller()
export class PlatformServicesController {
  constructor(
    private readonly valuations: ValuationProductService,
    private readonly consignments: ConsignmentService,
    private readonly pickups: ManagedPickupService,
  ) {}

  @Post('valuations')
  @UseGuards(JwtAuthGuard)
  createValuation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateValuationDto,
  ) {
    return this.valuations.value({
      userId: user.id,
      photoKey: dto.photoKey,
      listingId: dto.listingId,
      city: dto.city,
    });
  }

  @Post('consignments')
  @UseGuards(JwtAuthGuard)
  intake(@CurrentUser() user: AuthUser, @Body() dto: CreateConsignmentDto) {
    return this.consignments.intake(user.id, dto);
  }

  @Post('consignments/:id/list')
  @UseGuards(JwtAuthGuard)
  listConsignment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.consignments.listOnPlatform(id, user.id);
  }

  @Post('consignments/:id/sold')
  @UseGuards(JwtAuthGuard)
  markSold(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MarkConsignmentSoldDto,
  ) {
    return this.consignments.markSold(id, dto.soldPriceKobo, user.id);
  }

  @Post('consignments/:id/return')
  @UseGuards(JwtAuthGuard)
  markReturned(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.consignments.markReturned(id, user.id);
  }

  @Get('me/consignments')
  @UseGuards(JwtAuthGuard)
  myConsignments(@CurrentUser() user: AuthUser) {
    return this.consignments.mine(user.id);
  }

  @Post('managed-pickups')
  @UseGuards(JwtAuthGuard)
  bookPickup(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManagedPickupDto,
  ) {
    return this.pickups.book(user.id, dto);
  }

  @Get('me/managed-pickups')
  @UseGuards(JwtAuthGuard)
  myPickups(@CurrentUser() user: AuthUser) {
    return this.pickups.mine(user.id);
  }
}
