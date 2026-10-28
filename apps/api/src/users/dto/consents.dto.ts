import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';

const CONSENT_CHANNELS = ['MARKETING', 'EMAIL'] as const;
export type ConsumerConsentChannel = (typeof CONSENT_CHANNELS)[number];

export class ConsentItemDto {
  @IsIn(CONSENT_CHANNELS)
  channel!: ConsumerConsentChannel;

  @IsBoolean()
  granted!: boolean;
}

export class UpdateConsentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  consents!: ConsentItemDto[];
}
