import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateVillageDto {
  @ApiProperty({ example: 'Village A' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'VLG-A', description: 'Unique short code' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,20}$/, { message: 'Code must be 2-20 chars: letters, digits, - or _' })
  code!: string;
}

export class UpdateVillageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}
