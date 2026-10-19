import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import {
  CheckoutCartDto,
  UpdateCartItemDto,
  UpsertCartItemDto,
} from './dto/cart.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.cart.list(user.id);
  }

  @Post('items')
  add(@CurrentUser() user: AuthUser, @Body() dto: UpsertCartItemDto) {
    return this.cart.upsert(user.id, dto);
  }

  @Patch('items/:listingId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('listingId') listingId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateQuantity(user.id, listingId, dto.quantity);
  }

  @Delete('items/:listingId')
  remove(@CurrentUser() user: AuthUser, @Param('listingId') listingId: string) {
    return this.cart.remove(user.id, listingId);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutCartDto) {
    return this.cart.checkout(user.id, dto);
  }
}
