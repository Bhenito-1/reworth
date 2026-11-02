import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel } from '@prisma/client';
import { ALL_NOTIFICATION_CATEGORIES } from '../notification-categories';

export class PatchPreferencesDto {
  @IsIn(ALL_NOTIFICATION_CATEGORIES as unknown as string[])
  category!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

export class WebPushKeysDto {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  auth!: string;
}

export class WebPushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;

  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys!: WebPushKeysDto;

  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;
}

export class DeleteWebPushSubscriptionDto {
  /** When omitted, every subscription for the signed-in user is removed. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint?: string;
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  unread?: string;
}
