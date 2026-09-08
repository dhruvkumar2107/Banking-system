import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { RiskService } from './risk.service';

@ApiTags('risk')
@ApiBearerAuth()
@Controller('risk')
@Roles('superadmin', 'admin')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get('alerts')
  @ApiOperation({ summary: 'Run risk detection scan and return all active alerts' })
  alerts() {
    return this.risk.scanAll();
  }

  @Get('failures')
  @ApiOperation({ summary: 'Detect repeated payment failures' })
  failures() {
    return this.risk.detectRepeatedFailures();
  }

  @Get('high-frequency')
  @ApiOperation({ summary: 'Detect abnormally high transaction frequency' })
  highFrequency() {
    return this.risk.detectHighFrequency();
  }

  @Get('large-transactions')
  @ApiOperation({ summary: 'Detect unusually large transactions' })
  largeTransactions() {
    return this.risk.detectLargeTransactions();
  }

  @Get('otp-abuse')
  @ApiOperation({ summary: 'Detect excessive OTP requests' })
  otpAbuse() {
    return this.risk.detectOtpAbuse();
  }
}
