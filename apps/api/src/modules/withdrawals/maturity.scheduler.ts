import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { pigmyAccounts } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { NotificationsService } from '../notifications/notifications.service';
import { withRupees } from '../../common/money';
import { daysBetween, simpleInterestPaise } from './scheme.service';

export interface MaturingAccount {
  accountId: string;
  customerId: string;
  accountNumber: string;
  currentBalance: number;
  interestRateBps: number;
  termDays: number;
  createdAt: Date;
}

/** Show only the last 4 chars of an account number in customer-facing copy. */
function last4(accountNumber: string): string {
  return accountNumber.length > 4 ? accountNumber.slice(-4) : accountNumber;
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

/**
 * Daily job that walks accounts past their maturity date and marks them matured,
 * then tells the customer what they can now withdraw (principal + projected
 * interest).
 *
 * It deliberately does NOT credit the interest or move any money: interest is
 * credited at payout time inside the withdrawal transaction, so there is exactly
 * one code path that touches the ledger for a maturity. This job only flips a
 * flag and sends a notification — safe to re-run, and safe to miss a day.
 *
 * The finder is a public, side-effect-free method so it can be unit-tested
 * without cron or Nest DI (same shape as NotificationsScheduler).
 */
@Injectable()
export class MaturityScheduler {
  private readonly logger = new Logger('MaturityScheduler');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Active accounts whose maturity date has passed and which have not yet been
   * marked matured. `maturedAt IS NULL` makes the job idempotent.
   */
  async findMaturedAccounts(now: Date): Promise<MaturingAccount[]> {
    const rows = await this.db
      .select({
        accountId: pigmyAccounts.id,
        customerId: pigmyAccounts.customerId,
        accountNumber: pigmyAccounts.accountNumber,
        currentBalance: pigmyAccounts.currentBalance,
        interestRateBps: pigmyAccounts.interestRateBps,
        termDays: pigmyAccounts.termDays,
        createdAt: pigmyAccounts.createdAt,
      })
      .from(pigmyAccounts)
      .where(
        and(
          eq(pigmyAccounts.status, 'active'),
          isNull(pigmyAccounts.maturedAt),
          lte(pigmyAccounts.maturityDate, now),
        ),
      );

    return rows.map((r) => ({
      accountId: r.accountId,
      customerId: r.customerId as string,
      accountNumber: r.accountNumber,
      currentBalance: Number(r.currentBalance),
      interestRateBps: r.interestRateBps,
      termDays: r.termDays,
      createdAt: toDate(r.createdAt),
    }));
  }

  /**
   * Mark one account matured and notify its owner. Separated from the cron body
   * so it can be driven directly in tests.
   */
  async markMatured(acct: MaturingAccount, now: Date): Promise<number> {
    const heldDays = Math.min(daysBetween(acct.createdAt, now), acct.termDays);
    const projectedInterest = simpleInterestPaise(
      acct.currentBalance,
      acct.interestRateBps,
      heldDays,
    );

    await this.db
      .update(pigmyAccounts)
      .set({ maturedAt: now, updatedAt: now })
      .where(eq(pigmyAccounts.id, acct.accountId));

    await this.audit.record({
      actorId: null,
      actorType: 'system',
      action: AuditAction.PIGMY_MATURED,
      entity: 'pigmy_account',
      entityId: acct.accountId,
      after: {
        maturedAt: now.toISOString(),
        balance: acct.currentBalance,
        projectedInterest,
        termDays: acct.termDays,
      },
    });

    const total = acct.currentBalance + projectedInterest;
    await this.notifications.notifyCustomer(acct.customerId, {
      title: 'Your pigmy account has matured 🎉',
      body: `Account …${last4(acct.accountNumber)} has completed its ${acct.termDays}-day term. You can now withdraw ${withRupees(total).display} (including ${withRupees(projectedInterest).display} interest) with no penalty.`,
      category: 'transaction',
    });

    return projectedInterest;
  }

  /**
   * Runs daily. Reads + one update/notification per matured account, all OUTSIDE
   * any transaction (PGlite is single-connection — see the ledger notes).
   */
  @Cron(process.env.MATURITY_CRON || '30 1 * * *', { name: 'daily-maturity' })
  async runMaturitySweep(): Promise<void> {
    try {
      const now = new Date();
      const due = await this.findMaturedAccounts(now);
      for (const acct of due) {
        await this.markMatured(acct, now);
      }
      if (due.length > 0) {
        this.logger.log(`marked ${due.length} account(s) matured`);
      }
    } catch (err) {
      this.logger.error('Maturity sweep failed', err as Error);
    }
  }
}
