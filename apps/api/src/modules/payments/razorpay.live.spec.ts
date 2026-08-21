import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { RazorpayService } from './razorpay.service';

/**
 * Live-mode Razorpay behaviour, with the SDK client replaced by a fake so no
 * network call is made. The signature math needs no gateway at all — it is pure
 * HMAC — so these assertions are exactly as strong as they would be against the
 * real service. What a fake cannot prove is that Razorpay's API still has the
 * shape we assume; that is the remaining shake-out when real keys land.
 */
describe('RazorpayService (live mode)', () => {
  const ORIGINAL_ENV = { ...process.env };

  const LIVE_ENV = {
    PAYMENTS_MODE: 'live',
    RAZORPAY_KEY_ID: 'rzp_live_testkey',
    RAZORPAY_KEY_SECRET: 'live_secret_abc123',
    RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_xyz789',
  };

  const build = (env: Record<string, string> = LIVE_ENV) => {
    process.env = { ...ORIGINAL_ENV, ...env };
    return new RazorpayService(new AppConfigService());
  };

  /** Inject a fake SDK client, bypassing the real `razorpay` import. */
  const withClient = (svc: RazorpayService, client: unknown) => {
    (svc as unknown as { client: unknown }).client = client;
    return svc;
  };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('mode resolution', () => {
    it('is live only when PAYMENTS_MODE=live AND both keys are present', () => {
      expect(build().mode).toBe('live');
    });

    it('falls back to mock when keys are missing, even if live was requested', () => {
      expect(build({ PAYMENTS_MODE: 'live', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }).mode)
        .toBe('mock');
    });

    it('falls back to mock when only one key is supplied', () => {
      expect(
        build({
          PAYMENTS_MODE: 'live',
          RAZORPAY_KEY_ID: 'rzp_live_testkey',
          RAZORPAY_KEY_SECRET: '',
        }).mode,
      ).toBe('mock');
    });
  });

  describe('createOrder', () => {
    it('creates the order through the gateway with the amount in paise', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'order_LiveAbc123' });
      const svc = withClient(build(), { orders: { create } });

      const order = await svc.createOrder(10_000, 'txn-uuid-1');

      expect(create).toHaveBeenCalledWith({
        amount: 10_000,
        currency: 'INR',
        receipt: 'txn-uuid-1',
        payment_capture: true,
      });
      expect(order.orderId).toBe('order_LiveAbc123');
      expect(order.amount).toBe(10_000);
      expect(order.currency).toBe('INR');
      expect(order.keyId).toBe('rzp_live_testkey');
    });

    it('never hands the client a mock payment id or signature in live mode', async () => {
      const svc = withClient(build(), {
        orders: { create: jest.fn().mockResolvedValue({ id: 'order_LiveAbc123' }) },
      });

      const order = await svc.createOrder(5_000, 'txn-uuid-2');

      // A mock signature reaching a live client would let anyone self-settle a payment.
      expect(order.mock).toBeUndefined();
    });

    it('propagates a gateway failure instead of silently falling back to mock', async () => {
      const svc = withClient(build(), {
        orders: { create: jest.fn().mockRejectedValue(new Error('gateway 502')) },
      });

      await expect(svc.createOrder(10_000, 'txn-uuid-3')).rejects.toThrow('gateway 502');
    });
  });

  describe('verifyPaymentSignature', () => {
    const sign = (data: string, secret: string) =>
      createHmac('sha256', secret).update(data).digest('hex');

    it('accepts a signature produced with the live key secret', () => {
      const svc = build();
      const signature = sign('order_Live1|pay_Live1', 'live_secret_abc123');

      expect(() => svc.verifyPaymentSignature('order_Live1', 'pay_Live1', signature)).not.toThrow();
    });

    it('rejects a signature made with the wrong secret', () => {
      const svc = build();
      const forged = sign('order_Live1|pay_Live1', 'attacker_guess');

      expect(() => svc.verifyPaymentSignature('order_Live1', 'pay_Live1', forged)).toThrow(
        BadRequestException,
      );
    });

    it('rejects a signature bound to a different payment id', () => {
      const svc = build();
      const other = sign('order_Live1|pay_OTHER', 'live_secret_abc123');

      expect(() => svc.verifyPaymentSignature('order_Live1', 'pay_Live1', other)).toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty or truncated signature', () => {
      const svc = build();
      const valid = sign('order_Live1|pay_Live1', 'live_secret_abc123');

      expect(() => svc.verifyPaymentSignature('order_Live1', 'pay_Live1', '')).toThrow(
        BadRequestException,
      );
      expect(() =>
        svc.verifyPaymentSignature('order_Live1', 'pay_Live1', valid.slice(0, -2)),
      ).toThrow(BadRequestException);
    });
  });

  describe('verifyWebhookSignature', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured', payload: { amount: 10000 } });

    it('accepts a body signed with the webhook secret', () => {
      const svc = build();
      const signature = createHmac('sha256', 'webhook_secret_xyz789')
        .update(rawBody)
        .digest('hex');

      expect(() => svc.verifyWebhookSignature(rawBody, signature)).not.toThrow();
    });

    it('rejects a missing signature header', () => {
      const svc = build();
      expect(() => svc.verifyWebhookSignature(rawBody, undefined)).toThrow(BadRequestException);
    });

    it('rejects a body that was altered after signing', () => {
      const svc = build();
      const signature = createHmac('sha256', 'webhook_secret_xyz789')
        .update(rawBody)
        .digest('hex');
      const tampered = JSON.stringify({
        event: 'payment.captured',
        payload: { amount: 9_900_000 },
      });

      expect(() => svc.verifyWebhookSignature(tampered, signature)).toThrow(BadRequestException);
    });

    it('uses the webhook secret, not the payment key secret', () => {
      const svc = build();
      const wrongSecret = createHmac('sha256', 'live_secret_abc123').update(rawBody).digest('hex');

      expect(() => svc.verifyWebhookSignature(rawBody, wrongSecret)).toThrow(BadRequestException);
    });
  });

  describe('fetchOrderStatus (used by the reconciliation sweep)', () => {
    it('reports paid when the gateway holds a captured payment', async () => {
      const svc = withClient(build(), {
        orders: {
          fetchPayments: jest.fn().mockResolvedValue({
            items: [
              { id: 'pay_failed1', status: 'failed' },
              { id: 'pay_ok1', status: 'captured' },
            ],
          }),
        },
      });

      await expect(svc.fetchOrderStatus('order_Live1')).resolves.toEqual({
        paid: true,
        paymentId: 'pay_ok1',
      });
    });

    it('reports unpaid when no payment was captured', async () => {
      const svc = withClient(build(), {
        orders: {
          fetchPayments: jest
            .fn()
            .mockResolvedValue({ items: [{ id: 'pay_x', status: 'authorized' }] }),
        },
      });

      await expect(svc.fetchOrderStatus('order_Live1')).resolves.toEqual({
        paid: false,
        paymentId: null,
      });
    });

    it('handles an empty payment list without throwing', async () => {
      const svc = withClient(build(), {
        orders: { fetchPayments: jest.fn().mockResolvedValue({}) },
      });

      await expect(svc.fetchOrderStatus('order_Live1')).resolves.toEqual({
        paid: false,
        paymentId: null,
      });
    });

    it('never consults a gateway in mock mode', async () => {
      const fetchPayments = jest.fn();
      const svc = withClient(build({ PAYMENTS_MODE: 'mock' }), { orders: { fetchPayments } });

      await expect(svc.fetchOrderStatus('order_mock_1')).resolves.toEqual({
        paid: false,
        paymentId: null,
      });
      expect(fetchPayments).not.toHaveBeenCalled();
    });
  });
});
