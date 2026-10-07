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
import { FailLegDto } from '../swap/dto/swap.dto';
import {
  ConfirmOrderDto,
  CreateOrderDto,
  RejectOrderDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orders.listForUser(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.getById(id, user.id);
  }

  @Post(':id/handed-over')
  handedOver(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.markHandedOver(id, user.id);
  }

  @Post(':id/confirm-receipt')
  confirmReceipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.confirmReceipt(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.cancel(id, user.id);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmOrderDto,
  ) {
    return this.orders.confirm(id, user.id, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.orders.reject(id, user.id, dto);
  }

  @Post(':id/legs/:leg/handed-over')
  legHandedOver(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('leg') leg: string,
  ) {
    return this.orders.markLegHandedOver(id, leg, user.id);
  }

  @Post(':id/legs/:leg/confirm-receipt')
  legConfirmReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('leg') leg: string,
  ) {
    return this.orders.confirmLegReceipt(id, leg, user.id);
  }

  @Post(':id/legs/:leg/fail')
  legFail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('leg') leg: string,
    @Body() dto: FailLegDto,
  ) {
    return this.orders.failLeg(id, leg, user.id, dto.reason);
  }
}
