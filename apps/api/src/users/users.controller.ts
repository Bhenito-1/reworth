import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AddressKind } from '@prisma/client';
import { ADDRESS_KIND } from '../addresses/address-kind';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { UpdateConsentsDto } from './dto/consents.dto';
import { SaveDeliveryAddressDto } from './dto/delivery-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch()
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user.id, dto);
  }

  @Get('addresses')
  listAddresses(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: 'PICKUP' | 'DELIVERY',
  ) {
    const parsed: AddressKind | undefined =
      kind === 'PICKUP'
        ? ADDRESS_KIND.PICKUP
        : kind === 'DELIVERY'
          ? ADDRESS_KIND.DELIVERY
          : undefined;
    return this.users.listAddresses(user.id, parsed);
  }

  @Get('delivery-address')
  getDeliveryAddress(@CurrentUser() user: AuthUser) {
    return this.users.getDeliveryAddress(user.id);
  }

  @Put('delivery-address')
  saveDeliveryAddress(
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveDeliveryAddressDto,
  ) {
    return this.users.saveDeliveryAddress(user.id, dto);
  }

  @Get('export')
  exportMe(@CurrentUser() user: AuthUser) {
    return this.users.exportMe(user.id);
  }

  @Get('consents')
  getConsents(@CurrentUser() user: AuthUser) {
    return this.users.getConsents(user.id);
  }

  @Put('consents')
  updateConsents(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateConsentsDto,
  ) {
    return this.users.updateConsents(user.id, dto);
  }

  @Get('devices')
  listDevices(@CurrentUser() user: AuthUser) {
    return this.users.listDevices(user.id);
  }

  @Delete('devices/:id')
  revokeDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.revokeDevice(user.id, id);
  }

  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.users.logoutAll(user.id);
  }

  @Post('delete-request')
  deleteRequest(
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    return this.users.requestDelete(user.id, req.ip);
  }
}
