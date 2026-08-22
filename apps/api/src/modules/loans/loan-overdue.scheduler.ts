import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { loanInstalments, loans } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { NotificationsService } from '../notifications/notifications.service';
import { withRupees } from '../../common/money';

export interface OverdueInstalment {
  instalmentId: string;
  loanId: string;
  loanNumber: string;
  customerId: string;
  instalmentNo: number;
  dueDate: Date;
  amountDue: number;
  amountPaid: number;
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

/** Start of day, so "due today" is never treated as already late. */
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * Daily jobs over the loan book: flag missed instalments, and nudge borrowers
 * before they miss one.
 *
 * Like MaturityScheduler, this NEVER moves money. It flips `due → overdue` and
 * sends notifications, nothing else — no penalty is charged, no balance is
 * touched, `loans.outstandingPaise` is left exactly as the repayment path left
 * it. That keeps the ledger with a single writer and makes the job safe to
 * re-run, safe to miss a day, and safe to run twice in one day.
 *
 * Idempotency comes from the `status = 'due'` filter: an instalment already
 * marked overdue is not picked up again, so the borrower is not re-notified
 * every morning about the same arrears.
 *
 * The finders are public and side-effect-free so they can be unit-tested without
 * cron or Nest DI (same shape as MaturityScheduler).
 */
@Injectable()
export class LoanOverdueScheduler {
  private readonly logger = new Logger('LoanOverdueScheduler');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Instalments on disbursed loans whose due date has passed and which are still
   * marked `due`. Part-paid instalments are included — owing anything past the
   * date is late.
   */
  async findOverdue(now: Date): Promise<OverdueInstalment[]> {
    const rows = await this.db
      .select({
        instalmentId: loanInstalments.id,
        loanId: loans.id,
        loanNumber: loans.loanNumber,
        customerId: loans.customerId,
        instalmentNo: loanInstalments.instalmentNo,
        dueDate: loanInstalments.dueDate,
        amountDue: loanInstalments.amountDue,
        amountPaid: loanInstalments.amountPaid,
      })
      .from(loanInstalments)
      .innerJoin(loans, eq(loans.id, loanInstalments.loanId))
      .where(
        and(
          eq(loans.status, 'disbursed'),
          eq(loanInstalments.status, 'due'),
          lt(loanInstalments.dueDate, startOfDay(now)),
        ),
      )
      .orderBy(asc(loanInstalments.dueDate));

    return rows.map((r) => ({
      instalmentId: r.instalmentId,
      loanId: r.loanId,
      loanNumber: r.loanNumber,
      customerId: r.customerId as string,
      instalmentNo: r.instalmentNo,
      dueDate: toDate(r.dueDate),
      amountDue: Number(r.amountDue),
      amountPaid: Number(r.amountPaid),
    }));
  }

  /**
   * Mark a batch of instalments overdue and notify each borrower ONCE with the
   * aggregate. Batched per loan on purpose — a borrower three months behind
   * should get one message about ₹3,000, not three messages about ₹1,000.
   */
  async markOverdue(instalments: OverdueInstalment[], now: Date): Promise<number> {
    if (instalments.length === 0) return 0;

    await this.db
      .update(loanInstalments)
      .set({ status: 'overdue' })
      .where(
        inArray(
          loanInstalments.id,
          instalments.map((i) => i.instalmentId),
        ),
      );

    const byLoan = new Map<string, OverdueInstalment[]>();
    for (const inst of instalments) {
      const list = byLoan.get(inst.loanId) ?? [];
      list.push(inst);
      byLoan.set(inst.loanId, list);
    }

    for (const [loanId, group] of byLoan) {
      const arrears = group.reduce((sum, i) => sum + (i.amountDue - i.amountPaid), 0);
      const oldest = group.reduce((a, b) => (a.dueDate <= b.dueDate ? a : b));
      const { loanNumber, customerId } = group[0];

      await this.audit.record({
        actorId: null,
        actorType: 'system',
        action: AuditAction.LOAN_OVERDUE_MARKED,
        entity: 'loan',
        entityId: loanId,
        after: {
          loanNumber,
          markedAt: now.toISOString(),
          instalments: group.map((i) => i.instalmentNo),
          arrears,
          oldestDueDate: oldest.dueDate.toISOString(),
        },
      });

      await this.notifications.notifyCustomer(customerId, {
        title: group.length === 1 ? 'Your EMI is overdue' : `${group.length} EMIs are overdue`,
        body:
          group.length === 1
            ? `Instalment ${oldest.instalmentNo} of loan ${loanNumber} (${withRupees(arrears).display}) was due on ${oldest.dueDate.toLocaleDateString('en-IN')} and is still unpaid. Please pay at your branch.`
            : `Loan ${loanNumber} has ${group.length} unpaid instalments totalling ${withRupees(arrears).display}, the oldest due on ${oldest.dueDate.toLocaleDateString('en-IN')}. Please visit your branch.`,
        category: 'transaction',
      });
    }

    return instalments.length;
  }

