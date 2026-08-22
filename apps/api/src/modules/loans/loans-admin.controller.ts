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
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import {
  ApproveLoanDto,
  DefaultLoanDto,
  DisburseLoanDto,
  LoanListQueryDto,
  RecordRepaymentDto,
  RejectLoanDto,
  UpdateLoanSettingsDto,
  WaiveInstalmentDto,
} from './loans.dto';
import { LoanSettingsService } from './loan-settings.service';
import { LoansService } from './loans.service';

/**
 * Admin side of the loan book: review applications, decide, record the hand-over
 * of cash, then take repayments.
 *
 * Roles are graded by how much damage the action can do:
 *   - `agent` may READ the queue and detail, nothing more.
 *   - `admin` may approve, reject, disburse and record repayments.
 *   - `superadmin` alone may waive an instalment, write a loan off as defaulted,
 *     or change the loan product. Those three either forgive money or reprice
 *     future lending, so they sit above branch level.
 *
 * Route order matters: the literal paths (`settings`, `pending-count`) are
 * declared before `:id`, or Nest would match them as a loan id.
 */
@ApiTags('loans (admin)')
@ApiBearerAuth()
@Controller('loans')
@Roles('superadmin', 'admin', 'agent')
export class LoansAdminController {
  constructor(
    private readonly loans: LoansService,
    private readonly settings: LoanSettingsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Loan queue (village-scoped)',
    description:
      'Filter by `status`, by `villageId`, or `overdueOnly=true` for loans with at least one missed instalment. `search` matches customer name, mobile, account number or loan number.',
  })
  async list(@Query() q: LoanListQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.loans.listForAdmin(user, q);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get('pending-count')
  @ApiOperation({ summary: 'How many applications await a decision' })
  pendingCount(@CurrentUser() user: AdminPrincipal) {
    return this.loans.pendingCount(user);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Current loan product parameters' })
  getSettings() {
    return this.settings.describe();
  }

  @Patch('settings')
  @Roles('superadmin')
  @ApiOperation({
    summary: 'Update the loan product (superadmin)',
    description:
      'Applies to NEW applications only. An already-approved or running loan keeps the rate, tenure and fee snapshotted onto it at approval — changing these never reprices existing debt.',
  })
  updateSettings(
    @Body() dto: UpdateLoanSettingsDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.settings.update(dto, user, ip);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Loan detail — borrower, savings account, full schedule and overdue count',
  })
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.loans.getForAdmin(id, user);
  }

  @Post(':id/approve')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Approve an application — fixes the terms, moves no money',
    description:
      'Re-prices from the live settings, optionally overriding the rate or tenure for this one borrower, and snapshots the result onto the loan. No schedule exists yet; that is generated at disbursal.',
  })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLoanDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.loans.approve(id, dto, user, ip);
  }

  @Post(':id/reject')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Reject an application with a reason shown to the customer' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLoanDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.loans.reject(id, dto, user, ip);
  }

  @Post(':id/disburse')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Record the hand-over of cash and generate the repayment schedule',
    description:
      'Creates every instalment up front, summing to exactly the total payable. Deliberately does NOT credit the savings account — loan money is not a deposit.',
  })
  disburse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisburseLoanDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.loans.disburse(id, dto, user, ip);
  }

  @Post(':id/repayments')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Record a repayment — allocated oldest instalment first',
    description:
      '`from_savings` debits the pigmy ledger in the same transaction, so the savings balance and the loan can never disagree. An overpayment past the final instalment is rejected rather than absorbed. Closes the loan automatically when nothing remains outstanding.',
  })
  recordRepayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRepaymentDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.loans.recordRepayment(id, dto, user, ip);
  }

  @Post(':id/instalments/:instalmentId/waive')
  @Roles('superadmin')
  @ApiOperation({
    summary: 'Forgive one instalment without a payment (superadmin)',
    description:
      'The instalment keeps its original amount on the schedule and is marked `waived` with a reason, so the books still show what was owed and why it was let go.',
  })
  waiveInstalment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('instalmentId', ParseUUIDPipe) instalmentId: string,
    @Body() dto: WaiveInstalmentDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.loans.waiveInstalment(id, instalmentId, dto, user, ip);
  }

  @Post(':id/default')
  @Roles('superadmin')
  @ApiOperation({
    summary: 'Write a disbursed loan off as defaulted (superadmin)',
    description:
      'Terminal. The outstanding figure is left untouched — what is owed stays on the books as owed; the status records that the bank has stopped expecting it.',
  })
  markDefaulted(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DefaultLoanDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.loans.markDefaulted(id, dto, user, ip);
  }
}
