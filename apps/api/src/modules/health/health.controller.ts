import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { HealthService } from './health.service';

@ApiTags('system-health')
@ApiBearerAuth()
@Controller('health')
@Roles('superadmin', 'admin')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Full system health check' })
  check() {
    return this.health.check();
  }

  @Get('database')
  @ApiOperation({ summary: 'Database connectivity and performance check' })
  database() {
    return this.health.checkDatabase();
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Transaction system health' })
  transactions() {
    return this.health.checkTransactionHealth();
  }

  @Get('stats')
  @ApiOperation({ summary: 'System statistics for admin dashboard' })
  stats() {
    return this.health.systemStats();
  }
}
