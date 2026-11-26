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
import {
  CounterMeetupProposalDto,
  CreateMeetupProposalDto,
} from './dto/meetups.dto';
import { MeetupsService } from './meetups.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MeetupsController {
  constructor(private readonly meetups: MeetupsService) {}

  @Post('listings/:id/meetups')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') listingId: string,
    @Body() dto: CreateMeetupProposalDto,
  ) {
    return this.meetups.create(listingId, user.id, dto);
  }

  @Get('listings/:id/meetups')
  list(@CurrentUser() user: AuthUser, @Param('id') listingId: string) {
    return this.meetups.listForListing(listingId, user.id);
  }

  @Post('meetups/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetups.accept(id, user.id);
  }

  @Post('meetups/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetups.reject(id, user.id);
  }

  @Post('meetups/:id/counter')
  counter(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CounterMeetupProposalDto,
  ) {
    return this.meetups.counter(id, user.id, dto);
  }

  @Delete('meetups/:id')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetups.withdraw(id, user.id);
  }
}