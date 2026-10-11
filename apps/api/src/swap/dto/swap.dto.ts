import {
  IsOptional,
  IsString,
  Matches,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSwapProposalDto {
  @IsUUID()
  offeredListingId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** Calendar day the proposer wants both items delivered, YYYY-MM-DD. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deliveryOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class CounterSwapProposalDto {
  @IsOptional()
  @IsUUID()
  offeredListingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateGiveawayClaimDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FailLegDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
