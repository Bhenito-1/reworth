import { IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { IdentityMethod } from '@prisma/client';

export class IdentityVerifyDto {
  @IsEnum(IdentityMethod)
  method!: IdentityMethod;

  @IsOptional()
  @IsIn(['success', 'failure'])
  mockOutcome?: 'success' | 'failure';

  /** Dev-only opaque mock ref — never a real NIN/BVN. */
  @IsOptional()
  @IsString()
  mockReference?: string;

  /**
   * 11-digit NIN. Hashed immediately and never stored or written to the audit log.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  nin?: string;
}
