import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppConfigService } from '../../config/app-config.service';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';

/**
 * Periodic reconciliation for payments whose capture webhook/callback never
 * arrived. It asks the gateway for the authoritative status of each stale
 * pending order and settles the ones that were actually captured — via the
 * same idempotent settlement path the webhook uses, so a late webhook can
 * never double-credit.
 *
 * The actual query + settle logic lives in PaymentsService (which owns the
 * ledger-safe `settle`); this class only schedules and guards it. It is a
 * no-op unless payments are live — mock mode has no external gateway.
 * Runs OUTSIDE any DB transaction.
 */
@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger('PaymentsScheduler');

  constructor(
    private readonly payments: PaymentsService,
    private readonly razorpay: RazorpayService,
    private readonly appConfig: AppConfigService,
  ) {}

  @Cron(process.env.RECONCILE_CRON || '*/15 * * * *', { name: 'payments-reconciliation' })
  async runReconciliation(): Promise<void> {
    const { enabled, staleMinutes } = this.appConfig.config.reconcile;
    if (!enabled) return;
    if (this.razorpay.mode !== 'live') {
      this.logger.debug('Payments in mock mode — skipping reconciliation sweep.');
      return;
    }

    try {
      const { checked, settled } = await this.payments.reconcilePending(new Date(), staleMinutes);
      if (checked > 0) {
        this.logger.log(`Reconciliation sweep: ${settled}/${checked} stale pending payment(s) settled.`);
      }
    } catch (err) {
      this.logger.error('Payment reconciliation job failed', err as Error);
    }
  }
}
