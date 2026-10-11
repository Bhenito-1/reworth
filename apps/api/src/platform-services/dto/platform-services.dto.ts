import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  MaxLength,
  Min,
  ArrayMaxSize,
} from 'class-validator';

export class CreateValuationDto {
  @IsOptional()
  @IsString()
  photoKey?: string;

  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class CreateConsignmentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsInt()
  @Min(0)
  floorPriceKobo!: number;

  @IsInt()
  @Min(0)
  askingPriceKobo!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeBps?: number;
}

export class MarkConsignmentSoldDto {
  @IsInt()
  @Min(0)
  soldPriceKobo!: number;
}

export class CreateManagedPickupDto {
  @IsDateString()
  slotStartAt!: string;

  @IsDateString()
  slotEndAt!: string;

  @IsString()
  @MaxLength(500)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsBoolean()
  photoAddon?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  photoKeys?: string[];
}
