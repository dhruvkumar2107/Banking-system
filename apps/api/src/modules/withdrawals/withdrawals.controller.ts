import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomerId } from '../../common/decorators/current-customer.decorator';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RequiresKyc } from '../kyc/kyc.guard';
import { CreateWithdrawalDto } from './withdrawals.dto';
import { WithdrawalsService } from './withdrawals.service';
import { SchemeService } from './scheme.service';

/**
 * Customer-facing withdrawal self-service. Every route is keyed to the caller's
 * own id via @CurrentCustomerId — there is no customer-id path param, so a
 * customer can never reach another customer's requests.
 *
 * A customer can only ever *request* and *cancel*. Approval and payout live on
 * the admin controller (maker-checker).
 */
@ApiTags('withdrawals (customer)')
@ApiBearerAuth()
@Controller('me/withdrawals')
export class WithdrawalsController {
  constructor(
    private readonly withdrawals: WithdrawalsService,
    private readonly scheme: SchemeService,
  ) {}

  @Get('scheme')
  @ApiOperation({ summary: 'The savings scheme terms (term, interest, penalty)' })
  schemeTerms() {
    return this.scheme.describe();
  }

  @Get('quote')
  @ApiOperation({
    summary: 'Preview what a withdrawal would pay out, including any penalty',
  })
  quote(
    @CurrentCustomerId() customerId: string,
    @Query('accountId') accountId?: string,
    @Query('kind') kind?: 'partial' | 'closure',
    @Query('amountRupees') amountRupees?: string,
  ) {
    const amount = amountRupees !== undefined ? Number(amountRupees) : undefined;
    return this.withdrawals.quote(
      customerId,
      accountId,
      kind === 'partial' ? 'partial' : 'closure',
      Number.isFinite(amount) ? amount : undefined,
    );
  }

  @Post()
  @RequiresKyc()
  @ApiOperation({ summary: 'Request a withdrawal (goes to an admin for approval)' })
  create(
    @CurrentCustomerId() customerId: string,
    @Body() dto: CreateWithdrawalDto,
    @Ip() ip: string,
  ) {
    return this.withdrawals.create(customerId, dto, ip);
  }

  @Get()
  @ApiOperation({ summary: 'My withdrawal requests' })
  async list(@CurrentCustomerId() customerId: string, @Query() q: PaginationQueryDto) {
    const { rows, total } = await this.withdrawals.listForCustomer(customerId, q.page, q.limit);
    return paginate(rows, total, q.page, q.limit);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel my own pending request' })
  cancel(
    @CurrentCustomerId() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.withdrawals.cancel(customerId, id, ip);
  }
}
