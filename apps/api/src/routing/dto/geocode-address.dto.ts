import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GeocodeAddressDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  community?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  /** Bias ORS Pelias search toward this point (e.g. community centroid). */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  focusLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  focusLng?: number;
}
