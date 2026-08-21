import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export type WithdrawalKind = 'partial' | 'closure' | 'maturity';
export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
export type PayoutMethod = 'bank_transfer' | 'cash';

/** Customer raises a withdrawal request. */
export class CreateWithdrawalDto {
  @ApiPropertyOptional({ description: 'Account to withdraw from; defaults to the primary account' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiProperty({
    enum: ['partial', 'closure'],
    description: 'partial = withdraw an amount; closure = withdraw everything and close',
  })
  @IsEnum(['partial', 'closure'])
  kind!: 'partial' | 'closure';

  @ApiPropertyOptional({
    description: 'Amount in rupees. Required for partial; ignored for closure (full balance).',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountRupees?: number;

  @ApiPropertyOptional({ enum: ['bank_transfer', 'cash'], default: 'bank_transfer' })
  @IsOptional()
  @IsEnum(['bank_transfer', 'cash'])
  payoutMethod?: PayoutMethod;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

/** Admin rejects a request — a reason is mandatory so the customer sees why. */
export class RejectWithdrawalDto {
  @ApiProperty({ maxLength: 280, description: 'Shown to the customer' })
  @IsString()
  @MaxLength(280)
  reason!: string;
}

/** Admin approves a request (no ledger movement yet). */
export class ApproveWithdrawalDto {
  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

/** Admin records the actual payout — this posts the ledger debit. */
export class PayWithdrawalDto {
  @ApiProperty({
    maxLength: 64,
    description: 'UTR / NEFT reference for a bank transfer, or the voucher number for cash',
  })
  @IsString()
  @MaxLength(64)
  reference!: string;

  @ApiPropertyOptional({ enum: ['bank_transfer', 'cash'], description: 'Overrides the requested method' })
  @IsOptional()
  @IsEnum(['bank_transfer', 'cash'])
  payoutMethod?: PayoutMethod;
}

export class WithdrawalListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'paid', 'rejected', 'cancelled'] })
  @IsOptional()
  @IsEnum(['pending', 'approved', 'paid', 'rejected', 'cancelled'])
  status?: WithdrawalStatus;

  @ApiPropertyOptional({ enum: ['partial', 'closure', 'maturity'] })
  @IsOptional()
  @IsEnum(['partial', 'closure', 'maturity'])
  kind?: WithdrawalKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  villageId?: string;

  @ApiPropertyOptional({ description: 'Customer name, mobile or account number' })
  @IsOptional()
  @IsString()
  search?: string;
}

/** Superadmin edits the bank's scheme parameters. */
export class UpdateSchemeDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Account term in days (e.g. 365)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termDays?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 5000,
    description: 'Annual interest in basis points (400 = 4.00% p.a.)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  interestRateBps?: number;

  @ApiPropertyOptional({ description: 'Whether customers may withdraw before maturity' })
  @IsOptional()
  @IsBoolean()
  earlyWithdrawalAllowed?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 5000,
    description: 'Early-withdrawal penalty in basis points (100 = 1.00%)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  earlyPenaltyBps?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum balance to leave in the account, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minBalancePaise?: number;
}
