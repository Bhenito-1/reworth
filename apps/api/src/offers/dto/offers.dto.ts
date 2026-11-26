import { IsInt, IsOptional, IsString, IsUUID, Max, Min, MaxLength } from 'class-validator';

export class CreateOfferDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000_000)
  amountKobo!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class CounterOfferDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000_000)
  amountKobo!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}