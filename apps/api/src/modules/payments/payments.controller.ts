import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentCustomerId } from '../../common/decorators/current-customer.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { CreateOrderDto, VerifyPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';
import { RequiresKyc } from '../kyc/kyc.guard';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('order')
  @RequiresKyc()
  @ApiOperation({ summary: 'Create a payment order for a pigmy deposit' })
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentCustomerId() customerId: string,
    @Ip() ip: string,
  ) {
    return this.payments.createOrder(customerId, dto, ip);
  }

  @Post('verify')
  @HttpCode(200)
  // Deliberately NOT @RequiresKyc(). `order` is the chokepoint — an unverified
  // customer can never get an order created in the first place. Gating this route
  // as well would mean that if a customer's KYC lapsed between paying and
  // verifying, we would take their money and refuse to credit it.
  @ApiOperation({ summary: 'Verify a completed payment (server-side signature check)' })
  verify(@Body() dto: VerifyPaymentDto, @CurrentCustomerId() customerId: string, @Ip() ip: string) {
    return this.payments.verifyPayment(customerId, dto, ip);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'My transaction history' })
  async list(@Query() q: PaginationQueryDto, @CurrentCustomerId() customerId: string) {
    const { rows, total } = await this.payments.listForCustomer(customerId, q.page, q.limit);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'One of my transactions' })
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentCustomerId() customerId: string) {
    return this.payments.getForCustomer(customerId, id);
  }

  @Get('transactions/:id/receipt')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download a PDF receipt for a successful payment' })
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomerId() customerId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.payments.buildReceipt(id, { customerId });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
