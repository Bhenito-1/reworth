import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryShipmentStatus } from '@prisma/client';

export class DeliveryQuoteQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  toLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  toLng!: number;
}

export class MeetPointFulfilmentDto {
  @IsUUID()
  meetPointId!: string;
}

export class DeliveryWebhookDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  providerRef?: string;

  @IsEnum(DeliveryShipmentStatus)
  status!: DeliveryShipmentStatus;

  @IsOptional()
  @IsString()
  failureReason?: string;
}

export class MeetPointsQueryDto {
  @IsOptional()
  @IsString()
  community?: string;
}

/** Driver-submitted milestone (excludes QUOTED). */
export const DRIVER_MILESTONE_STATUSES = [
  DeliveryShipmentStatus.ASSIGNED,
  DeliveryShipmentStatus.PICKED_UP,
  DeliveryShipmentStatus.IN_TRANSIT,
  DeliveryShipmentStatus.OUT_FOR_DELIVERY,
  DeliveryShipmentStatus.DELIVERED,
  DeliveryShipmentStatus.FAILED,
] as const;

export class DriverMilestoneDto {
  @IsEnum(DeliveryShipmentStatus)
  status!: DeliveryShipmentStatus;

  @IsOptional()
  @IsString()
  failureReason?: string;

  /** When the event actually happened (offline / delayed upload). ISO string. */
  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AssignDriverDto {
  @IsUUID()
  driverUserId!: string;
}
