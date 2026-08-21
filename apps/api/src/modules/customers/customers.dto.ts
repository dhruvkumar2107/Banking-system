import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { MOBILE_REGEX } from '../auth/auth.dto';

const KYC_STATUSES = ['pending', 'verified', 'rejected'] as const;

/** Admin-driven customer creation (walk-in registration by an agent). */
export class AdminCreateCustomerDto {
  @ApiProperty({ example: 'Rahul Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(MOBILE_REGEX, { message: 'Invalid Indian mobile number' })
  mobile!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  villageId!: string;

  @ApiPropertyOptional({ example: 'House 12, Main Road' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @ApiPropertyOptional({ description: 'Daily pigmy amount in rupees', example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  dailyAmountRupees?: number;
}

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({ example: 'Rahul Kumar' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'House 12, Main Road' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  photoUrl?: string;
}

export class UpdateKycDto {
  @ApiProperty({ enum: KYC_STATUSES })
  @IsIn(KYC_STATUSES as unknown as string[])
  status!: (typeof KYC_STATUSES)[number];
}

export class AssignVillageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  villageId!: string;
}

export class CreateNomineeDto {
  @ApiProperty({ example: 'Sita Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  relation?: string;

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

export class CreateDocumentDto {
  @ApiProperty({ example: 'aadhaar', description: 'aadhaar | pan | voter_id | ...' })
  @IsString()
  @MaxLength(40)
  docType!: string;

  @ApiProperty({ example: 'https://cdn.example.com/kyc/aadhaar.jpg' })
  @IsString()
  @MaxLength(600)
  fileUrl!: string;
}

export class VerifyDocumentDto {
  @ApiProperty({ enum: KYC_STATUSES })
  @IsIn(KYC_STATUSES as unknown as string[])
  status!: (typeof KYC_STATUSES)[number];
}

export class UpsertBankDetailsDto {
  @ApiProperty({ example: '123456789012' })
  @IsString()
  @Matches(/^\d{9,18}$/, { message: 'Account number must be 9-18 digits' })
  accountNumber!: string;

  @ApiProperty({ example: 'HDFC0001234' })
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Invalid IFSC code' })
  ifsc!: string;

  @ApiProperty({ example: 'Rahul Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountHolderName!: string;
}

export class CustomerListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name / mobile' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  villageId?: string;

  @ApiPropertyOptional({ enum: KYC_STATUSES })
  @IsOptional()
  @IsIn(KYC_STATUSES as unknown as string[])
  kycStatus?: (typeof KYC_STATUSES)[number];
}

export class CustomerHistoryQueryDto extends PaginationQueryDto {}

/** Reusable type for the number coercion in nested query params. */
export class IdParamDto {
  @Type(() => String)
  @IsUUID()
  id!: string;
}
