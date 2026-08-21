import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { withRupees } from '../../common/money';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { LedgerService } from '../ledger/ledger.service';
import {
  CreatePigmyAccountDto,
  PigmyOverviewQueryDto,
  UpdateDailyAmountDto,
  UpdatePigmyStatusDto,
} from './pigmy.dto';
import { PigmyService } from './pigmy.service';

@ApiTags('pigmy accounts (admin)')
@ApiBearerAuth()
@Controller('pigmy-accounts')
@Roles('superadmin', 'admin', 'agent')
export class PigmyController {
  constructor(
    private readonly pigmy: PigmyService,
    private readonly ledger: LedgerService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Open a pigmy account for an existing customer' })
  create(@Body() dto: CreatePigmyAccountDto, @CurrentUser() user: AdminPrincipal, @Ip() ip: string) {
    return this.pigmy.createForAdmin(dto.customerId, dto.dailyAmountRupees, user, ip);
  }

  @Get()
  @ApiOperation({ summary: 'Pigmy accounts overview (village-scoped)' })
  async overview(@Query() q: PigmyOverviewQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.pigmy.overview(user, q.page, q.limit, q.search, q.status);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Pigmy account detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.pigmy.getForAdmin(id, user);
  }

  @Get(':id/ledger')
  @ApiOperation({ summary: 'Ledger history for an account' })
  async ledgerHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
    @CurrentUser() user: AdminPrincipal,
  ) {
    await this.pigmy.getForAdmin(id, user); // enforce scope
    const { rows, total } = await this.ledger.entries(id, q.page, q.limit);
    const data = rows.map((e) => ({
      id: e.id,
      type: e.type,
      amount: withRupees(e.amount),
      previousBalance: withRupees(e.previousBalance),
      newBalance: withRupees(e.newBalance),
      note: e.note,
      transactionId: e.transactionId,
      createdAt: e.createdAt,
    }));
    return paginate(data, total, q.page, q.limit);
  }

  @Get(':id/reconcile')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Reconcile stored balance against the ledger (superadmin)' })
  async reconcile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    await this.pigmy.getForAdmin(id, user);
    const r = await this.ledger.reconcile(id);
    return {
      consistent: r.consistent,
      storedBalance: withRupees(r.storedBalance),
      computedBalance: withRupees(r.computedBalance),
      credits: withRupees(r.credits),
      debits: withRupees(r.debits),
    };
  }

  @Patch(':id/status')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Activate / deactivate / close an account' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePigmyStatusDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.pigmy.setStatus(id, dto.status, user, ip);
  }

  @Patch(':id/daily-amount')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Change the daily pigmy amount' })
  updateDaily(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDailyAmountDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.pigmy.updateDailyAmount(id, dto.dailyAmountRupees, user, ip);
  }
}
