import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { MOBILE_REGEX } from '../auth/auth.dto';

export type KycStage = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'bypassed';

/** One nominee submitted as part of the KYC bundle. */
export class KycNomineeDto {
  @ApiProperty({ example: 'Sita Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  relation!: string;

  @ApiPropertyOptional({ example: '9876543211' })
  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX, { message: 'Invalid Indian mobile number' })
  mobile?: string;

  @ApiPropertyOptional({ example: 'House 12, Main Road' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;
}

/**
 * The whole KYC bundle, submitted in one shot: photo + Aadhaar + at least one
 * nominee. Submitting is all-or-nothing so a customer can never end up
 * half-verified — the service writes the photo, the Aadhaar digest and the
 * nominees inside a single transaction.
 */
export class SubmitKycDto {
  @ApiProperty({
    description:
      'URL returned by POST /uploads for the customer’s face photo. Take it live in the app where possible.',
    example: '/api/uploads/8f3.../photo-1737.jpg',
  })
  @IsString()
  @MaxLength(600)
  photoUrl!: string;

  @ApiProperty({
    description:
      'true when the photo was captured by the device camera in-session rather than picked from the gallery',
    default: false,
  })
  @IsBoolean()
  photoIsLive!: boolean;

  @ApiProperty({
    description: 'URL returned by POST /uploads for the Aadhaar card scan/photo',
    example: '/api/uploads/8f3.../aadhaar-1737.jpg',
  })
  @IsString()
  @MaxLength(600)
  aadhaarFileUrl!: string;

  @ApiProperty({
    description:
      'The 12-digit Aadhaar number. Only the last 4 digits and a salted hash are stored — the full number is never persisted.',
    example: '234567890126',
  })
  @IsString()
  @MaxLength(20)
  aadhaarNumber!: string;

  @ApiProperty({ type: [KycNomineeDto], description: 'At least one nominee is mandatory' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KycNomineeDto)
  nominees!: KycNomineeDto[];

  @ApiPropertyOptional({ description: 'Optional address correction submitted with KYC' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;
}

/** Admin rejects a submission — the reason is shown to the customer. */
export class RejectKycDto {
  @ApiProperty({ maxLength: 280, description: 'Shown to the customer so they can fix and resubmit' })
  @IsString()
  @MinLength(4)
  @MaxLength(280)
  reason!: string;
}

/**
 * Admin bypass — the ONLY way past the KYC gate without a verified submission.
 * A reason is mandatory and the whole thing is audited, because this is a
 * deliberate control override.
 */
export class BypassKycDto {
  @ApiProperty({
    maxLength: 280,
    minLength: 8,
    description:
      'Why the gate is being overridden (e.g. "documents verified in person at branch, register p.42")',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(280)
  reason!: string;
}

export class KycListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['not_started', 'submitted', 'verified', 'rejected', 'bypassed'],
    description: 'Defaults to `submitted` — the review queue',
  })
  @IsOptional()
  @IsEnum(['not_started', 'submitted', 'verified', 'rejected', 'bypassed'])
  stage?: KycStage;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  villageId?: string;

  @ApiPropertyOptional({ description: 'Customer name or mobile' })
  @IsOptional()
  @IsString()
  search?: string;
}
