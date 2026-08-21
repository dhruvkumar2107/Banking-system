import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Indian mobile: 10 digits starting 6-9, optional +91 prefix. */
export const MOBILE_REGEX = /^(\+91)?[6-9]\d{9}$/;

/** Normalize any accepted mobile format to bare 10 digits. */
export function normalizeMobile(mobile: string): string {
  return mobile.replace(/\D/g, '').slice(-10);
}

export class RequestOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(MOBILE_REGEX, { message: 'Invalid Indian mobile number' })
  mobile!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;
}

export class RegisterCustomerDto {
  @ApiProperty({ example: 'Rahul Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'House 12, Main Road' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @ApiProperty({ description: 'Village id to assign the customer to', format: 'uuid' })
  @IsString()
  villageId!: string;

  @ApiPropertyOptional({ description: 'Daily pigmy amount in rupees', example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  dailyAmountRupees?: number;
}

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@pigmee.bank' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin@12345' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class RegisterRequestDto extends RegisterCustomerDto {
  @ApiProperty({ description: 'Registration token returned by /auth/otp/verify for a new mobile' })
  @IsString()
  registrationToken!: string;
}

export class LogoutDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
