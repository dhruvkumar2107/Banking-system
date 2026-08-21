import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateOrderDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Target pigmy account; defaults to the primary one' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Amount in rupees; defaults to the account daily amount', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountRupees?: number;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 'order_ABC123' })
  @IsString()
  orderId!: string;

  @ApiProperty({ example: 'pay_XYZ789' })
  @IsString()
  paymentId!: string;

  @ApiProperty({ description: 'Razorpay signature (HMAC of order_id|payment_id)' })
  @IsString()
  signature!: string;
}

export class TransactionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'success', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'success', 'failed'])
  status?: 'pending' | 'success' | 'failed';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  villageId?: string;

  @ApiPropertyOptional({ description: 'From date (ISO8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'To date (ISO8601)' })
  @IsOptional()
  @IsString()
  to?: string;
}
