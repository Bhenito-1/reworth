import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ItemCondition, SellingMode } from '@prisma/client';

export class CreateListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Free-text category from the sell form. Resolved to categoryId when it matches. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  categoryName?: string | null;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  brand?: string | null;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @IsOptional()
  @IsString()
  ageText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  originalPriceKobo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceKobo?: number;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsOptional()
  @IsEnum(SellingMode)
  sellingMode?: SellingMode;

  @IsOptional()
  @IsString()
  community?: string;

  @IsOptional()
  @IsUUID()
  communityId?: string;

  @IsOptional()
  @IsBoolean()
  communityOnly?: boolean;

  @IsOptional()
  @IsUUID()
  movingSaleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsNumber()
  geoLat?: number;

  @IsOptional()
  @IsNumber()
  geoLng?: number;

  @IsOptional()
  @IsString()
  addressPrivate?: string;

  @IsOptional()
  @IsBoolean()
  fulfilmentPickup?: boolean;

  @IsOptional()
  @IsBoolean()
  fulfilmentMeet?: boolean;

  @IsOptional()
  @IsBoolean()
  fulfilmentDelivery?: boolean;

  @IsOptional()
  @IsObject()
  vehicle?: Record<string, unknown>;

  /** Auto-donate after N days unsold; null clears. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  donateIfUnsoldDays?: number | null;

  /** Units for sale. Price is per unit. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Free-text category from the sell form. Resolved to categoryId when it matches. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  categoryName?: string | null;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  brand?: string | null;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @IsOptional()
  @IsString()
  ageText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  originalPriceKobo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceKobo?: number;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsOptional()
  @IsEnum(SellingMode)
  sellingMode?: SellingMode;

  @IsOptional()
  @IsString()
  community?: string;

  @IsOptional()
  @IsUUID()
  communityId?: string | null;

  @IsOptional()
  @IsBoolean()
  communityOnly?: boolean;

  @IsOptional()
  @IsUUID()
  movingSaleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsNumber()
  geoLat?: number;

  @IsOptional()
  @IsNumber()
  geoLng?: number;

  @IsOptional()
  @IsString()
  addressPrivate?: string;

  @IsOptional()
  @IsBoolean()
  fulfilmentPickup?: boolean;

  @IsOptional()
  @IsBoolean()
  fulfilmentMeet?: boolean;

  @IsOptional()
  @IsBoolean()
  fulfilmentDelivery?: boolean;

  @IsOptional()
  @IsObject()
  vehicle?: Record<string, unknown>;

  /** Luxury: seller can set false → OPTED_OUT / Unauthenticated. */
  @IsOptional()
  @IsBoolean()
  authRequired?: boolean;

  /** Auto-donate after N days unsold; null clears. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  donateIfUnsoldDays?: number | null;

  /** Units for sale. Price is per unit. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}

export class AssistListingDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageKeys?: string[];
}

export class AttachImagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachImageItemDto)
  images!: AttachImageItemDto[];
}

export class AttachImageItemDto {
  @IsString()
  key!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReportListingDto {
  @IsString()
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;
}

export class AppealListingDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class BrowseListingsQueryDto {
  @IsOptional()
  @IsString()
  community?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusKm?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** When "1", return only the authenticated seller's listings (swap picker). */
  @IsOptional()
  @IsString()
  mine?: string;
}
