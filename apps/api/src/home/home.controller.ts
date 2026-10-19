import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { HomeService } from './home.service';

class HomeQueryDto {
  @IsOptional()
  @IsString()
  community?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([2, 5, 10, 25])
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  getHome(
    @Query() query: HomeQueryDto,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.home.getHome({ ...query, viewerId: user?.id });
  }
}
