import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PresignMediaDto {
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  contentLength!: number;

  @IsString()
  fileName!: string;
}

export class CompleteMediaDto {
  @IsString()
  key!: string;

  @IsUUID()
  listingId!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  /**
   * Optional raw image bytes (base64). Used when browser PUT to MinIO fails
   * (CORS / mock storage) so Analyze still has vision-readable pixels.
   */
  @IsOptional()
  @IsString()
  @MaxLength(14_000_000)
  inlineBase64?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}
