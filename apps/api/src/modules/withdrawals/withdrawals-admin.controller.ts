import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import {
  ApproveWithdrawalDto,
  PayWithdrawalDto,
  RejectWithdrawalDto,
  UpdateSchemeDto,
  WithdrawalListQueryDto,
} from './withdrawals.dto';
import { WithdrawalsService } from './withdrawals.service';
import { SchemeService } from './scheme.service';

/**
 * Admin side of maker-checker withdrawals: review the queue, approve or reject,
 * then record the payout (the only step that debits the ledger).
 *
 * An `agent` may read the queue but cannot decide or pay — those are restricted
 * to `admin` and `superadmin`. Scheme changes are superadmin-only since they set
 * the bank's product terms.
 */
@ApiTags('withdrawals (admin)')
@ApiBearerAuth()
@Controller('withdrawals')
@Roles('superadmin', 'admin', 'agent')
export class WithdrawalsAdminController {
  constructor(
    private readonly withdrawals: WithdrawalsService,
    private readonly scheme: SchemeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Withdrawal request queue (village-scoped)' })
  async list(@Query() q: WithdrawalListQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.withdrawals.listForAdmin(user, q);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get('pending-count')
  @ApiOperation({ summary: 'How many requests await a decision' })
  pendingCount(@CurrentUser() user: AdminPrincipal) {
    return this.withdrawals.pendingCount(user);
  }

  @Get('scheme')
  @ApiOperation({ summary: 'Current scheme parameters' })
  getScheme() {
    return this.scheme.describe();
  }

  @Patch('scheme')
  @Roles('superadmin')
  @ApiOperation({
    summary: 'Update scheme parameters (superadmin) — applies to NEW accounts only',
  })
  updateScheme(
    @Body() dto: UpdateSchemeDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.scheme.update(dto, user, ip);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Withdrawal request detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.withdrawals.getForAdmin(id, user);
  }

  @Post(':id/approve')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Approve a request (authorises payout, no ledger movement yet)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveWithdrawalDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.withdrawals.approve(id, dto, user, ip);
  }

  @Post(':id/reject')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Reject a request with a reason shown to the customer' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.withdrawals.reject(id, dto, user, ip);
  }

  @Post(':id/pay')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Record the payout — posts the ledger debit and closes the account if applicable',
  })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayWithdrawalDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.withdrawals.pay(id, dto, user, ip);
  }
}
