import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreatePigmyAccountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ description: 'Daily pigmy amount in rupees', example: 100 })
  @IsInt()
  @Min(1)
  dailyAmountRupees!: number;
}

export class UpdatePigmyStatusDto {
  @ApiProperty({ enum: ['active', 'inactive', 'closed'] })
  @IsIn(['active', 'inactive', 'closed'])
  status!: 'active' | 'inactive' | 'closed';
}

export class UpdateDailyAmountDto {
  @ApiPropertyOptional({ description: 'Daily pigmy amount in rupees', example: 150 })
  @IsInt()
  @Min(1)
  dailyAmountRupees!: number;
}

export class PigmyOverviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by customer name / mobile / account number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'closed'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'closed'])
  status?: 'active' | 'inactive' | 'closed';
}
