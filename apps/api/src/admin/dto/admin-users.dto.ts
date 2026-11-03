import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
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
