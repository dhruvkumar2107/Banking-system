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
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'disbursed'
  | 'closed'
  | 'defaulted';
export type LoanInstalmentStatus = 'due' | 'paid' | 'overdue' | 'waived';
export type RepaymentMethod = 'cash' | 'bank_transfer' | 'from_savings';
export type DisbursementMethod = 'bank_transfer' | 'cash';

const LOAN_STATUSES: LoanStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'disbursed',
  'closed',
  'defaulted',
];

/** Customer asks "what would this cost?" before committing. Read-only. */
export class QuoteLoanQueryDto {
  @ApiProperty({ description: 'Principal in rupees', minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountRupees!: number;

  @ApiProperty({ description: 'Tenure in whole months', minimum: 1, maximum: 120 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  tenureMonths!: number;
}

/** Customer applies for a loan. */
export class CreateLoanDto {
  @ApiPropertyOptional({
    description: 'Savings account backing the loan; defaults to the primary account',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiProperty({ description: 'Principal in rupees', minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountRupees!: number;

  @ApiProperty({ description: 'Tenure in whole months', minimum: 1, maximum: 120 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  tenureMonths!: number;

  @ApiPropertyOptional({ maxLength: 280, description: 'What the loan is for' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  purpose?: string;
}

/**
 * Admin approves an application. The terms are read from the live loan settings
 * and snapshotted onto the loan here — but an admin may override the rate or
 * tenure for this one borrower, which is why both are accepted.
 */
export class ApproveLoanDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 5_000,
    description: 'Override the flat annual rate in basis points (1200 = 12.00% p.a.)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000)
  interestRateBps?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 120, description: 'Override the approved tenure' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  tenureMonths?: number;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

/** Admin rejects an application — the reason is shown to the customer. */
export class RejectLoanDto {
  @ApiProperty({ minLength: 4, maxLength: 280, description: 'Shown to the customer' })
  @IsString()
  @MinLength(4)
  @MaxLength(280)
  reason!: string;
}

/** Admin records the actual hand-over of money and starts the schedule. */
export class DisburseLoanDto {
  @ApiProperty({
    maxLength: 64,
    description: 'UTR / NEFT reference for a bank transfer, or the voucher number for cash',
  })
  @IsString()
  @MaxLength(64)
  reference!: string;

  @ApiPropertyOptional({ enum: ['bank_transfer', 'cash'], default: 'bank_transfer' })
  @IsOptional()
  @IsEnum(['bank_transfer', 'cash'])
  disbursementMethod?: DisbursementMethod;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

/**
 * Admin records a repayment. The amount is allocated oldest-instalment-first;
 * `from_savings` posts a DEBIT to the customer's pigmy ledger in the same
 * transaction, so the savings balance and the loan can never disagree.
 */
export class RecordRepaymentDto {
  @ApiProperty({ description: 'Amount received, in rupees', minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountRupees!: number;

  @ApiProperty({
    enum: ['cash', 'bank_transfer', 'from_savings'],
    description: 'from_savings debits the pigmy account; the others are recorded with a reference',
  })
  @IsEnum(['cash', 'bank_transfer', 'from_savings'])
  method!: RepaymentMethod;

  @ApiPropertyOptional({ maxLength: 64, description: 'Receipt / UTR / voucher number' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;
}

/** Admin forgives a single instalment without a payment. Always audited. */
export class WaiveInstalmentDto {
  @ApiProperty({ minLength: 4, maxLength: 280, description: 'Why this instalment was waived' })
  @IsString()
  @MinLength(4)
  @MaxLength(280)
  reason!: string;
}

/** Admin writes off a disbursed loan as defaulted. */
export class DefaultLoanDto {
  @ApiProperty({ minLength: 8, maxLength: 280, description: 'Why the loan is being written off' })
  @IsString()
  @MinLength(8)
  @MaxLength(280)
  reason!: string;
}

export class LoanListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LOAN_STATUSES })
  @IsOptional()
  @IsEnum(LOAN_STATUSES)
  status?: LoanStatus;

  @ApiPropertyOptional({ description: 'Only loans with at least one overdue instalment' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdueOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  villageId?: string;

  @ApiPropertyOptional({ description: 'Customer name, mobile, account number or loan number' })
  @IsOptional()
  @IsString()
  search?: string;
}

/** Superadmin edits the loan product. Every field is optional — partial update. */
export class UpdateLoanSettingsDto {
  @ApiPropertyOptional({ description: 'Whether customers may apply for loans at all' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, description: 'Smallest loan, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minAmountPaise?: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Largest loan, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAmountPaise?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 5_000,
    description: 'Flat annual interest in basis points (1200 = 12.00% p.a.)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000)
  interestRateBps?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  minTenureMonths?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  maxTenureMonths?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100_000,
    description: 'Loan-to-savings ceiling in basis points (20000 = borrow up to 2× your savings)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  maxLoanToBalanceBps?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 5_000,
    description: 'One-off processing fee in basis points (100 = 1.00% of principal)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000)
  processingFeeBps?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum savings to qualify, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSavingsPaise?: number;
}