  /**
   * Instalments falling due in the next `days`, still unpaid and not yet overdue —
   * the borrowers worth reminding. Kept separate from `findOverdue` so a reminder
   * can never be mistaken for arrears.
   */
  async findDueSoon(now: Date, days = 3): Promise<OverdueInstalment[]> {
    const from = startOfDay(now);
    const to = startOfDay(now);
    to.setDate(to.getDate() + days);

    const rows = await this.db
      .select({
        instalmentId: loanInstalments.id,
        loanId: loans.id,
        loanNumber: loans.loanNumber,
        customerId: loans.customerId,
        instalmentNo: loanInstalments.instalmentNo,
        dueDate: loanInstalments.dueDate,
        amountDue: loanInstalments.amountDue,
        amountPaid: loanInstalments.amountPaid,
      })
      .from(loanInstalments)
      .innerJoin(loans, eq(loans.id, loanInstalments.loanId))
      .where(
        and(
          eq(loans.status, 'disbursed'),
          eq(loanInstalments.status, 'due'),
          gte(loanInstalments.dueDate, from),
          lte(loanInstalments.dueDate, to),
        ),
      )
      .orderBy(asc(loanInstalments.dueDate));

    return rows.map((r) => ({
      instalmentId: r.instalmentId,
      loanId: r.loanId,
      loanNumber: r.loanNumber,
      customerId: r.customerId as string,
      instalmentNo: r.instalmentNo,
      dueDate: toDate(r.dueDate),
      amountDue: Number(r.amountDue),
      amountPaid: Number(r.amountPaid),
    }));
  }

  /**
   * Runs daily, before the working day. One update + one notification per loan,
   * all OUTSIDE any transaction (PGlite is single-connection — see the ledger
   * notes). Wrapped in try/catch so a bad row cannot kill the cron thread.
   */
  @Cron(process.env.LOAN_OVERDUE_CRON || '45 1 * * *', { name: 'daily-loan-overdue' })
  async runOverdueSweep(): Promise<void> {
    try {
      const now = new Date();
      const overdue = await this.findOverdue(now);
      const marked = await this.markOverdue(overdue, now);
      if (marked > 0) {
        this.logger.log(`marked ${marked} instalment(s) overdue`);
      }
    } catch (err) {
      this.logger.error('Loan overdue sweep failed', err as Error);
    }
  }

  /**
   * Runs daily mid-morning: reminds borrowers whose EMI falls due within three
   * days. A reminder is not idempotent the way the overdue flag is — nothing is
   * written — so this deliberately fires on a window that shrinks each day
   * (3 days out, then 2, then 1) rather than repeating an identical message.
   */
  @Cron(process.env.LOAN_REMINDER_CRON || '15 9 * * *', { name: 'daily-loan-reminder' })
  async runReminderSweep(): Promise<void> {
    try {
      const now = new Date();
      const soon = await this.findDueSoon(now, 3);
      for (const inst of soon) {
        const owing = inst.amountDue - inst.amountPaid;
        if (owing <= 0) continue;
        await this.notifications.notifyCustomer(inst.customerId, {
          title: 'EMI due soon',
          body: `Instalment ${inst.instalmentNo} of loan ${inst.loanNumber} — ${withRupees(owing).display} — is due on ${inst.dueDate.toLocaleDateString('en-IN')}.`,
          category: 'transaction',
        });
      }
      if (soon.length > 0) {
        this.logger.log(`reminded ${soon.length} borrower(s) of an upcoming EMI`);
      }
    } catch (err) {
      this.logger.error('Loan reminder sweep failed', err as Error);
    }
  }
}
