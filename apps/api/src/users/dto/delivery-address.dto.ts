import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveDeliveryAddressDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  community!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}
