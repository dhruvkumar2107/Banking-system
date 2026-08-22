import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import {
  admins,
  customers,
  loanInstalments,
  loans,
  pigmyAccounts,
  villages,
  type Loan,
  type LoanInstalment,
} from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rupeesToPaise, withRupees } from '../../common/money';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { kycPasses } from '../kyc/kyc.service';
import { LoanSettingsService, type EffectiveLoanSettings } from './loan-settings.service';
import {
  allocatePayment,
  flatToApproxReducingBps,
  instalmentDueDate,
  maxEligiblePaise,
  outstandingFrom,
  quoteLoan,
  splitInstalments,
  type InstalmentState,
} from './loan-math';
import type {
  ApproveLoanDto,
  CreateLoanDto,
  DefaultLoanDto,
  DisburseLoanDto,
  LoanListQueryDto,
  RecordRepaymentDto,
  RejectLoanDto,
  WaiveInstalmentDto,
} from './loans.dto';

/**
 * Loan engine — maker-checker, mirroring WithdrawalsService.
 *
 * A customer *applies*; an admin *decides*; disbursal and every repayment are
 * *recorded* separately. State machine (enforced by `assertTransition`):
 *
 *   pending → approved → disbursed → closed
 *   pending ──────────→ rejected      (admin, reason required)
 *   pending ──────────→ cancelled     (customer, own application only)
 *   disbursed ────────→ defaulted     (admin, reason required)
 *
 * Two invariants this service exists to protect:
 *
 * 1. `loans.outstandingPaise` is DERIVED. It is recomputed from the instalment
 *    rows on every repayment/waiver and written in the same transaction — never
 *    incremented in place. The instalment table is the source of truth, exactly
 *    as ledger_entries is for the savings balance.
 *
 * 2. Terms are SNAPSHOTTED at approval. Changing the loan product afterwards
 *    never re-prices a loan that is already approved or running.
 *
 * Disbursal is deliberately OFF-ledger: the cash/transfer is recorded with a
 * reference, but it is NOT credited into the customer's pigmy savings account.
 * That account's `totalDeposited` must only ever reflect genuine savings, and
 * paying a loan into it would both corrupt that figure and let a borrower
 * "withdraw" loan money as if it were their own deposit. Only a `from_savings`
 * repayment touches the ledger, as a DEBIT.
 *
 * NOTE (PGlite): every call inside a `db.transaction()` passes `tx` — PGlite has
 * a single connection, so touching `this.db` in there would deadlock.
 */
