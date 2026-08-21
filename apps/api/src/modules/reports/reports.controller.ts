import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { AnalyticsQueryDto, DateRangeQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles('superadmin', 'admin', 'agent')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard headline stats (today + totals), village-scoped' })
  dashboard(@CurrentUser() user: AdminPrincipal) {
    return this.reports.dashboard(user);
  }

  @Get('date-wise')
  @ApiOperation({ summary: 'Date-wise collection totals for a range' })
  dateWise(@Query() q: DateRangeQueryDto, @CurrentUser() user: AdminPrincipal) {
    return this.reports.dateWise(user, q.from, q.to, q.villageId);
  }

  @Get('village-wise')
  @ApiOperation({ summary: 'Per-village collection + balances' })
  villageWise(@Query() q: DateRangeQueryDto, @CurrentUser() user: AdminPrincipal) {
    return this.reports.villageWise(user, q.from, q.to);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Collection analytics time series (for charts)' })
  analytics(@Query() q: AnalyticsQueryDto, @CurrentUser() user: AdminPrincipal) {
    return this.reports.analytics(user, q.days);
  }
}
