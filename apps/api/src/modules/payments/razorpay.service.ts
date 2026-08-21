import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

export interface CreatedOrder {
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string;
  /** Mock mode only: a ready-made payment id + signature so the flow is runnable end-to-end. */
  mock?: { paymentId: string; signature: string };
}

/** The gateway's authoritative view of an order, used by the reconciliation sweep. */
export interface GatewayOrderStatus {
  paid: boolean;
  paymentId: string | null;
}

/**
 * Razorpay integration.
 *  - `live` mode uses the Razorpay SDK and real signature secrets.
 *  - `mock` mode (no keys configured) generates local order/payment ids and
 *    signs them with the same HMAC scheme, so the entire payment + webhook flow
 *    is exercisable without any external service.
 * Signature math is identical in both modes: HMAC-SHA256(order_id|payment_id, key_secret).
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger('Razorpay');
  private client: unknown;

  constructor(private readonly config: AppConfigService) {}

  get mode() {
    return this.config.config.razorpay.mode;
  }

  private hmac(data: string, secret: string): string {
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  private safeEqualHex(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  private async liveClient(): Promise<any> {
    if (!this.client) {
      const Razorpay = (await import('razorpay')).default as any;
      this.client = new Razorpay({
        key_id: this.config.config.razorpay.keyId,
        key_secret: this.config.config.razorpay.keySecret,
      });
    }
    return this.client;
  }

  async createOrder(amountPaise: number, receipt: string): Promise<CreatedOrder> {
    const { keyId, keySecret, mode } = this.config.config.razorpay;

    if (mode === 'live') {
      const client = await this.liveClient();
      const order = await client.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        payment_capture: true,
      });
      return { orderId: order.id, amount: amountPaise, currency: 'INR', keyId };
    }

    // Mock: deterministic-enough local ids + a valid signature for immediate verify.
    const orderId = `order_mock_${randomBytes(9).toString('hex')}`;
    const paymentId = `pay_mock_${randomBytes(9).toString('hex')}`;
    const signature = this.hmac(`${orderId}|${paymentId}`, keySecret);
    this.logger.debug(`[mock] created ${orderId}`);
    return {
      orderId,
      amount: amountPaise,
      currency: 'INR',
      keyId: keyId || 'rzp_mock',
      mock: { paymentId, signature },
    };
  }

  /**
   * Ask the gateway for the authoritative state of an order. Used by the
   * reconciliation sweep to recover payments whose webhook/callback never
   * landed. In mock mode there is no external gateway to consult, so we report
   * "unknown / not captured" and let the sweep leave the row pending.
   */
  async fetchOrderStatus(orderId: string): Promise<GatewayOrderStatus> {
    if (this.mode !== 'live') {
      return { paid: false, paymentId: null };
    }
    const client = await this.liveClient();
    const payments = await client.orders.fetchPayments(orderId);
    const items: any[] = payments?.items ?? [];
    const captured = items.find((p) => p.status === 'captured');
    if (captured) return { paid: true, paymentId: captured.id };
    return { paid: false, paymentId: null };
  }

  /** Verify the checkout signature: HMAC-SHA256(order_id|payment_id, key_secret). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): void {
    const expected = this.hmac(`${orderId}|${paymentId}`, this.config.config.razorpay.keySecret);
    if (!this.safeEqualHex(expected, signature)) {
      throw new BadRequestException('Payment signature verification failed');
    }
  }

  /** Verify a webhook payload against the webhook secret. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): void {
    if (!signature) throw new BadRequestException('Missing webhook signature');
    const expected = this.hmac(rawBody, this.config.config.razorpay.webhookSecret);
    if (!this.safeEqualHex(expected, signature)) {
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  /** Helper used by tests / mock tooling to sign a webhook body. */
  signWebhook(rawBody: string): string {
    return this.hmac(rawBody, this.config.config.razorpay.webhookSecret);
  }
}
