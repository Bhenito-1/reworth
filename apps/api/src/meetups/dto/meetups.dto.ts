import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMeetupProposalDto {
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  locationText!: string;

  @IsISO8601()
  deliveryDate!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class CounterMeetupProposalDto {
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  locationText!: string;

  @IsISO8601()
  deliveryDate!: string;
}