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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PartnerDeliveryProvider } from '../providers/partner-delivery.provider';
import { DeliveryService } from './delivery.service';
import {
  DeliveryQuoteQueryDto,
  DeliveryWebhookDto,
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
    if (secret) {
      const raw =
        typeof req.rawBody === 'string'
          ? req.rawBody
          : req.rawBody
            ? req.rawBody.toString('utf8')
            : JSON.stringify(dto);
      const ok = PartnerDeliveryProvider.verifyWebhookSignature(
        raw,
        signature,
        secret,
      );
      if (!ok) {
        throw new UnauthorizedException('Invalid delivery webhook signature');
      }
    }
    return this.delivery.handleWebhook(dto);
  }
}
