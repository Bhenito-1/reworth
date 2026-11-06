import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdminRole } from '@prisma/client';

export class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsArray()
  @ArrayUnique()
  @IsEnum(AdminRole, { each: true })
  roles!: AdminRole[];
}

export class AssignRoleDto {
  @IsEnum(AdminRole)
  role!: AdminRole;
}

export class SetDeliveryDriverDto {
  @IsBoolean()
  enabled!: boolean;
}

export class CreateDeliveryDriverDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
