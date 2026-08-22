import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomerId } from '../../common/decorators/current-customer.decorator';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RequiresKyc } from '../kyc/kyc.guard';
import { CreateLoanDto, QuoteLoanQueryDto } from './loans.dto';
import { LoansService } from './loans.service';

/**
 * Customer-facing loan self-service. Every route is keyed to the caller's own id
 * via @CurrentCustomerId — there is no customer-id path param, so a customer can
 * never reach another customer's loans.
 *
 * A customer can only *apply* and *cancel*. Approval, disbursal and repayment
 * recording live on the admin controller (maker-checker).
 *
 * Only `POST /me/loans` carries @RequiresKyc(). The product terms, the quote and
 * the customer's own list stay open on purpose: a customer whose KYC is pending
 * can still see what a loan would cost and — via `quote.reasons` — exactly why
 * they cannot apply yet. A 403 on the preview would leave them guessing.
 */
@ApiTags('loans (customer)')
@ApiBearerAuth()
@Controller('me/loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get('settings')
  @ApiOperation({ summary: 'The loan product on offer (limits, rate, tenure, fee)' })
  settings() {
    return this.loans.describeSettings();
  }

  @Get('quote')
  @ApiOperation({
    summary: 'Price a loan and check eligibility without applying',
    description:
      'Returns the EMI, total interest, processing fee and net disbursal, plus `eligible` and a `reasons` list naming every unmet condition. Safe to call repeatedly as the borrower moves an amount slider.',
  })
  quote(
    @CurrentCustomerId() customerId: string,
    @Query() q: QuoteLoanQueryDto,
    @Query('accountId') accountId?: string,
  ) {
    return this.loans.quote(customerId, accountId, q.amountRupees, q.tenureMonths);
  }

  @Post()
  @RequiresKyc()
  @ApiOperation({ summary: 'Apply for a loan (goes to an admin for approval)' })
  apply(@CurrentCustomerId() customerId: string, @Body() dto: CreateLoanDto, @Ip() ip: string) {
    return this.loans.apply(customerId, dto, ip);
  }

  @Get()
  @ApiOperation({ summary: 'My loans' })
  async list(@CurrentCustomerId() customerId: string, @Query() q: PaginationQueryDto) {
    const { rows, total } = await this.loans.listForCustomer(customerId, q.page, q.limit);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my loans, with the full repayment schedule' })
  getOne(@CurrentCustomerId() customerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.getForCustomer(customerId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Withdraw my own pending application' })
  cancel(
    @CurrentCustomerId() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.loans.cancel(customerId, id, ip);
  }
}
