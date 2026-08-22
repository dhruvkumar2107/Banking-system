import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import {
  admins,
  customers,
  ledgerEntries,
  loanInstalments,
  loans,
  pigmyAccounts,
  villages,
} from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { LoanSettingsService } from './loan-settings.service';
import { LoansService } from './loans.service';

/**
 * The loan engine decides who may borrow and how much money comes back, so
 * these tests are its contract:
 *
 *   • an unverified customer cannot borrow at all,
 *   • an application never moves money — only disbursal starts a schedule,
 *   • the generated instalments sum to exactly the total payable,
 *   • `outstandingPaise` stays DERIVED from the instalment rows,
 *   • a `from_savings` repayment and its ledger debit succeed or fail together,
 *   • a loan closes at exactly zero and can never be overpaid,
 *   • an admin can only see and decide loans in their own villages.
 *
 * Everything is integer paise. A ₹6,000 / 6-month loan at the default 12% flat
 * divides evenly (EMI ₹1,060), and a ₹1,000 / 3-month one deliberately does not
 * — that pair covers both the clean and the remainder-absorbing split.
 */
describe('LoansService', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let svc: LoansService;
  let ledger: LedgerService;
  let settings: LoanSettingsService;

  let villageAId: string;
  let villageBId: string;
  let customerAId: string; // verified, village A, ₹5,000 saved
  let customerBId: string; // verified, village B, ₹600 saved
  let customerUId: string; // KYC not started, village A, ₹5,000 saved
  let accountAId: string;
  let accountBId: string;
  let adminB: AdminPrincipal; // scoped to village B only
  let superAdmin: AdminPrincipal;

  /** ₹6,000 over 6 months at 12% flat + 1% fee — every figure divides cleanly. */
  const LOAN = { amountRupees: 6_000, tenureMonths: 6 };
  const PRINCIPAL = 600_000;
  const TOTAL_INTEREST = 36_000; // 600000 × 1200 × 6 / (10000 × 12)
  const PROCESSING_FEE = 6_000; // 1.00% of principal
  const TOTAL_PAYABLE = 636_000;
  const EMI = 106_000;

  const accountRow = async (accountId: string) => {
    const [a] = await db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountId));
    return a;
  };

  const loanRow = async (loanId: string) => {
    const [l] = await db.select().from(loans).where(eq(loans.id, loanId));
    return l;
  };

  const scheduleOf = async (loanId: string) =>
    db
      .select()
      .from(loanInstalments)
      .where(eq(loanInstalments.loanId, loanId))
      .orderBy(asc(loanInstalments.instalmentNo));

  const ledgerCount = async (accountId: string) =>
    (await db.select().from(ledgerEntries).where(eq(ledgerEntries.pigmyAccountId, accountId)))
      .length;

  /** apply → approve → disburse, the state every repayment test starts from. */
  const disbursed = async (
    customerId = customerAId,
    dto: { amountRupees: number; tenureMonths: number } = LOAN,
  ) => {
    const applied = await svc.apply(customerId, dto);
    await svc.approve(applied.id, {}, superAdmin);
    return svc.disburse(applied.id, { reference: `UTR-${applied.loanNumber}` }, superAdmin);
  };

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const audit = new AuditService(db);
    ledger = new LedgerService(db, audit);
    settings = new LoanSettingsService(db, audit);
    svc = new LoansService(db, audit, ledger, new NotificationsService(db, audit), settings);

    const [va] = await db.insert(villages).values({ name: 'Village A', code: 'VLGA' }).returning();
    const [vb] = await db.insert(villages).values({ name: 'Village B', code: 'VLGB' }).returning();
    villageAId = va.id;
    villageBId = vb.id;

    const [ca] = await db
      .insert(customers)
      .values({
        villageId: villageAId,
        name: 'Asha (verified)',
        mobile: '9000000001',
        kycStage: 'verified',
      })
      .returning();
    const [cb] = await db
      .insert(customers)
      .values({
        villageId: villageBId,
        name: 'Bhanu (verified, thin savings)',
        mobile: '9000000002',
        kycStage: 'verified',
      })
      .returning();
    const [cu] = await db
      .insert(customers)
      .values({ villageId: villageAId, name: 'Uma (no KYC)', mobile: '9000000003' })
      .returning();
    customerAId = ca.id;
    customerBId = cb.id;
    customerUId = cu.id;

    const [aa] = await db
      .insert(pigmyAccounts)
      .values({ customerId: ca.id, accountNumber: 'PIG-AAAA-1111', dailyAmount: 10_000 })
      .returning();
    const [ab] = await db
      .insert(pigmyAccounts)
      .values({ customerId: cb.id, accountNumber: 'PIG-BBBB-2222', dailyAmount: 10_000 })
      .returning();
    const [au] = await db
      .insert(pigmyAccounts)
      .values({ customerId: cu.id, accountNumber: 'PIG-UUUU-3333', dailyAmount: 10_000 })
      .returning();
    accountAId = aa.id;
    accountBId = ab.id;

    // Fund through the ledger so balances are derived, never assigned.
    await ledger.credit(accountAId, 500_000, { note: 'seed deposits' }); // ₹5,000
    await ledger.credit(accountBId, 60_000, { note: 'seed deposits' }); // ₹600
    await ledger.credit(au.id, 500_000, { note: 'seed deposits' }); // ₹5,000

    const [adminRowB] = await db
      .insert(admins)
      .values({
        name: 'Admin B',
        email: 'b@bank.test',
        passwordHash: 'x',
        role: 'admin',
        assignedVillages: [villageBId],
      })
      .returning();
    const [superRow] = await db
      .insert(admins)
      .values({
        name: 'Super',
        email: 'super@bank.test',
        passwordHash: 'x',
        role: 'superadmin',
        assignedVillages: [],
      })
      .returning();

    adminB = { sub: adminRowB.id, type: 'admin', role: 'admin', villages: [villageBId] };
    superAdmin = { sub: superRow.id, type: 'admin', role: 'superadmin', villages: [] };
  });

  afterEach(async () => close());

  // ── eligibility ───────────────────────────────────────────────────────────

  describe('eligibility', () => {
    it('refuses a customer whose KYC is not verified', async () => {
      const q = await svc.quote(customerUId, undefined, 6_000, 6);
      expect(q.eligible).toBe(false);
      expect(q.reasons.join(' ')).toMatch(/KYC/i);

      await expect(svc.apply(customerUId, LOAN)).rejects.toThrow(BadRequestException);
      expect(await db.select().from(loans)).toHaveLength(0);
    });

    it('lets a verified customer with enough savings through', async () => {
      const q = await svc.quote(customerAId, undefined, 6_000, 6);
      expect(q.eligible).toBe(true);
      expect(q.reasons).toEqual([]);
      expect(q.savingsBalance.paise).toBe(500_000);
      expect(q.maxEligible.paise).toBe(1_000_000); // 2× savings
    });

    it('quotes the flat-rate figures without creating anything', async () => {
      const { quote } = await svc.quote(customerAId, undefined, 6_000, 6);
      expect(quote.principal.paise).toBe(PRINCIPAL);
      expect(quote.totalInterest.paise).toBe(TOTAL_INTEREST);
      expect(quote.processingFee.paise).toBe(PROCESSING_FEE);
      expect(quote.totalPayable.paise).toBe(TOTAL_PAYABLE);
      expect(quote.emiAmount.paise).toBe(EMI);
      expect(quote.netDisbursed.paise).toBe(PRINCIPAL - PROCESSING_FEE);
      expect(await db.select().from(loans)).toHaveLength(0);
    });

    it('reports every blocking reason at once rather than one per attempt', async () => {
      // Over the ceiling AND over the max amount AND past the tenure cap.
      const q = await svc.quote(customerBId, undefined, 90_000, 60);
      expect(q.eligible).toBe(false);
      expect(q.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it('caps borrowing at the savings multiple', async () => {
      // Bhanu has ₹600, so the ceiling is ₹1,200 — ₹2,000 must be refused.
      const q = await svc.quote(customerBId, undefined, 2_000, 3);
      expect(q.eligible).toBe(false);
      expect(q.reasons.join(' ')).toMatch(/borrow up to/i);
    });

    it('refuses everyone when lending is switched off', async () => {
      await settings.update({ enabled: false }, superAdmin);
      const q = await svc.quote(customerAId, undefined, 6_000, 6);
      expect(q.eligible).toBe(false);
      expect(q.reasons.join(' ')).toMatch(/not being offered/i);
      await expect(svc.apply(customerAId, LOAN)).rejects.toThrow(BadRequestException);
    });

    it('allows only one live loan at a time', async () => {
      await svc.apply(customerAId, LOAN);
      await expect(svc.apply(customerAId, LOAN)).rejects.toThrow(BadRequestException);
      expect(await db.select().from(loans)).toHaveLength(1);
    });
  });

  // ── application ───────────────────────────────────────────────────────────

  describe('apply', () => {
    it('creates a pending loan that owes nothing and moves no money', async () => {
      const before = await accountRow(accountAId);
      const loan = await svc.apply(customerAId, { ...LOAN, purpose: 'Seeds and fertiliser' });

      expect(loan.status).toBe('pending');
      expect(loan.loanNumber).toMatch(/^LN\d+$/);
      expect(loan.principal.paise).toBe(PRINCIPAL);
      expect(loan.totalPayable.paise).toBe(TOTAL_PAYABLE);
      expect(loan.emiAmount.paise).toBe(EMI);
      expect(loan.purpose).toBe('Seeds and fertiliser');
      // Nothing is owed until the cash is actually handed over.
      expect(loan.outstanding.paise).toBe(0);

      const after = await accountRow(accountAId);
      expect(after.currentBalance).toBe(before.currentBalance);
      expect(await scheduleOf(loan.id)).toHaveLength(0);
      expect(await ledgerCount(accountAId)).toBe(1); // just the seed deposit
    });

    it('gives each loan a distinct loan number', async () => {
      const a = await svc.apply(customerAId, LOAN);
      await svc.cancel(customerAId, a.id);
      const b = await svc.apply(customerAId, LOAN);
      expect(b.loanNumber).not.toBe(a.loanNumber);
    });
  });

  // ── state machine ─────────────────────────────────────────────────────────

  describe('state machine', () => {
    it('will not disburse a loan that was never approved', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await expect(
        svc.disburse(loan.id, { reference: 'UTR-1' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
      expect((await loanRow(loan.id)).status).toBe('pending');
    });

    it('will not approve the same loan twice', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await svc.approve(loan.id, {}, superAdmin);
      await expect(svc.approve(loan.id, {}, superAdmin)).rejects.toThrow(BadRequestException);
    });

    it('will not take a repayment before the money has been disbursed', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await svc.approve(loan.id, {}, superAdmin);
      await expect(
        svc.recordRepayment(loan.id, { amountRupees: 1_060, method: 'cash' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
      expect(await scheduleOf(loan.id)).toHaveLength(0);
    });

    it('will not reject a loan that has already been disbursed', async () => {
      const loan = await disbursed();
      await expect(
        svc.reject(loan.id, { reason: 'changed our mind' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets a customer cancel their own pending application', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      const cancelled = await svc.cancel(customerAId, loan.id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('will not let one customer cancel another customer’s loan', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await expect(svc.cancel(customerBId, loan.id)).rejects.toThrow();
      expect((await loanRow(loan.id)).status).toBe('pending');
    });
  });

  // ── approval terms ────────────────────────────────────────────────────────

  describe('approve', () => {
    it('snapshots the quoted terms onto the loan', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      const approved = await svc.approve(loan.id, {}, superAdmin);
      expect(approved.status).toBe('approved');
      expect(approved.interestRateBps).toBe(1_200);
      expect(approved.totalPayable.paise).toBe(TOTAL_PAYABLE);
      expect(approved.decidedById).toBe(superAdmin.sub);
    });

    it('recomputes the schedule figures when the admin overrides the rate', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      const approved = await svc.approve(loan.id, { interestRateBps: 600 }, superAdmin);
      // Half the rate ⇒ half the flat interest.
      expect(approved.interestRateBps).toBe(600);
      expect(approved.totalInterest.paise).toBe(TOTAL_INTEREST / 2);
      expect(approved.totalPayable.paise).toBe(PRINCIPAL + TOTAL_INTEREST / 2);
    });

    it('recomputes when the admin shortens the tenure', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      const approved = await svc.approve(loan.id, { tenureMonths: 3 }, superAdmin);
      expect(approved.tenureMonths).toBe(3);
      expect(approved.totalInterest.paise).toBe(TOTAL_INTEREST / 2); // half the months
      await svc.disburse(approved.id, { reference: 'UTR-SHORT' }, superAdmin);
      expect(await scheduleOf(loan.id)).toHaveLength(3);
    });

    it('records the reason on a rejection', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      const rejected = await svc.reject(loan.id, { reason: 'Existing arrears' }, superAdmin);
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Existing arrears');
    });
  });

  // ── disbursal ─────────────────────────────────────────────────────────────

  describe('disburse', () => {
    it('generates a schedule that sums to exactly the total payable', async () => {
      const loan = await disbursed();
      const schedule = await scheduleOf(loan.id);

      expect(schedule).toHaveLength(6);
      expect(schedule.reduce((sum, i) => sum + i.amountDue, 0)).toBe(TOTAL_PAYABLE);
      expect(schedule.every((i) => i.amountDue === EMI)).toBe(true);
      expect(schedule.every((i) => i.status === 'due' && i.amountPaid === 0)).toBe(true);
      expect(schedule.map((i) => i.instalmentNo)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('puts the last rupee on the final instalment when the split is uneven', async () => {
      // ₹1,000 over 3 months ⇒ ₹1,030 payable, which does not divide by 3.
      const loan = await disbursed(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      const schedule = await scheduleOf(loan.id);

      expect(schedule.map((i) => i.amountDue)).toEqual([34_333, 34_333, 34_334]);
      expect(schedule.reduce((sum, i) => sum + i.amountDue, 0)).toBe(103_000);
      expect(loan.totalPayable.paise).toBe(103_000);
    });

    it('sets outstanding to the full payable and dates the instalments monthly', async () => {
      const loan = await disbursed();
      expect(loan.status).toBe('disbursed');
      expect(loan.outstanding.paise).toBe(TOTAL_PAYABLE);
      expect(loan.totalRepaid.paise).toBe(0);
      expect((await loanRow(loan.id)).outstandingPaise).toBe(TOTAL_PAYABLE);

      const schedule = await scheduleOf(loan.id);
      const months = schedule.map((i) => i.dueDate.getUTCMonth());
      expect(new Set(months).size).toBe(6); // six distinct months, one per instalment
      for (let i = 1; i < schedule.length; i += 1) {
        expect(schedule[i].dueDate.getTime()).toBeGreaterThan(schedule[i - 1].dueDate.getTime());
      }
    });

    it('does not credit the savings ledger — disbursal is off-ledger', async () => {
      const before = await accountRow(accountAId);
      const loan = await disbursed();
      const after = await accountRow(accountAId);

      // The pigmy ledger tracks savings, not borrowings: handing over loan cash
      // must not look like a deposit.
      expect(after.currentBalance).toBe(before.currentBalance);
      expect(after.totalDeposited).toBe(before.totalDeposited);
      expect(await ledgerCount(accountAId)).toBe(1);
      expect(loan.reference).toBe(`UTR-${loan.loanNumber}`);
    });
  });

  // ── repayment ─────────────────────────────────────────────────────────────

  describe('recordRepayment', () => {
    it('applies a cash EMI to the oldest instalment and leaves savings alone', async () => {
      const loan = await disbursed();
      const before = await accountRow(accountAId);

      const after = await svc.recordRepayment(
        loan.id,
        { amountRupees: 1_060, method: 'cash', reference: 'RCPT-1' },
        superAdmin,
      );

      expect(after.outstanding.paise).toBe(TOTAL_PAYABLE - EMI);
      expect(after.totalRepaid.paise).toBe(EMI);

      const schedule = await scheduleOf(loan.id);
      expect(schedule[0].status).toBe('paid');
      expect(schedule[0].amountPaid).toBe(EMI);
      expect(schedule[0].method).toBe('cash');
      expect(schedule[0].reference).toBe('RCPT-1');
      expect(schedule[1].status).toBe('due');
      expect(schedule[1].amountPaid).toBe(0);

      // Cash never touches the pigmy ledger.
      const acct = await accountRow(accountAId);
      expect(acct.currentBalance).toBe(before.currentBalance);
      expect(await ledgerCount(accountAId)).toBe(1);
    });

    it('spreads one payment across several instalments, oldest first', async () => {
      const loan = await disbursed();
      // Two and a half EMIs.
      const after = await svc.recordRepayment(
        loan.id,
        { amountRupees: 2_650, method: 'cash' },
        superAdmin,
      );

      const schedule = await scheduleOf(loan.id);
      expect(schedule[0].status).toBe('paid');
      expect(schedule[1].status).toBe('paid');
      expect(schedule[2].status).toBe('due');
      expect(schedule[2].amountPaid).toBe(EMI / 2); // the half
      expect(after.outstanding.paise).toBe(TOTAL_PAYABLE - 265_000);
    });

    it('debits the pigmy ledger for a from_savings repayment', async () => {
      const loan = await disbursed();
      const before = await accountRow(accountAId);

      await svc.recordRepayment(loan.id, { amountRupees: 1_060, method: 'from_savings' }, superAdmin);

      const after = await accountRow(accountAId);
      expect(after.currentBalance).toBe(before.currentBalance - EMI);
      // Savings withdrawn to service a loan is not a reduction in what was ever
      // deposited, so the lifetime figure must not move.
      expect(after.totalDeposited).toBe(before.totalDeposited);
      expect(await ledgerCount(accountAId)).toBe(2);

      const schedule = await scheduleOf(loan.id);
      expect(schedule[0].method).toBe('from_savings');
      expect(schedule[0].ledgerEntryId).toBeTruthy();
    });

    it('aborts the whole repayment when savings cannot cover it', async () => {
      // Bhanu owes ₹1,030 but has only ₹600 saved.
      const loan = await disbursed(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      const before = await accountRow(accountBId);

      await expect(
        svc.recordRepayment(loan.id, { amountRupees: 700, method: 'from_savings' }, superAdmin),
      ).rejects.toThrow();

      // The debit and the instalment writes share a transaction: neither happened.
      const after = await accountRow(accountBId);
      expect(after.currentBalance).toBe(before.currentBalance);
      expect(await ledgerCount(accountBId)).toBe(1);
      const schedule = await scheduleOf(loan.id);
      expect(schedule.every((i) => i.amountPaid === 0 && i.status === 'due')).toBe(true);
      expect((await loanRow(loan.id)).outstandingPaise).toBe(103_000);
    });

    it('refuses to take more than is outstanding', async () => {
      const loan = await disbursed();
      await expect(
        svc.recordRepayment(loan.id, { amountRupees: 7_000, method: 'cash' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
      // Nothing partially applied.
      const schedule = await scheduleOf(loan.id);
      expect(schedule.every((i) => i.amountPaid === 0)).toBe(true);
      expect((await loanRow(loan.id)).outstandingPaise).toBe(TOTAL_PAYABLE);
    });

    it('closes the loan at exactly zero when the last EMI lands', async () => {
      const loan = await disbursed();
      for (let i = 0; i < 6; i += 1) {
        await svc.recordRepayment(loan.id, { amountRupees: 1_060, method: 'cash' }, superAdmin);
      }

      const row = await loanRow(loan.id);
      expect(row.outstandingPaise).toBe(0);
      expect(row.status).toBe('closed');
      expect(row.closedAt).toBeTruthy();

      const schedule = await scheduleOf(loan.id);
      expect(schedule.every((i) => i.status === 'paid')).toBe(true);
      expect(schedule.reduce((sum, i) => sum + i.amountPaid, 0)).toBe(TOTAL_PAYABLE);
    });

    it('closes cleanly on an uneven schedule too', async () => {
      const loan = await disbursed(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      await svc.recordRepayment(loan.id, { amountRupees: 1_030, method: 'cash' }, superAdmin);

      const row = await loanRow(loan.id);
      expect(row.outstandingPaise).toBe(0);
      expect(row.status).toBe('closed');
    });

    it('will not accept a repayment on a closed loan', async () => {
      const loan = await disbursed(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      await svc.recordRepayment(loan.id, { amountRupees: 1_030, method: 'cash' }, superAdmin);
      await expect(
        svc.recordRepayment(loan.id, { amountRupees: 100, method: 'cash' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('frees the customer to borrow again once the loan is closed', async () => {
      const loan = await disbursed();
      for (let i = 0; i < 6; i += 1) {
        await svc.recordRepayment(loan.id, { amountRupees: 1_060, method: 'cash' }, superAdmin);
      }
      // The "one live loan" rule counts pending/approved/disbursed only.
      const next = await svc.apply(customerAId, LOAN);
      expect(next.status).toBe('pending');
    });
  });

  // ── waive and default ─────────────────────────────────────────────────────

  describe('waive and default', () => {
    it('drops outstanding by the waived instalment without moving money', async () => {
      const loan = await disbursed();
      const schedule = await scheduleOf(loan.id);
      const before = await accountRow(accountAId);

      await svc.waiveInstalment(
        loan.id,
        schedule[0].id,
        { reason: 'Flood relief' },
        superAdmin,
      );

      const row = await loanRow(loan.id);
      expect(row.outstandingPaise).toBe(TOTAL_PAYABLE - EMI);
      const after = await scheduleOf(loan.id);
      expect(after[0].status).toBe('waived');
      expect(after[0].waivedReason).toBe('Flood relief');
      expect(after[0].amountPaid).toBe(0); // forgiven, not paid

      const acct = await accountRow(accountAId);
      expect(acct.currentBalance).toBe(before.currentBalance);
      expect(await ledgerCount(accountAId)).toBe(1);
    });

    it('does not let a later payment soak into a waived instalment', async () => {
      const loan = await disbursed();
      const schedule = await scheduleOf(loan.id);
      await svc.waiveInstalment(loan.id, schedule[0].id, { reason: 'Flood relief' }, superAdmin);

      await svc.recordRepayment(loan.id, { amountRupees: 1_060, method: 'cash' }, superAdmin);

      const after = await scheduleOf(loan.id);
      expect(after[0].status).toBe('waived');
      expect(after[0].amountPaid).toBe(0);
      // The cash went to instalment 2, the oldest one still payable.
      expect(after[1].status).toBe('paid');
      expect(after[1].amountPaid).toBe(EMI);
    });

    it('closes the loan when a waiver clears the last of the balance', async () => {
      const loan = await disbursed(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      for (const inst of await scheduleOf(loan.id)) {
        await svc.waiveInstalment(loan.id, inst.id, { reason: 'Written off by branch' }, superAdmin);
      }
      const row = await loanRow(loan.id);
      expect(row.outstandingPaise).toBe(0);
      expect(row.status).toBe('closed');
    });

    it('marks a disbursed loan as defaulted with a reason', async () => {
      const loan = await disbursed();
      const out = await svc.markDefaulted(
        loan.id,
        { reason: 'Untraceable for nine months' },
        superAdmin,
      );
      expect(out.status).toBe('defaulted');
      expect((await loanRow(loan.id)).status).toBe('defaulted');
    });

    it('will not default a loan that was never disbursed', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await expect(
        svc.markDefaulted(loan.id, { reason: 'Never collected the money' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── village isolation ─────────────────────────────────────────────────────

  describe('village scoping', () => {
    it('hides a loan from an admin outside its village', async () => {
      const loan = await svc.apply(customerAId, LOAN); // village A
      await expect(svc.getForAdmin(loan.id, adminB)).rejects.toThrow(ForbiddenException);
    });

    it('lets a superadmin see any village', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      const seen = await svc.getForAdmin(loan.id, superAdmin);
      expect(seen.id).toBe(loan.id);
    });

    it('will not let an out-of-village admin approve', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await expect(svc.approve(loan.id, {}, adminB)).rejects.toThrow(ForbiddenException);
      expect((await loanRow(loan.id)).status).toBe('pending');
    });

    it('lists only the loans an admin is scoped to', async () => {
      await svc.apply(customerAId, LOAN); // village A
      await svc.apply(customerBId, { amountRupees: 1_000, tenureMonths: 3 }); // village B

      const bList = await svc.listForAdmin(adminB, { page: 1, limit: 20 });
      expect(bList.total).toBe(1);
      expect(bList.rows[0].customerId).toBe(customerBId);

      const allList = await svc.listForAdmin(superAdmin, { page: 1, limit: 20 });
      expect(allList.total).toBe(2);
    });

    it('counts only in-scope applications for the sidebar badge', async () => {
      await svc.apply(customerAId, LOAN);
      await svc.apply(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      expect((await svc.pendingCount(adminB)).pending).toBe(1);
      expect((await svc.pendingCount(superAdmin)).pending).toBe(2);
    });
  });

  // ── customer views ────────────────────────────────────────────────────────

  describe('customer views', () => {
    it('returns the schedule and the next instalment due', async () => {
      const loan = await disbursed();
      await svc.recordRepayment(loan.id, { amountRupees: 1_060, method: 'cash' }, superAdmin);

      const view = await svc.getForCustomer(customerAId, loan.id);
      expect(view.instalments).toHaveLength(6);
      expect(view.nextDue?.instalmentNo).toBe(2);
      expect(view.outstanding.paise).toBe(TOTAL_PAYABLE - EMI);
    });

    it('reports no next instalment once everything is settled', async () => {
      const loan = await disbursed(customerBId, { amountRupees: 1_000, tenureMonths: 3 });
      await svc.recordRepayment(loan.id, { amountRupees: 1_030, method: 'cash' }, superAdmin);
      const view = await svc.getForCustomer(customerBId, loan.id);
      expect(view.nextDue).toBeNull();
    });

    it('will not show one customer another customer’s loan', async () => {
      const loan = await svc.apply(customerAId, LOAN);
      await expect(svc.getForCustomer(customerBId, loan.id)).rejects.toThrow();
    });
  });
});
