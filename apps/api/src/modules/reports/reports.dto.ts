import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'From date (ISO8601). Defaults to 30 days ago.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'To date (ISO8601). Defaults to now.' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restrict to one village' })
  @IsOptional()
  @IsUUID()
  villageId?: string;
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to chart', default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;
}
