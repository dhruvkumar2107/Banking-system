import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, gte, isNull, max } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { pigmyAccounts, transactions } from '../../db/schema';
import { AppConfigService } from '../../config/app-config.service';
import { NotificationsService } from './notifications.service';

export interface ReminderAccount {
  accountId: string;
  customerId: string;
  accountNumber: string;
  dailyAmount: number;
}

export interface MissedAccount {
  accountId: string;
  customerId: string;
  accountNumber: string;
  missedDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Start-of-today for the given moment (local midnight), mirroring reports.service. */
function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Coerce a driver value (Date | ISO string) to a Date. */
function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

/** Show only the last 4 chars of an account number in customer-facing copy. */
function last4(accountNumber: string): string {
  return accountNumber.length > 4 ? accountNumber.slice(-4) : accountNumber;
}

/**
 * Nightly job that nudges customers to keep their pigmy streak alive:
 *  - a gentle same-day reminder for active accounts with no deposit yet today, and
 *  - a "you've missed N days" alert for accounts that have gone quiet for a while.
 *
 * The query logic lives in two public, side-effect-free finder methods so they can
 * be unit-tested without cron or Nest DI. The @Cron method only orchestrates.
 * Runs OUTSIDE any DB transaction — plain reads + one notification insert per call.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger('NotificationsScheduler');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly notifications: NotificationsService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Active accounts that have NO successful transaction dated today (>= local
   * midnight of `now`). Anti-join: left-join successful-today transactions and
   * keep only the accounts where none matched.
   */
  async findAccountsNeedingReminder(now: Date): Promise<ReminderAccount[]> {
    const today = startOfDay(now);
    const rows = await this.db
      .select({
        accountId: pigmyAccounts.id,
        customerId: pigmyAccounts.customerId,
        accountNumber: pigmyAccounts.accountNumber,
        dailyAmount: pigmyAccounts.dailyAmount,
      })
      .from(pigmyAccounts)
      .leftJoin(
        transactions,
        and(
          eq(transactions.pigmyAccountId, pigmyAccounts.id),
          eq(transactions.status, 'success'),
          gte(transactions.createdAt, today),
        ),
      )
      .where(and(eq(pigmyAccounts.status, 'active'), isNull(transactions.id)));

    return rows.map((r) => ({
      accountId: r.accountId,
      customerId: r.customerId as string,
      accountNumber: r.accountNumber,
      dailyAmount: Number(r.dailyAmount),
    }));
  }

  /**
   * Active accounts whose most-recent successful deposit is at least `threshold`
   * days before `now`. Accounts that have never had a success fall back to their
   * creation date, so a brand-new-but-idle account is only flagged once it has
   * existed for `threshold` days. `missedDays` is measured from that reference.
   */
  async findAccountsWithMissedDays(now: Date, threshold: number): Promise<MissedAccount[]> {
    const activeAccounts = await this.db
      .select({
        accountId: pigmyAccounts.id,
        customerId: pigmyAccounts.customerId,
        accountNumber: pigmyAccounts.accountNumber,
        createdAt: pigmyAccounts.createdAt,
      })
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.status, 'active'));

    const lastSuccessRows = await this.db
      .select({
        pigmyAccountId: transactions.pigmyAccountId,
        lastSuccessAt: max(transactions.createdAt),
      })
      .from(transactions)
      .where(eq(transactions.status, 'success'))
      .groupBy(transactions.pigmyAccountId);

    const lastSuccessById = new Map<string, Date>();
    for (const r of lastSuccessRows) {
      if (r.lastSuccessAt != null) {
        lastSuccessById.set(r.pigmyAccountId, toDate(r.lastSuccessAt));
      }
    }

    const missed: MissedAccount[] = [];
    for (const acct of activeAccounts) {
      const reference = lastSuccessById.get(acct.accountId) ?? toDate(acct.createdAt);
      const missedDays = Math.floor((now.getTime() - reference.getTime()) / MS_PER_DAY);
      if (missedDays >= threshold) {
        missed.push({
          accountId: acct.accountId,
          customerId: acct.customerId as string,
          accountNumber: acct.accountNumber,
          missedDays,
        });
      }
    }
    return missed;
  }

  /**
   * Fires on the configured schedule. The cron expression must be resolvable at
   * class-load time, so it is read from the raw env with the same default the
   * config service uses; the runtime enable/threshold flags come from config.
   */
  @Cron(process.env.REMINDERS_CRON || '0 18 * * *', { name: 'daily-reminders' })
  async runDailyReminders(): Promise<void> {
    const { enabled, missedDaysThreshold } = this.appConfig.config.reminders;
    if (!enabled) return;

    try {
      const now = new Date();
      const reminders = await this.findAccountsNeedingReminder(now);
      const missed = await this.findAccountsWithMissedDays(now, missedDaysThreshold);

      for (const a of reminders) {
        await this.notifications.notifyCustomer(a.customerId, {
          title: 'Save a little today',
          body: `Your daily ₹${(a.dailyAmount / 100).toLocaleString('en-IN')} pigmy deposit for account …${last4(
            a.accountNumber,
          )} is pending. A small save today keeps your streak going!`,
          category: 'system',
        });
      }

      for (const a of missed) {
        await this.notifications.notifyCustomer(a.customerId, {
          title: `You've missed ${a.missedDays} days`,
          body: `Account …${last4(a.accountNumber)} hasn't had a deposit in ${a.missedDays} days. Tap to deposit and stay on track.`,
          category: 'system',
        });
      }

      this.logger.log(`sent ${reminders.length} reminders, ${missed.length} missed-pigmy alerts`);
    } catch (err) {
      this.logger.error('Daily reminder job failed', err as Error);
    }
  }
}
