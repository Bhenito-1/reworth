import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OPS } from '../admin/admin-roles';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConsignmentService } from './consignment.service';
import {
  CreateConsignmentDto,
  CreateManagedPickupDto,
  CreateValuationDto,
  MarkConsignmentSoldDto,
  ScheduleInstantBuyDto,
} from './dto/platform-services.dto';
import { InstantBuyService } from './instant-buy.service';
import { ManagedPickupService } from './managed-pickup.service';
import { ValuationProductService } from './valuation-product.service';

@Controller()
export class PlatformServicesController {
  constructor(
    private readonly valuations: ValuationProductService,
    private readonly instantBuy: InstantBuyService,
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

  @Get('instant-buy/fulfilments/:id')
  @UseGuards(JwtAuthGuard)
  getFulfilment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const isOps = user.roles?.some((r) =>
      ['SUPER_ADMIN', 'OPERATIONS', 'OPS'].includes(r),
    );
    return this.instantBuy.get(id, user.id, Boolean(isOps));
  }

  @Get('instant-buy/by-order/:orderId')
  @UseGuards(JwtAuthGuard)
  getFulfilmentByOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    const isOps = user.roles?.some((r) =>
      ['SUPER_ADMIN', 'OPERATIONS', 'OPS'].includes(r),
    );
    return this.instantBuy.getByOrder(orderId, user.id, Boolean(isOps));
  }

  @Post('instant-buy/fulfilments/:id/schedule')
  @UseGuards(JwtAuthGuard)
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ScheduleInstantBuyDto,
  ) {
    const isOps = user.roles?.some((r) =>
      ['SUPER_ADMIN', 'OPERATIONS'].includes(r),
    );
    return this.instantBuy.schedulePickup(
      id,
      user.id,
      new Date(dto.slotStartAt),
      new Date(dto.slotEndAt),
      Boolean(isOps),
    );
  }

  @Post('instant-buy/fulfilments/:id/picked-up')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...OPS)
  pickedUp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.instantBuy.markPickedUp(id, user.id, true);
  }

  @Post('instant-buy/fulfilments/:id/in-transit')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...OPS)
  inTransit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.instantBuy.markInTransit(id, user.id, true);
  }

  @Post('instant-buy/fulfilments/:id/delivered')
  @UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
  @Roles(...OPS)
  delivered(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.instantBuy.markDelivered(id, user.id, true);
  }

  @Post('instant-buy/fulfilments/:id/confirm')
  @UseGuards(JwtAuthGuard)
  buyerConfirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.instantBuy.buyerConfirm(id, user.id);
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
