import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FulfilmentMethod } from '@prisma/client';

export class CreateOrderDto {
  @IsUUID()
  listingId!: string;

  @IsOptional()
  @IsUUID()
  offerId?: string;

  @IsOptional()
  @IsUUID()
  orderIntentId?: string;

  @IsEnum(FulfilmentMethod)
  fulfilmentMethod!: FulfilmentMethod;

  @IsOptional()
  @IsBoolean()
  buyNow?: boolean;

  /** Optional destination for DELIVERY — quotes fee at create time. */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  toLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  toLng?: number;

  @IsOptional()
  @IsUUID()
  meetPointId?: string;

  /** Units to buy. Price on the listing is per unit. Ignored for offers (always 1). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}

export class ConfirmOrderDto {
  @IsDateString()
  deliveryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sellerNote?: string;
}

export class RejectOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
