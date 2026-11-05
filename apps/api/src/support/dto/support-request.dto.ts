import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SupportRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
