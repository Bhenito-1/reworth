import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatScanKind } from '@prisma/client';

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class AdminTotpVerifyDto {
  @IsString()
  @MinLength(6)
  code!: string;

  /** Present when completing login after totpRequired. */
  @IsOptional()
  @IsString()
  challengeToken?: string;
}

export class AdminSuspendDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminUnsuspendDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class AdminApproveListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminFlagListingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminRejectListingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminFeatureListingDto {
  @IsInt()
  @Min(1)
  days!: number;

  @IsInt()
  @Min(0)
  feeKobo!: number;
}

export class AdminExtendExpiryDto {
  @IsInt()
  @Min(1)
  days!: number;
}

export class AdminRefundDto {
  @IsInt()
  @Min(1)
  amountKobo!: number;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsBoolean()
  confirm!: boolean;
}

export class AdminRejectVerificationDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class AdminReportActionDto {
  @IsIn(['WARN', 'REMOVE_LISTING', 'SUSPEND_USER'])
  action!: 'WARN' | 'REMOVE_LISTING' | 'SUSPEND_USER';

  @IsOptional()
  @IsString()
  message?: string;
}

export class AdminWhitelistDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class AdminSupportPatchDto {
  @IsOptional()
  @IsString()
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class AdminSupportNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}

export class AdminSupportRespondDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

export class AdminPromotionCreateDto {
  @IsString()
  listingId!: string;

  @IsString()
  kind!: 'FEATURED' | 'BOOST';

  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeKobo?: number;
}

export class AdminHeroBannerDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AdminCategoryDto {
  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  iconUrl?: string;
}

export class AdminMeetPointDto {
  @IsString()
  community!: string;

  @IsString()
  name!: string;

  @IsString()
  landmark!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AdminChatScanRuleDto {
  @IsString()
  pattern!: string;

  @IsEnum(ChatScanKind)
  kind!: ChatScanKind;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AdminCommunityDto {
  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  privacy?: string;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

export class AdminPatchCommunityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  privacy?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string | null;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  geoLat?: number | null;

  @IsOptional()
  geoLng?: number | null;

  /** PRD §34 premium community — off by default. */
  @IsOptional()
  @IsBoolean()
  premium?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  membershipFeeKobo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  listingFeeKobo?: number;
}

export class AdminAddCommunityManagerDto {
  @IsUUID()
  userId!: string;
}

export class AdminAppealResolveDto {
  @IsIn(['APPROVED', 'DENIED'])
  status!: 'APPROVED' | 'DENIED';

  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}
