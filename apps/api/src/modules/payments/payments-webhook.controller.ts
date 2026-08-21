import { Controller, Headers, HttpCode, Ip, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

/**
 * Razorpay webhook receiver. Public (no JWT) but authenticated by HMAC
 * signature verification against the raw request body. This is the primary,
 * trusted settlement path — client callbacks are only a convenience.
 */
@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Ip() ip: string,
  ) {
    // rawBody is captured by the bodyParser verify hook (see main.ts) so the
    // HMAC is computed over the exact bytes Razorpay signed.
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    return this.payments.handleWebhook(raw, signature, ip);
  }
}
