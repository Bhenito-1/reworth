import { MessageType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  listingId!: string;
}

export class PostMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageKey?: string;

  @IsOptional()
  @IsUUID()
  listingCardId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMsgId?: string;
}

export class ReportUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class MuteConversationDto {
  @IsOptional()
  @IsUUID()
  mutedId?: string;
}

/** ADR-011 Phase C — private meetup pin (buyer/seller only). */
export class PostMeetupPinDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMsgId?: string;
}
