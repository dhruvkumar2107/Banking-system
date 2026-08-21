import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { TransactionListQueryDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('transactions (admin)')
@ApiBearerAuth()
@Controller('transactions')
@Roles('superadmin', 'admin', 'agent')
export class TransactionsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'All transactions (filter by status/date/village)' })
  async list(@Query() q: TransactionListQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.payments.adminList(user, q);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Pending payments' })
  async pending(@Query() q: TransactionListQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.payments.adminList(user, { ...q, status: 'pending' });
    return paginate(rows, total, q.page, q.limit);
  }

  @Get(':id/receipt')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download a receipt (admin)' })
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AdminPrincipal,
    @Res() res: Response,
  ) {
    const pdf = await this.payments.buildReceipt(id, { actor: user });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
