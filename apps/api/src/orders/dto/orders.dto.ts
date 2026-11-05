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

  /** Units to buy. Per-unit price applies; negotiated (offer) checkouts use agreed unit price × quantity. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  /** Buyer-confirmed delivery address snapshot (DELIVERY). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  /**
   * When set (e.g. multi-item cart checkout), use this fee instead of recomputing.
   * Second+ orders from the same seller in one checkout should pass 0.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryFeeKobo?: number;
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
