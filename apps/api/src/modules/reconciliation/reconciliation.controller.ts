import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationQueryDto } from './reconciliation.dto';

@ApiTags('reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
@Roles('superadmin', 'admin')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Reconciliation dashboard summary' })
  summary() {
    return this.reconciliation.summary();
  }

  @Get('scan')
  @ApiOperation({ summary: 'Full reconciliation scan — compare transactions against ledger' })
  scan(@Query() q: ReconciliationQueryDto) {
    return this.reconciliation.scan(
      q.from ? new Date(q.from) : undefined,
      q.to ? new Date(q.to) : undefined,
    );
  }

  @Get('stale-pending')
  @ApiOperation({ summary: 'Find stale pending transactions (possible lost webhooks)' })
  stalePending(@Query('olderThanMinutes') minutes?: number) {
    return this.reconciliation.findStalePending(minutes);
  }

  @Get('duplicates')
  @ApiOperation({ summary: 'Check for duplicate ledger entries' })
  duplicates() {
    return this.reconciliation.findDuplicateEntries();
  }

  @Get('account-reconciliation')
  @ApiOperation({ summary: 'Verify stored balances match computed ledger sums' })
  accountReconciliation(@Query('accountId') accountId?: string) {
    return this.reconciliation.accountReconciliation(accountId);
  }
}
