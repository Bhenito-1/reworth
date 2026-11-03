import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { OPS } from '../admin/admin-roles';
import { PartnerDeliveryProvider } from '../providers/partner-delivery.provider';
import { DeliveryDriverGuard } from './driver.guard';
import { DeliveryService } from './delivery.service';
import {
  AssignDriverDto,
  DeliveryQuoteQueryDto,
  DeliveryWebhookDto,
  DriverMilestoneDto,
  MeetPointFulfilmentDto,
  MeetPointsQueryDto,
} from './dto/delivery.dto';

@Controller('meet-points')
export class MeetPointsController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  list(@Query() query: MeetPointsQueryDto) {
    return this.delivery.listMeetPoints(query.community);
  }
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get(':id/delivery-quote')
  quote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: DeliveryQuoteQueryDto,
  ) {
    return this.delivery.quote(id, user.id, query.toLat, query.toLng);
  }

  @Post(':id/fulfilment/meet-point')
  setMeetPoint(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MeetPointFulfilmentDto,
  ) {
    return this.delivery.setMeetPoint(id, user.id, dto.meetPointId);
  }

  @Post(':id/disclose-address')
  disclose(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.delivery.discloseAddress(id, user.id);
  }

  @Get(':id/shipment')
  shipment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.delivery.getShipment(id, user.id);
  }

  @Post(':id/assign-driver')
  @UseGuards(RolesGuard, AdminOnlyGuard)
  @Roles(...OPS)
  assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
    return this.delivery.assignDriver(id, dto.driverUserId);
  }

  @Post(':id/delivery/reattempt')
  reattempt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.delivery.reattemptDelivery(user.id, id);
  }
}

@Controller('driver')
@UseGuards(JwtAuthGuard, DeliveryDriverGuard)
export class DriverDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('assignments')
  list(@CurrentUser() user: AuthUser) {
    return this.delivery.listDriverAssignments(user.id);
  }

  @Post('shipments/:orderId/accept')
  accept(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.delivery.acceptDelivery(user.id, orderId);
  }

  @Post('shipments/:orderId/decline')
  decline(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.delivery.declineDelivery(user.id, orderId);
  }

  @Post('shipments/:orderId/milestones')
  milestone(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: DriverMilestoneDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.delivery.submitDriverMilestone(
      user.id,
      orderId,
      dto,
      idempotencyKey ?? '',
    );
  }
}

@Controller('webhooks')
export class DeliveryWebhookController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('delivery')
  webhook(
    @Body() dto: DeliveryWebhookDto,
    @Headers('x-reworth-delivery-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer | string },
  ) {
    const secret = process.env.DELIVERY_WEBHOOK_SECRET;
    const open =
      (process.env.DELIVERY_WEBHOOK_OPEN ?? '').trim().toLowerCase() === 'true';
    if (secret) {
      const raw =
        typeof req.rawBody === 'string'
          ? req.rawBody
          : req.rawBody
            ? req.rawBody.toString('utf8')
            : '';
      if (!raw) {
        throw new UnauthorizedException(
          'Delivery webhook requires the raw request body',
        );
      }
      const ok = PartnerDeliveryProvider.verifyWebhookSignature(
        raw,
        signature,
        secret,
      );
      if (!ok) {
        throw new UnauthorizedException('Invalid delivery webhook signature');
      }
    } else if (!open) {
      throw new UnauthorizedException(
        'Delivery webhook secret is not configured',
      );
    }
    return this.delivery.handleWebhook(dto);
  }
}
