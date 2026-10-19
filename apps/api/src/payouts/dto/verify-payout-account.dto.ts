import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyPayoutAccountDto {
  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber!: string;

  @IsString()
  @Matches(/^\d{3,10}$/)
  bankCode!: string;

  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  middleName?: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;
}
