import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
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

  /** Checkout these lines only. Omit to order everything currently in the cart. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  listingIds?: string[];
}
