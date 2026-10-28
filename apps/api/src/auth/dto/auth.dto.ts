import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DevicePlatform } from '@prisma/client';

export class DeviceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

/** Consumer email registration. */
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/)
  code!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class OAuthCallbackDto {
  @IsOptional()
  @IsString()
  idToken?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}
