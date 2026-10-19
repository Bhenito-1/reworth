import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateReviewDto,
  ReplyReviewDto,
  ReportReviewDto,
} from './dto/reviews.dto';
import { ReviewsService } from './reviews.service';
import { TrustScoreService } from './trust-score.service';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly trust: TrustScoreService,
  ) {}

  @Post('orders/:id/reviews')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') orderId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.createForOrder(orderId, user.id, dto);
  }

  @Post('reviews/:id/reply')
  @UseGuards(JwtAuthGuard)
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviews.reply(id, user.id, dto);
  }

  @Post('reviews/:id/report')
  @UseGuards(JwtAuthGuard)
  report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviews.report(id, user.id, dto);
  }

  @Get('users/:id/reviews')
  listForUser(@Param('id') id: string) {
    return this.reviews.listPublishedForUser(id);
  }

  @Get('listings/:id/reviews')
  listForListing(@Param('id') id: string) {
    return this.reviews.listForListing(id);
  }

  @Get('users/:id/trust-score')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async trustScore(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const isSelf = user.id === id;
    const isAdmin = user.roles?.some((r) =>
      (
        [
          AdminRole.SUPER_ADMIN,
          AdminRole.OPERATIONS,
          AdminRole.CUSTOMER_SUPPORT,
          AdminRole.RISK_FRAUD,
        ] as string[]
      ).includes(r),
    );
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('Trust score breakdown is private');
    }
    return this.trust.getBreakdown(id);
  }

  @Get('users/:id')
  @UseGuards(OptionalJwtAuthGuard)
  publicProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.reviews.getPublicProfile(id, user?.id ?? null);
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminOnlyGuard)
export class AdminTrustController {
  constructor(private readonly trust: TrustScoreService) {}

  @Get('users/:id/trust-score')
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.OPERATIONS,
    AdminRole.CUSTOMER_SUPPORT,
    AdminRole.RISK_FRAUD,
  )
  getTrustScore(@Param('id') id: string) {
    return this.trust.getBreakdown(id);
  }
}
