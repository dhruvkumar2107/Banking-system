import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class BroadcastDto {
  @ApiProperty({ example: 'Holiday notice' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'Collections are paused on 15th Aug.' })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  body!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restrict to one village; omit for all in scope' })
  @IsOptional()
  @IsUUID()
  villageId?: string;
}

export class NotificationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only unread notifications' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}