@Injectable()
export class LoansService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly settings: LoanSettingsService,
  ) {}

  // ── serialization ──────────────────────────────────────────────────────────
  private serialize(l: Loan) {
    return {
      id: l.id,
      customerId: l.customerId,
      pigmyAccountId: l.pigmyAccountId,
      loanNumber: l.loanNumber,
      status: l.status,
      principal: withRupees(l.principal),
      purpose: l.purpose,
      tenureMonths: l.tenureMonths,
      interestRateBps: l.interestRateBps,
      interestRatePercent: l.interestRateBps / 100,
      totalInterest: withRupees(l.totalInterest),
      processingFee: withRupees(l.processingFee),
      totalPayable: withRupees(l.totalPayable),
      emiAmount: withRupees(l.emiAmount),
      outstanding: withRupees(l.outstandingPaise),
      totalRepaid: withRupees(Math.max(0, l.totalPayable - l.outstandingPaise)),
      disbursementMethod: l.disbursementMethod,
      bankAccountMasked: l.bankAccountMasked,
      bankIfsc: l.bankIfsc,
      reference: l.reference,
      note: l.note,
      rejectionReason: l.rejectionReason,
      requestedAt: l.requestedAt,
      decidedAt: l.decidedAt,
      decidedById: l.decidedById,
      disbursedAt: l.disbursedAt,
      firstDueDate: l.firstDueDate,
      closedAt: l.closedAt,
    };
  }

  private serializeInstalment(i: LoanInstalment) {
    return {
      id: i.id,
      instalmentNo: i.instalmentNo,
      dueDate: i.dueDate,
      amountDue: withRupees(i.amountDue),
      amountPaid: withRupees(i.amountPaid),
      outstanding: withRupees(Math.max(0, i.amountDue - i.amountPaid)),
      status: i.status,
      method: i.method,
      reference: i.reference,
      ledgerEntryId: i.ledgerEntryId,
      paidAt: i.paidAt,
      waivedReason: i.waivedReason,
    };
  }

  /** Guard every state change through one place. */
  private assertTransition(current: Loan['status'], next: Loan['status']) {
    const allowed: Record<string, string[]> = {
      pending: ['approved', 'rejected', 'cancelled'],
      approved: ['disbursed', 'rejected'],
      disbursed: ['closed', 'defaulted'],
      rejected: [],
      cancelled: [],
      closed: [],
      defaulted: [],
    };
    if (!allowed[current]?.includes(next)) {
      throw new BadRequestException(`Cannot move a ${current} loan to ${next}`);
    }
  }

  private async generateLoanNumber(runner: AppDatabase | AppTransaction): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const candidate = `LN${randomInt(1_000_000_0000, 9_999_999_9999)}`;
      const [existing] = await runner
        .select({ id: loans.id })
        .from(loans)
        .where(eq(loans.loanNumber, candidate))
        .limit(1);
      if (!existing) return candidate;
    }
    throw new Error('Could not allocate a unique loan number');
  }

  /** Load an account and prove it belongs to this customer. */
  private async resolveOwnAccount(customerId: string, accountId?: string) {
    const rows = await this.db
      .select()
      .from(pigmyAccounts)
      .where(accountId ? eq(pigmyAccounts.id, accountId) : eq(pigmyAccounts.customerId, customerId))
      .orderBy(desc(pigmyAccounts.createdAt))
      .limit(1);
    const acct = rows[0];
    if (!acct) throw new NotFoundException('No pigmy account found');
    if (acct.customerId !== customerId) throw new ForbiddenException('Not your account');
    return acct;
  }

  // ── eligibility ────────────────────────────────────────────────────────────
  /**
   * Every reason this customer cannot borrow this amount, gathered rather than
   * thrown one at a time — the app shows the whole list so the borrower learns
   * what to fix in one trip, instead of discovering a new obstacle per attempt.
   */
  private async evaluateEligibility(
    customerId: string,
    accountId: string | undefined,
    principalPaise: number,
    tenureMonths: number,
    s: EffectiveLoanSettings,
  ) {
    const reasons: string[] = [];

    const acct = await this.resolveOwnAccount(customerId, accountId);
    const [customer] = await this.db
      .select({ kycStage: customers.kycStage })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new NotFoundException('Customer not found');

    if (!s.enabled) reasons.push('Loans are not being offered at the moment');
    if (!kycPasses(customer.kycStage)) {
      reasons.push('Your KYC must be verified before you can apply for a loan');
    }
    if (acct.status !== 'active') {
      reasons.push(`Your savings account is ${acct.status} — an active account is required`);
    }
    if (acct.currentBalance < s.minSavingsPaise) {
      reasons.push(
        `You need at least ${withRupees(s.minSavingsPaise).display} in savings (you have ${withRupees(acct.currentBalance).display})`,
      );
    }

    const ceiling = maxEligiblePaise(acct.currentBalance, s.maxLoanToBalanceBps);
    if (principalPaise > ceiling) {
      reasons.push(
        `Based on your savings of ${withRupees(acct.currentBalance).display} you can borrow up to ${withRupees(ceiling).display}`,
      );
    }
    if (principalPaise < s.minAmountPaise) {
      reasons.push(`The smallest loan is ${withRupees(s.minAmountPaise).display}`);
    }
    if (principalPaise > s.maxAmountPaise) {
      reasons.push(`The largest loan is ${withRupees(s.maxAmountPaise).display}`);
    }
    if (tenureMonths < s.minTenureMonths || tenureMonths > s.maxTenureMonths) {
      reasons.push(
        `Tenure must be between ${s.minTenureMonths} and ${s.maxTenureMonths} months`,
      );
    }

    // One live loan at a time. Without this, two applications could each pass
    // the loan-to-balance check and jointly exceed the borrower's ceiling.
    const [open] = await this.db
      .select({ id: loans.id, status: loans.status, loanNumber: loans.loanNumber })
      .from(loans)
      .where(
        and(
          eq(loans.customerId, customerId),
          inArray(loans.status, ['pending', 'approved', 'disbursed']),
        ),
      )
      .limit(1);
    if (open) {
      reasons.push(
        `You already have a ${open.status} loan (${open.loanNumber}). It must be closed first.`,
      );
    }

    return { acct, ceiling, reasons };
  }

  // ── customer: product terms + quote ────────────────────────────────────────
  /** The loan product on offer, for the "what can I borrow?" screen. */
  describeSettings() {
    return this.settings.describe();
  }

  /**
   * Price a hypothetical loan and say whether it would be accepted, without
   * creating anything. Drives the live EMI preview as the borrower drags the
   * amount slider, so the cost is never a surprise after applying.
   */
  async quote(customerId: string, accountId: string | undefined, amountRupees: number, tenureMonths: number) {
    const s = await this.settings.current();
    const principal = rupeesToPaise(amountRupees);
    const { acct, ceiling, reasons } = await this.evaluateEligibility(
      customerId,
      accountId,
      principal,
      tenureMonths,
      s,
    );

    const q = quoteLoan(principal, s.interestRateBps, tenureMonths, s.processingFeeBps);
    return {
      eligible: reasons.length === 0,
      reasons,
      accountId: acct.id,
      accountNumber: acct.accountNumber,
      savingsBalance: withRupees(acct.currentBalance),
      maxEligible: withRupees(ceiling),
      quote: {
        principal: withRupees(q.principal),
        tenureMonths: q.tenureMonths,
        interestRateBps: q.interestRateBps,
        interestRatePercent: q.interestRateBps / 100,
        approxReducingRatePercent: flatToApproxReducingBps(q.interestRateBps, tenureMonths) / 100,
        totalInterest: withRupees(q.totalInterest),
        processingFee: withRupees(q.processingFee),
        totalPayable: withRupees(q.totalPayable),
        emiAmount: withRupees(q.emiAmount),
        netDisbursed: withRupees(q.netDisbursed),
      },
    };
  }

  // ── customer: apply / list / detail / cancel ───────────────────────────────
  /**
   * Raise a loan application. Prices it at today's terms so the customer sees
   * real figures immediately, but those are re-priced at approval — the admin,
   * not the applicant, fixes the terms that count.
   */
  async apply(customerId: string, dto: CreateLoanDto, ip?: string) {
    const s = await this.settings.current();
    const principal = rupeesToPaise(dto.amountRupees);
    const { acct, reasons } = await this.evaluateEligibility(
      customerId,
      dto.accountId,
      principal,
      dto.tenureMonths,
      s,
    );
    if (reasons.length > 0) throw new BadRequestException(reasons[0]);

    const q = quoteLoan(principal, s.interestRateBps, dto.tenureMonths, s.processingFeeBps);
    const loanNumber = await this.generateLoanNumber(this.db);

    const [row] = await this.db
      .insert(loans)
      .values({
        customerId,
        pigmyAccountId: acct.id,
        loanNumber,
        principal,
        purpose: dto.purpose ?? null,
        status: 'pending',
        interestRateBps: s.interestRateBps,
        tenureMonths: dto.tenureMonths,
        totalInterest: q.totalInterest,
        processingFee: q.processingFee,
        totalPayable: q.totalPayable,
        emiAmount: q.emiAmount,
        outstandingPaise: 0, // nothing is owed until the money is disbursed
      })
      .returning();

    await this.audit.record({
      actorId: customerId,
      actorType: 'customer',
      action: AuditAction.LOAN_REQUESTED,
      entity: 'loan',
      entityId: row.id,
      after: {
        loanNumber,
        principal,
        tenureMonths: dto.tenureMonths,
        interestRateBps: s.interestRateBps,
        totalPayable: q.totalPayable,
        accountId: acct.id,
      },
      ip,
    });

    await this.notifications.notifyCustomer(customerId, {
      title: 'Loan application received',
      body: `Your application for ${withRupees(principal).display} (${loanNumber}) is pending approval. We'll notify you once it's reviewed.`,
      category: 'transaction',
    });

    return this.serialize(row);
  }

  async listForCustomer(customerId: string, page: number, limit: number) {
    const where = eq(loans.customerId, customerId);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(loans)
        .where(where)
        .orderBy(desc(loans.requestedAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(loans).where(where),
    ]);
    return { rows: rows.map((r) => this.serialize(r)), total };
  }

  /** One of the customer's own loans, with the full repayment schedule. */
  async getForCustomer(customerId: string, loanId: string) {
    const [row] = await this.db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
    if (!row) throw new NotFoundException('Loan not found');
    if (row.customerId !== customerId) throw new ForbiddenException('Not your loan');

    const schedule = await this.db
      .select()
      .from(loanInstalments)
      .where(eq(loanInstalments.loanId, loanId))
      .orderBy(asc(loanInstalments.instalmentNo));

    return {
      ...this.serialize(row),
      instalments: schedule.map((i) => this.serializeInstalment(i)),
      nextDue: this.nextDueOf(schedule),
    };
  }

  /** The instalment the borrower should pay next — the oldest unsettled one. */
  private nextDueOf(schedule: LoanInstalment[]) {
    const next = schedule
      .filter((i) => i.status !== 'waived' && i.amountPaid < i.amountDue)
      .sort((a, b) => a.instalmentNo - b.instalmentNo)[0];
    return next ? this.serializeInstalment(next) : null;
  }

  async cancel(customerId: string, loanId: string, ip?: string) {
    const [row] = await this.db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
    if (!row) throw new NotFoundException('Loan not found');
    if (row.customerId !== customerId) throw new ForbiddenException('Not your loan');
    this.assertTransition(row.status, 'cancelled');

    const [updated] = await this.db
      .update(loans)
      .set({ status: 'cancelled', decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(loans.id, loanId))
      .returning();

    await this.audit.record({
      actorId: customerId,
      actorType: 'customer',
      action: AuditAction.LOAN_CANCELLED,
      entity: 'loan',
      entityId: loanId,
      before: { status: row.status },
      after: { status: 'cancelled' },
      ip,
    });
    return this.serialize(updated);
  }

  // ── admin: list / detail ───────────────────────────────────────────────────
  /** Village-scoped queue. Joins customer + village so the admin sees who/where. */
  async listForAdmin(actor: AdminPrincipal, q: LoanListQueryDto) {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (q.status) conds.push(eq(loans.status, q.status));
    if (q.villageId) {
      assertVillageAccess(actor, q.villageId);
      conds.push(eq(customers.villageId, q.villageId));
    }
    if (q.search) {
      conds.push(
        or(
          ilike(customers.name, `%${q.search}%`),
          ilike(customers.mobile, `%${q.search}%`),
          ilike(loans.loanNumber, `%${q.search}%`),
          ilike(pigmyAccounts.accountNumber, `%${q.search}%`),
        ),
      );
    }
    if (q.overdueOnly) {
      // Loans with at least one instalment the scheduler has flagged overdue.
      conds.push(
        inArray(
          loans.id,
          this.db
            .select({ id: loanInstalments.loanId })
            .from(loanInstalments)
            .where(eq(loanInstalments.status, 'overdue')),
        ),
      );
    }
    const where = and(...conds.filter(Boolean));

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          loan: loans,
          customerName: customers.name,
          customerMobile: customers.mobile,
          villageName: villages.name,
          accountNumber: pigmyAccounts.accountNumber,
          accountBalance: pigmyAccounts.currentBalance,
        })
        .from(loans)
        .innerJoin(customers, eq(customers.id, loans.customerId))
        .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, loans.pigmyAccountId))
        .innerJoin(villages, eq(villages.id, customers.villageId))
        .where(where)
        .orderBy(desc(loans.requestedAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db
        .select({ value: count() })
        .from(loans)
        .innerJoin(customers, eq(customers.id, loans.customerId))
        .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, loans.pigmyAccountId))
        .where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        ...this.serialize(r.loan),
        customer: { name: r.customerName, mobile: r.customerMobile },
        village: r.villageName,
        accountNumber: r.accountNumber,
        accountBalance: withRupees(Number(r.accountBalance)),
      })),
      total,
    };
  }

  /** How many applications await a decision (drives the sidebar badge). */
  async pendingCount(actor: AdminPrincipal) {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(loans)
      .innerJoin(customers, eq(customers.id, loans.customerId))
      .where(
        and(
          ...[villageScopeFilter(actor, customers.villageId), eq(loans.status, 'pending')].filter(
            Boolean,
          ),
        ),
      );
    return { pending: value };
  }

  /** One loan with everything an approver needs, village-scoped. */
  async getForAdmin(loanId: string, actor: AdminPrincipal) {
    const [row] = await this.db
      .select({
        loan: loans,
        customerId: customers.id,
        customerName: customers.name,
        customerMobile: customers.mobile,
        customerKycStage: customers.kycStage,
        villageId: customers.villageId,
        villageName: villages.name,
        account: pigmyAccounts,
        decidedByName: admins.name,
      })
      .from(loans)
      .innerJoin(customers, eq(customers.id, loans.customerId))
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, loans.pigmyAccountId))
      .innerJoin(villages, eq(villages.id, customers.villageId))
      .leftJoin(admins, eq(admins.id, loans.decidedById))
      .where(eq(loans.id, loanId))
      .limit(1);
    if (!row) throw new NotFoundException('Loan not found');
    assertVillageAccess(actor, row.villageId);

    const schedule = await this.db
      .select()
      .from(loanInstalments)
      .where(eq(loanInstalments.loanId, loanId))
      .orderBy(asc(loanInstalments.instalmentNo));

    const overdueCount = schedule.filter((i) => i.status === 'overdue').length;

    return {
      ...this.serialize(row.loan),
      customer: {
        id: row.customerId,
        name: row.customerName,
        mobile: row.customerMobile,
        kycStage: row.customerKycStage,
      },
      village: { id: row.villageId, name: row.villageName },
      account: {
        id: row.account.id,
        accountNumber: row.account.accountNumber,
        status: row.account.status,
        currentBalance: withRupees(row.account.currentBalance),
        totalDeposited: withRupees(row.account.totalDeposited),
      },
      instalments: schedule.map((i) => this.serializeInstalment(i)),
      nextDue: this.nextDueOf(schedule),
      overdueCount,
      decidedBy: row.decidedByName ?? null,
    };
  }

  /** Load a loan for mutation, enforcing village scope. Returns the raw row. */
  private async loadForDecision(loanId: string, actor: AdminPrincipal) {
    const [row] = await this.db
      .select({ loan: loans, villageId: customers.villageId })
      .from(loans)
      .innerJoin(customers, eq(customers.id, loans.customerId))
      .where(eq(loans.id, loanId))
      .limit(1);
    if (!row) throw new NotFoundException('Loan not found');
    assertVillageAccess(actor, row.villageId);
    return row.loan;
  }

  // ── admin: approve / reject ────────────────────────────────────────────────
  /**
   * Approve — the "checker" half. No money moves yet and no schedule exists;
   * approval only fixes the TERMS. Those are re-priced here from the live
   * settings (with optional per-borrower overrides) and snapshotted onto the
   * row, so a later change to the loan product cannot alter this loan.
   */
  async approve(loanId: string, dto: ApproveLoanDto, actor: AdminPrincipal, ip?: string) {
    const loan = await this.loadForDecision(loanId, actor);
    this.assertTransition(loan.status, 'approved');

    const s = await this.settings.current();
    const rateBps = dto.interestRateBps ?? s.interestRateBps;
    const tenureMonths = dto.tenureMonths ?? loan.tenureMonths;

    if (tenureMonths < 1) throw new BadRequestException('tenureMonths must be at least 1');

    const q = quoteLoan(loan.principal, rateBps, tenureMonths, s.processingFeeBps);

    // A schedule must be representable before we promise it to the borrower:
    // every instalment needs to be at least 1 paise.
    if (q.totalPayable < tenureMonths) {
      throw new BadRequestException(
        `A ${tenureMonths}-month schedule cannot be built from ${withRupees(q.totalPayable).display} — reduce the tenure`,
      );
    }

    // Re-check the borrower's standing at decision time, not just at apply time.
    const [customer] = await this.db
      .select({ kycStage: customers.kycStage })
      .from(customers)
      .where(eq(customers.id, loan.customerId))
      .limit(1);
    if (customer && !kycPasses(customer.kycStage)) {
      throw new BadRequestException(
        'This customer\'s KYC is not verified — verify or bypass it before approving a loan',
      );
    }

    const [updated] = await this.db
      .update(loans)
      .set({
        status: 'approved',
        interestRateBps: rateBps,
        tenureMonths,
        totalInterest: q.totalInterest,
        processingFee: q.processingFee,
        totalPayable: q.totalPayable,
        emiAmount: q.emiAmount,
        decidedAt: new Date(),
        decidedById: actor.sub,
        note: dto.note ?? loan.note,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loanId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.LOAN_APPROVED,
      entity: 'loan',
      entityId: loanId,
      before: {
        status: loan.status,
        interestRateBps: loan.interestRateBps,
        tenureMonths: loan.tenureMonths,
        totalPayable: loan.totalPayable,
      },
      after: {
        status: 'approved',
        interestRateBps: rateBps,
        tenureMonths,
        totalInterest: q.totalInterest,
        processingFee: q.processingFee,
        totalPayable: q.totalPayable,
        emiAmount: q.emiAmount,
        note: dto.note ?? null,
      },
      ip,
    });

    await this.notifications.notifyCustomer(loan.customerId, {
      title: 'Loan approved',
      body: `Your loan ${loan.loanNumber} for ${withRupees(loan.principal).display} has been approved. EMI ${withRupees(q.emiAmount).display} × ${tenureMonths} months. Collect the amount at the branch.`,
      category: 'transaction',
    });

    return this.serialize(updated);
  }

  async reject(loanId: string, dto: RejectLoanDto, actor: AdminPrincipal, ip?: string) {
    const loan = await this.loadForDecision(loanId, actor);
    this.assertTransition(loan.status, 'rejected');

    const [updated] = await this.db
      .update(loans)
      .set({
        status: 'rejected',
        rejectionReason: dto.reason,
        decidedAt: new Date(),
        decidedById: actor.sub,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loanId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.LOAN_REJECTED,
      entity: 'loan',
      entityId: loanId,
      before: { status: loan.status },
      after: { status: 'rejected', reason: dto.reason },
      ip,
    });

    await this.notifications.notifyCustomer(loan.customerId, {
      title: 'Loan application declined',
      body: `Your loan application ${loan.loanNumber} was declined. Reason: ${dto.reason}`,
      category: 'transaction',
    });

    return this.serialize(updated);
  }

  // ── admin: disburse (generates the schedule) ───────────────────────────────
  /**
   * Record that the money has been handed over, and generate the full repayment
   * schedule in the same transaction. Everything the borrower owes exists from
   * this moment: `tenureMonths` instalment rows summing to exactly
   * `totalPayable`, and `outstandingPaise` derived from them.
   *
   * The claim is a compare-and-set on `status = 'approved'`, so two concurrent
   * disbursals cannot both generate a schedule (which would double the debt).
   *
   * No ledger entry is posted — see the class comment. The `reference` is the
   * audit trail for the cash or transfer.
   */
  async disburse(loanId: string, dto: DisburseLoanDto, actor: AdminPrincipal, ip?: string) {
    const loan = await this.loadForDecision(loanId, actor);
    this.assertTransition(loan.status, 'disbursed');

    const method = dto.disbursementMethod ?? loan.disbursementMethod;
    const disbursedAt = new Date();
    const amounts = splitInstalments(loan.totalPayable, loan.tenureMonths);
    const firstDueDate = instalmentDueDate(disbursedAt, 1);

    return this.db.transaction(async (tx: AppTransaction) => {
      const claimed = await tx
        .update(loans)
        .set({
          status: 'disbursed',
          disbursementMethod: method,
          reference: dto.reference,
          note: dto.note ?? loan.note,
          disbursedAt,
          firstDueDate,
          outstandingPaise: loan.totalPayable,
          updatedAt: disbursedAt,
        })
        .where(and(eq(loans.id, loanId), eq(loans.status, 'approved')))
        .returning();
      if (claimed.length === 0) {
        throw new BadRequestException('This loan is no longer awaiting disbursal');
      }
      const updated = claimed[0];

      await tx.insert(loanInstalments).values(
        amounts.map((amountDue, idx) => ({
          loanId,
          instalmentNo: idx + 1,
          dueDate: instalmentDueDate(disbursedAt, idx + 1),
          amountDue,
          amountPaid: 0,
          status: 'due' as const,
        })),
      );

      await this.audit.record(
        {
          actorId: actor.sub,
          actorType: 'admin',
          action: AuditAction.LOAN_DISBURSED,
          entity: 'loan',
          entityId: loanId,
          before: { status: 'approved' },
          after: {
            status: 'disbursed',
            disbursementMethod: method,
            reference: dto.reference,
            principal: loan.principal,
            processingFee: loan.processingFee,
            netDisbursed: Math.max(0, loan.principal - loan.processingFee),
            totalPayable: loan.totalPayable,
            instalments: amounts.length,
            firstDueDate,
          },
          ip,
        },
        tx,
      );

      const net = Math.max(0, loan.principal - loan.processingFee);
      await this.notifications.notifyCustomer(
        loan.customerId,
        {
          title: 'Loan disbursed',
          body: `${withRupees(net).display} has been disbursed for loan ${loan.loanNumber}${loan.processingFee > 0 ? ` (after a ${withRupees(loan.processingFee).display} processing fee)` : ''}. Your first EMI of ${withRupees(amounts[0]).display} is due on ${firstDueDate.toLocaleDateString('en-IN')}.`,
          category: 'transaction',
        },
        tx,
      );

      const schedule = await tx
        .select()
        .from(loanInstalments)
        .where(eq(loanInstalments.loanId, loanId))
        .orderBy(asc(loanInstalments.instalmentNo));

      return {
        ...this.serialize(updated),
        netDisbursed: withRupees(net),
        instalments: schedule.map((i) => this.serializeInstalment(i)),
        nextDue: this.nextDueOf(schedule),
      };
    });
  }

  // ── admin: record a repayment ──────────────────────────────────────────────
  /**
   * Apply a payment to the schedule, oldest instalment first — the way a clerk
   * actually takes cash at the counter: clear the earliest arrears, then the
   * current month, and leave any excess as a part-payment against the next one.
   *
   * All in ONE transaction:
   *   1. claim the loan (compare-and-set on `disbursed`) so two clerks cannot
   *      apply the same money twice,
   *   2. allocate across instalments (pure function, validated before any write),
   *   3. for `from_savings`, post the pigmy ledger DEBIT and link its entry id
   *      onto every instalment it settled,
   *   4. write the instalment rows,
   *   5. RECOMPUTE `outstandingPaise` from those rows — never decrement it,
   *   6. close the loan when nothing is left owing.
   *
   * An overpayment is REJECTED rather than absorbed: `allocatePayment` reports
   * what the schedule cannot take, and accepting money with nowhere to post it
   * would leave the books short by exactly that amount.
   */
  async recordRepayment(loanId: string, dto: RecordRepaymentDto, actor: AdminPrincipal, ip?: string) {
    const loan = await this.loadForDecision(loanId, actor);
    if (loan.status !== 'disbursed') {
      throw new BadRequestException(
        `Only a disbursed loan can take repayments — this one is ${loan.status}`,
      );
    }

    const amount = rupeesToPaise(dto.amountRupees);
    if (amount <= 0) throw new BadRequestException('Repayment amount must be positive');

    const paidAt = new Date();

    return this.db.transaction(async (tx: AppTransaction) => {
      // 1. Claim the loan so a concurrent repayment serializes behind this one.
      const claimed = await tx
        .update(loans)
        .set({ updatedAt: paidAt })
        .where(and(eq(loans.id, loanId), eq(loans.status, 'disbursed')))
        .returning();
      if (claimed.length === 0) {
        throw new BadRequestException('This loan is no longer open for repayment');
      }

      const schedule = await tx
        .select()
        .from(loanInstalments)
        .where(eq(loanInstalments.loanId, loanId))
        .orderBy(asc(loanInstalments.instalmentNo));

      // A waived instalment is settled — it must not soak up cash.
      const payable: InstalmentState[] = schedule
        .filter((i) => i.status !== 'waived')
        .map((i) => ({
          id: i.id,
          instalmentNo: i.instalmentNo,
          amountDue: i.amountDue,
          amountPaid: i.amountPaid,
        }));

      // 2. Allocate. Validate the whole thing before writing a single row.
      const { allocations, unapplied } = allocatePayment(payable, amount);
      if (allocations.length === 0) {
        throw new BadRequestException('This loan has nothing outstanding to pay');
      }
      if (unapplied > 0) {
        const owed = outstandingFrom(payable);
        throw new BadRequestException(
          `That is ${withRupees(unapplied).display} more than the ${withRupees(owed).display} outstanding. Collect ${withRupees(owed).display} to close the loan.`,
        );
      }

      // 3. `from_savings` moves real money — post the DEBIT before recording the
      //    instalments, so an insufficient balance aborts the whole transaction
      //    and leaves the schedule untouched.
      let ledgerEntryId: string | null = null;
      let balanceAfter: number | null = null;
      if (dto.method === 'from_savings') {
        const result = await this.ledger.debit(
          loan.pigmyAccountId,
          amount,
          {
            note: `Loan repayment ${loan.loanNumber}${dto.reference ? ` ref ${dto.reference}` : ''}`,
            actorId: actor.sub,
            actorType: 'admin',
            ip,
          },
          tx,
        );
        ledgerEntryId = result.entry.id;
        balanceAfter = result.newBalance;
      }

      // 4. Write each affected instalment. A part-payment keeps its current
      //    status (an overdue instalment stays overdue until fully cleared) and
      //    records no paidAt, which would otherwise read as settled.
      const byId = new Map(schedule.map((i) => [i.id, i]));
      for (const a of allocations) {
        const existing = byId.get(a.id)!;
        await tx
          .update(loanInstalments)
          .set({
            amountPaid: a.amountPaidAfter,
            status: a.settled ? 'paid' : existing.status,
            method: dto.method,
            reference: dto.reference ?? existing.reference,
            ledgerEntryId: ledgerEntryId ?? existing.ledgerEntryId,
            paidAt: a.settled ? paidAt : existing.paidAt,
            recordedById: actor.sub,
          })
          .where(eq(loanInstalments.id, a.id));
      }

      // 5. Recompute the derived outstanding from the post-payment state.
      const applied = new Map(allocations.map((a) => [a.id, a.amountPaidAfter]));
      const after = schedule.map((i) => ({
        amountDue: i.status === 'waived' ? i.amountPaid : i.amountDue,
        amountPaid: applied.get(i.id) ?? i.amountPaid,
      }));
      const outstanding = outstandingFrom(after);
      const closed = outstanding === 0;

      const [finalLoan] = await tx
        .update(loans)
        .set({
          outstandingPaise: outstanding,
          status: closed ? 'closed' : 'disbursed',
          closedAt: closed ? paidAt : null,
          updatedAt: paidAt,
        })
        .where(eq(loans.id, loanId))
        .returning();

      await this.audit.record(
        {
          actorId: actor.sub,
          actorType: 'admin',
          action: AuditAction.LOAN_REPAYMENT_RECORDED,
          entity: 'loan',
          entityId: loanId,
          before: { outstandingPaise: loan.outstandingPaise, status: loan.status },
          after: {
            outstandingPaise: outstanding,
            status: closed ? 'closed' : 'disbursed',
            amount,
            method: dto.method,
            reference: dto.reference ?? null,
            ledgerEntryId,
            instalmentsSettled: allocations.filter((a) => a.settled).map((a) => a.instalmentNo),
            instalmentsPartPaid: allocations.filter((a) => !a.settled).map((a) => a.instalmentNo),
          },
          ip,
        },
        tx,
      );

      if (closed) {
        await this.audit.record(
          {
            actorId: actor.sub,
            actorType: 'admin',
            action: AuditAction.LOAN_CLOSED,
            entity: 'loan',
            entityId: loanId,
            before: { status: 'disbursed' },
            after: { status: 'closed', totalPayable: loan.totalPayable, closedAt: paidAt },
            ip,
          },
          tx,
        );
      }

      await this.notifications.notifyCustomer(
        loan.customerId,
        closed
          ? {
              title: 'Loan closed',
              body: `Your final payment of ${withRupees(amount).display} was received. Loan ${loan.loanNumber} is fully repaid — thank you.`,
              category: 'transaction',
            }
          : {
              title: 'Repayment received',
              body: `${withRupees(amount).display} received against loan ${loan.loanNumber}. ${withRupees(outstanding).display} remains outstanding.`,
              category: 'transaction',
            },
        tx,
      );

      const fresh = await tx
        .select()
        .from(loanInstalments)
        .where(eq(loanInstalments.loanId, loanId))
        .orderBy(asc(loanInstalments.instalmentNo));

      return {
        ...this.serialize(finalLoan),
        applied: withRupees(amount),
        closed,
        savingsBalanceAfter: balanceAfter === null ? null : withRupees(balanceAfter),
        allocations: allocations.map((a) => ({
          instalmentNo: a.instalmentNo,
          applied: withRupees(a.applied),
          settled: a.settled,
        })),
        instalments: fresh.map((i) => this.serializeInstalment(i)),
        nextDue: this.nextDueOf(fresh),
      };
    });
  }

  // ── admin: waive an instalment ─────────────────────────────────────────────
  /**
   * Forgive one instalment without a payment. The row is marked `waived` and its
   * `amountDue` is treated as settled when the outstanding is recomputed — the
   * amount is never silently rewritten, so the schedule still shows what was
   * originally owed and the reason it was let go.
   */
  async waiveInstalment(
    loanId: string,
    instalmentId: string,
    dto: WaiveInstalmentDto,
    actor: AdminPrincipal,
    ip?: string,
  ) {
    const loan = await this.loadForDecision(loanId, actor);
    if (loan.status !== 'disbursed') {
      throw new BadRequestException(
        `Only instalments on a disbursed loan can be waived — this loan is ${loan.status}`,
      );
    }

    const now = new Date();
    return this.db.transaction(async (tx: AppTransaction) => {
      const [inst] = await tx
        .select()
        .from(loanInstalments)
        .where(and(eq(loanInstalments.id, instalmentId), eq(loanInstalments.loanId, loanId)))
        .limit(1);
      if (!inst) throw new NotFoundException('Instalment not found on this loan');
      if (inst.status === 'waived') throw new BadRequestException('This instalment is already waived');
      if (inst.amountPaid >= inst.amountDue) {
        throw new BadRequestException('This instalment is already paid in full');
      }

      await tx
        .update(loanInstalments)
        .set({ status: 'waived', waivedReason: dto.reason, recordedById: actor.sub })
        .where(eq(loanInstalments.id, instalmentId));

      const schedule = await tx
        .select()
        .from(loanInstalments)
        .where(eq(loanInstalments.loanId, loanId))
        .orderBy(asc(loanInstalments.instalmentNo));

      const outstanding = outstandingFrom(
        schedule.map((i) => ({
          amountDue: i.status === 'waived' ? i.amountPaid : i.amountDue,
          amountPaid: i.amountPaid,
        })),
      );
      const closed = outstanding === 0;

      const [updated] = await tx
        .update(loans)
        .set({
          outstandingPaise: outstanding,
          status: closed ? 'closed' : 'disbursed',
          closedAt: closed ? now : null,
          updatedAt: now,
        })
        .where(eq(loans.id, loanId))
        .returning();

      await this.audit.record(
        {
          actorId: actor.sub,
          actorType: 'admin',
          action: AuditAction.LOAN_INSTALMENT_WAIVED,
          entity: 'loan_instalment',
          entityId: instalmentId,
          before: {
            status: inst.status,
            amountDue: inst.amountDue,
            amountPaid: inst.amountPaid,
            loanOutstanding: loan.outstandingPaise,
          },
          after: {
            status: 'waived',
            reason: dto.reason,
            forgiven: inst.amountDue - inst.amountPaid,
            loanId,
            loanOutstanding: outstanding,
            loanClosed: closed,
          },
          ip,
        },
        tx,
      );

      await this.notifications.notifyCustomer(
        loan.customerId,
        {
          title: 'Instalment waived',
          body: `Instalment ${inst.instalmentNo} of loan ${loan.loanNumber} (${withRupees(inst.amountDue - inst.amountPaid).display}) has been waived. Reason: ${dto.reason}`,
          category: 'transaction',
        },
        tx,
      );

      return {
        ...this.serialize(updated),
        closed,
        instalments: schedule.map((i) =>
          this.serializeInstalment(
            i.id === instalmentId ? { ...i, status: 'waived', waivedReason: dto.reason } : i,
          ),
        ),
      };
    });
  }

  // ── admin: write off ───────────────────────────────────────────────────────
  /**
   * Mark a disbursed loan as defaulted. Terminal, and deliberately does NOT
   * touch the instalment rows or the outstanding figure: what is owed remains on
   * the books as owed. The status records that the bank has stopped expecting it.
   */
  async markDefaulted(loanId: string, dto: DefaultLoanDto, actor: AdminPrincipal, ip?: string) {
    const loan = await this.loadForDecision(loanId, actor);
    this.assertTransition(loan.status, 'defaulted');

    const [updated] = await this.db
      .update(loans)
      .set({
        status: 'defaulted',
        note: dto.reason,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loanId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.LOAN_DEFAULTED,
      entity: 'loan',
      entityId: loanId,
      before: { status: loan.status, outstandingPaise: loan.outstandingPaise },
      after: {
        status: 'defaulted',
        outstandingPaise: loan.outstandingPaise,
        writtenOff: loan.outstandingPaise,
        reason: dto.reason,
      },
      ip,
    });

    return this.serialize(updated);
  }

  /** Loan settings passthrough so the admin controller has one dependency. */
  updateSettings(dto: Parameters<LoanSettingsService['update']>[0], actor: AdminPrincipal, ip?: string) {
    return this.settings.update(dto, actor, ip);
  }
}
