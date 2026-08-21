import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  AdminLoginDto,
  LogoutDto,
  RefreshDto,
  RegisterRequestDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  // Extra HTTP-layer throttle on top of the per-mobile DB rate limit.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send an OTP to a mobile number' })
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    return this.auth.requestOtp(dto.mobile, ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify an OTP — returns tokens (existing) or a registration token (new)' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Ip() ip: string) {
    return this.auth.verifyOtp(dto.mobile, dto.code, ip);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Complete customer registration (name, address, village)' })
  register(@Body() dto: RegisterRequestDto, @Ip() ip: string) {
    return this.auth.register(dto.registrationToken, dto, ip);
  }

  @Public()
  @Post('admin/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin email + password login' })
  adminLogin(@Body() dto: AdminLoginDto, @Ip() ip: string) {
    return this.auth.adminLogin(dto.email, dto.password, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token for a new access token' })
  refresh(@Body() dto: RefreshDto, @Ip() ip: string) {
    return this.auth.refresh(dto.refreshToken, ip);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a refresh token' })
  logout(@Body() dto: LogoutDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.auth.logout(dto.refreshToken, user, ip);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated principal' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
