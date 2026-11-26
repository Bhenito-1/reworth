import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { NlSearchDto, SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  keyword(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.search.search(query, user?.id);
  }

  @Post('nl')
  @UseGuards(OptionalJwtAuthGuard)
  nl(@Body() dto: NlSearchDto, @CurrentUser() user: AuthUser | null) {
    return this.search.searchNl(dto, user?.id);
  }
}
