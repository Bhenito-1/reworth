import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FulfilmentMethod } from '@prisma/client';

export class UpsertCartItemDto {
  @IsUUID()
  listingId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class CheckoutCartDto {
  @IsEnum(FulfilmentMethod)
  fulfilmentMethod!: FulfilmentMethod;

  /** Buyer delivery destination — used for distance from each seller pickup. */
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
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  /** Checkout these lines only. Omit to order everything currently in the cart. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  listingIds?: string[];
}

/** Preview cart totals before placing orders (same delivery rules as checkout). */
export class CartQuoteDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  toLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  toLng!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  listingIds?: string[];
}
