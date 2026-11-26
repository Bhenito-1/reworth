import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import {
  AssistListingDto,
  AttachImagesDto,
  AppealListingDto,
  BrowseListingsQueryDto,
  CreateListingDto,
  ReportListingDto,
  UpdateListingDto,
} from './dto/listings.dto';
import { ListingsService } from './listings.service';

@Controller()
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get('categories')
  listCategories() {
    return this.listings.listCategories();
  }

  @Post('listings')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateListingDto) {
    return this.listings.create(user.id, dto);
  }

  @Get('inventory')
  @UseGuards(JwtAuthGuard)
  inventory(@CurrentUser() user: AuthUser) {
    return this.listings.sellerInventory(user.id);
  }

  @Get('listings')
  @UseGuards(OptionalJwtAuthGuard)
  browse(
    @Query() query: BrowseListingsQueryDto,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.listings.browse(query, user?.id);
  }

  @Get('listings/mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthUser) {
    return this.listings.listMine(user.id);
  }

  @Get('listings/:id/delivery-estimate')
  @UseGuards(JwtAuthGuard)
  estimateDelivery(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('toLat') toLat: string,
    @Query('toLng') toLng: string,
    @Query('deliveryLine1') deliveryLine1?: string,
    @Query('deliveryCommunity') deliveryCommunity?: string,
    @Query('deliveryCity') deliveryCity?: string,
  ) {
    const lat = Number(toLat);
    const lng = Number(toLng);
    return this.listings.estimateDelivery(id, user.id, lat, lng, {
      line1: deliveryLine1,
      community: deliveryCommunity,
      city: deliveryCity,
    });
  }

  @Get('listings/:id')
  @UseGuards(OptionalJwtAuthGuard)
  getOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.listings.getById(id, user?.id);
  }

  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listings.update(id, user.id, dto);
  }

  @Delete('listings/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listings.softRemove(id, user.id);
  }

  @Post('listings/:id/assist')
  @UseGuards(JwtAuthGuard)
  assist(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AssistListingDto,
  ) {
    return this.listings.assist(id, user.id, dto);
  }

  @Post('listings/:id/publish')
  @UseGuards(JwtAuthGuard)
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listings.publish(id, user.id);
  }

  @Post('listings/:id/images')
  @UseGuards(JwtAuthGuard)
  attachImages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AttachImagesDto,
  ) {
    return this.listings.attachImages(id, user.id, dto);
  }

  @Get('listings/:id/price-intelligence')
  priceIntelligence(@Param('id') id: string) {
    return this.listings.priceIntelligence(id);
  }

  @Post('listings/:id/report')
  @UseGuards(JwtAuthGuard)
  report(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReportListingDto,
  ) {
    return this.listings.report(id, user.id, dto);
  }

  @Post('listings/:id/appeal')
  @UseGuards(JwtAuthGuard)
  appeal(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AppealListingDto,
  ) {
    return this.listings.createAppeal(id, user.id, dto.reason);
  }
}
