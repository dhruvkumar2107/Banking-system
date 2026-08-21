import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import {
  admins,
  customerBankDetails,
  customers,
  ledgerEntries,
  pigmyAccounts,
  villages,
  withdrawalRequests,
} from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { addDays, DEFAULT_SCHEME } from './scheme.service';
import { SchemeService } from './scheme.service';
import { WithdrawalsService } from './withdrawals.service';

/**
 * The withdrawal engine is the only path by which money leaves a pigmy account,
 * so these tests are the contract for maker-checker:
 *
 *   • a customer request never moves money,
 *   • only an approved request can be paid,
 *   • the payout debit and the status flip happen together,
 *   • balances stay ledger-derived,
 *   • an admin can only see/decide requests in their own villages.
 */
describe('WithdrawalsService', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let svc: WithdrawalsService;
  let ledger: LedgerService;
  let scheme: SchemeService;

  let villageAId: string;
  let villageBId: string;
  let customerAId: string;
  let customerBId: string;
  let accountAId: string;
  let accountBId: string;
  let adminA: AdminPrincipal; // scoped to village A
  let superAdmin: AdminPrincipal;

  const balanceOf = async (accountId: string) => {
    const [a] = await db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountId));
    return a;
  };

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const audit = new AuditService(db);
    ledger = new LedgerService(db, audit);
    scheme = new SchemeService(db, audit);
    svc = new WithdrawalsService(db, audit, ledger, new NotificationsService(db, audit), scheme);

    const [va] = await db.insert(villages).values({ name: 'Village A', code: 'VLGA' }).returning();
    const [vb] = await db.insert(villages).values({ name: 'Village B', code: 'VLGB' }).returning();
    villageAId = va.id;
    villageBId = vb.id;

    const [ca] = await db
      .insert(customers)
      .values({ villageId: villageAId, name: 'Asha (A)', mobile: '9000000001' })
      .returning();
    const [cb] = await db
      .insert(customers)
      .values({ villageId: villageBId, name: 'Bhanu (B)', mobile: '9000000002' })
      .returning();
    customerAId = ca.id;
    customerBId = cb.id;

    const [aa] = await db
      .insert(pigmyAccounts)
      .values({ customerId: ca.id, accountNumber: 'PIG-AAAA-1111', dailyAmount: 10_000 })
      .returning();
    const [ab] = await db
      .insert(pigmyAccounts)
      .values({ customerId: cb.id, accountNumber: 'PIG-BBBB-2222', dailyAmount: 10_000 })
      .returning();
    accountAId = aa.id;
    accountBId = ab.id;

    // Fund both accounts through the ledger so balances are derived, not set.
    await ledger.credit(accountAId, 500_000, { note: 'seed deposits' }); // ₹5,000
    await ledger.credit(accountBId, 500_000, { note: 'seed deposits' });

    const [adminRowA] = await db
      .insert(admins)
      .values({
        name: 'Admin A',
        email: 'a@bank.test',
        passwordHash: 'x',
        role: 'admin',
        assignedVillages: [villageAId],
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

    adminA = { sub: adminRowA.id, type: 'admin', role: 'admin', villages: [villageAId] };
    superAdmin = { sub: superRow.id, type: 'admin', role: 'superadmin', villages: [] };
  });

  afterEach(async () => close());

  // ── request creation ──────────────────────────────────────────────────────

  it('creates a pending request without touching the balance', async () => {
    const req = await svc.create(customerAId, { kind: 'partial', amountRupees: 1_000, payoutMethod: 'cash' });

    expect(req.status).toBe('pending');
    expect(req.amount.paise).toBe(100_000);
    expect(req.penalty.paise).toBe(1_000); // 1% early penalty on ₹1,000
    expect(req.interest.paise).toBe(0);
    expect(req.netPayable.paise).toBe(99_000);

    // Nothing moved: no debit, balance untouched.
    expect((await balanceOf(accountAId)).currentBalance).toBe(500_000);
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.pigmyAccountId, accountAId));
    expect(entries.filter((e) => e.type === 'debit')).toHaveLength(0);
  });

  it('rejects a partial withdrawal larger than the balance', async () => {
    await expect(
      svc.create(customerAId, { kind: 'partial', amountRupees: 99_999, payoutMethod: 'cash' }),
    ).rejects.toThrow(/exceeds the available balance/);
  });

  it('requires an amount for a partial withdrawal', async () => {
    await expect(svc.create(customerAId, { kind: 'partial', payoutMethod: 'cash' })).rejects.toThrow(
      /amountRupees is required/,
    );
  });

  it('a closure requests the entire balance', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    expect(req.kind).toBe('closure');
    expect(req.amount.paise).toBe(500_000);
  });

  it('allows only one open request per account', async () => {
    await svc.create(customerAId, { kind: 'partial', amountRupees: 500, payoutMethod: 'cash' });
    await expect(
      svc.create(customerAId, { kind: 'partial', amountRupees: 500, payoutMethod: 'cash' }),
    ).rejects.toThrow(/already exists for this account/);
  });

  it('refuses a bank transfer when no bank details are on file, and stores only the masked number when they are', async () => {
    await expect(
      svc.create(customerAId, { kind: 'partial', amountRupees: 500, payoutMethod: 'bank_transfer' }),
    ).rejects.toThrow(/bank account details/);

    await db.insert(customerBankDetails).values({
      customerId: customerAId,
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234',
      accountHolderName: 'Asha',
    });

    const req = await svc.create(customerAId, {
      kind: 'partial',
      amountRupees: 500,
      payoutMethod: 'bank_transfer',
    });
    expect(req.bankAccountMasked).toBe('XXXX9012');
    expect(req.bankIfsc).toBe('HDFC0001234');
    // The full number must never be copied onto the request row.
    const [raw] = await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.id, req.id));
    expect(JSON.stringify(raw)).not.toContain('123456789012');
  });

  it('refuses to withdraw from another customer’s account', async () => {
    await expect(
      svc.create(customerAId, { accountId: accountBId, kind: 'closure', payoutMethod: 'cash' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses when there is no balance', async () => {
    await ledger.debit(accountAId, 500_000, { note: 'drain' });
    await expect(svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' })).rejects.toThrow(
      /no balance to withdraw/,
    );
  });

  it('blocks early withdrawal when the scheme forbids it', async () => {
    await scheme.update({ earlyWithdrawalAllowed: false }, superAdmin);
    await expect(svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' })).rejects.toThrow(
      /Early withdrawal is not permitted/,
    );
  });

  it('enforces the scheme minimum balance on a partial withdrawal', async () => {
    await scheme.update({ minBalancePaise: 200_000 }, superAdmin); // ₹2,000 must remain
    await expect(
      svc.create(customerAId, { kind: 'partial', amountRupees: 4_000, payoutMethod: 'cash' }),
    ).rejects.toThrow(/minimum balance/);
    // ₹3,000 out of ₹5,000 leaves ₹2,000 — exactly at the floor, so allowed.
    const ok = await svc.create(customerAId, {
      kind: 'partial',
      amountRupees: 3_000,
      payoutMethod: 'cash',
    });
    expect(ok.status).toBe('pending');
  });

  // ── quote ─────────────────────────────────────────────────────────────────

  it('quotes the penalty before the customer commits, without creating a request', async () => {
    const q = await svc.quote(customerAId, accountAId, 'closure');
    expect(q.matured).toBe(false);
    expect(q.penalty.paise).toBe(5_000); // 1% of ₹5,000
    expect(q.interest.paise).toBe(0);
    expect(q.netPayable.paise).toBe(495_000);
    expect(q.earlyWithdrawalAllowed).toBe(true);

    const rows = await db.select().from(withdrawalRequests);
    expect(rows).toHaveLength(0);
  });

  // ── state machine ─────────────────────────────────────────────────────────

  it('walks pending → approved → paid and debits exactly once', async () => {
    const req = await svc.create(customerAId, {
      kind: 'partial',
      amountRupees: 1_000,
      payoutMethod: 'cash',
    });

    const approved = await svc.approve(req.id, {}, adminA);
    expect(approved.status).toBe('approved');
    expect(approved.decidedById).toBe(adminA.sub);
    // Approval alone must not move money.
    expect((await balanceOf(accountAId)).currentBalance).toBe(500_000);

    const paid = await svc.pay(req.id, { reference: 'VCH-001' }, adminA);
    expect(paid.status).toBe('paid');
    expect(paid.reference).toBe('VCH-001');
    // ₹1,000 leaves the account; ₹10 of it is the penalty, so the customer gets ₹990.
    expect(paid.balanceAfter.paise).toBe(400_000);
    expect((await balanceOf(accountAId)).currentBalance).toBe(400_000);

    // The payout and the penalty are separate ledger lines that sum to the gross
    // amount, so the passbook explains itself and can never overdraw.
    const debits = (
      await db.select().from(ledgerEntries).where(eq(ledgerEntries.pigmyAccountId, accountAId))
    ).filter((e) => e.type === 'debit');
    expect(debits).toHaveLength(2);
    expect(debits.map((d) => d.amount).sort((a, b) => a - b)).toEqual([1_000, 99_000]);
    expect(debits.reduce((s, d) => s + d.amount, 0)).toBe(req.amount.paise);

    // total_deposited is never reduced by a withdrawal.
    expect((await balanceOf(accountAId)).totalDeposited).toBe(500_000);
  });

  it('refuses to pay a request that was never approved', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    await expect(svc.pay(req.id, { reference: 'VCH-002' }, adminA)).rejects.toThrow(
      /Cannot move a pending withdrawal request to paid/,
    );
    expect((await balanceOf(accountAId)).currentBalance).toBe(500_000);
  });

  it('refuses to pay the same request twice', async () => {
    const req = await svc.create(customerAId, {
      kind: 'partial',
      amountRupees: 1_000,
      payoutMethod: 'cash',
    });
    await svc.approve(req.id, {}, adminA);
    await svc.pay(req.id, { reference: 'VCH-003' }, adminA);

    await expect(svc.pay(req.id, { reference: 'VCH-003-again' }, adminA)).rejects.toThrow(
      /Cannot move a paid withdrawal request to paid/,
    );
    expect((await balanceOf(accountAId)).currentBalance).toBe(400_000); // debited once
  });

  it('rejects with a mandatory reason and blocks any later transition', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    const rejected = await svc.reject(req.id, { reason: 'KYC pending' }, adminA);
    expect(rejected.status).toBe('rejected');
    expect(rejected.note).toBe('KYC pending');

    await expect(svc.approve(req.id, {}, adminA)).rejects.toThrow(/Cannot move a rejected/);
    expect((await balanceOf(accountAId)).currentBalance).toBe(500_000);
  });

  it('lets a customer cancel their own pending request but not someone else’s', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    await expect(svc.cancel(customerBId, req.id)).rejects.toThrow(ForbiddenException);

    const cancelled = await svc.cancel(customerAId, req.id);
    expect(cancelled.status).toBe('cancelled');
    // A cancelled request frees the account for a fresh one.
    const again = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    expect(again.status).toBe('pending');
  });

  it('cannot cancel once approved', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    await svc.approve(req.id, {}, adminA);
    await expect(svc.cancel(customerAId, req.id)).rejects.toThrow(/Cannot move an? approved/);
  });

  it('refuses approval when the balance dropped below the requested amount', async () => {
    const req = await svc.create(customerAId, {
      kind: 'partial',
      amountRupees: 4_000,
      payoutMethod: 'cash',
    });
    // Something else drained the account after the request was raised.
    await ledger.debit(accountAId, 450_000, { note: 'other debit' });
    await expect(svc.approve(req.id, {}, adminA)).rejects.toThrow(/Balance has changed/);
  });

  // ── closure + maturity interest ───────────────────────────────────────────

  it('closes the account on a paid closure and leaves a zero balance', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    expect(req.amount.paise).toBe(500_000);
    expect(req.penalty.paise).toBe(5_000); // 1% early-exit penalty
    expect(req.netPayable.paise).toBe(495_000); // what the customer actually receives

    await svc.approve(req.id, {}, adminA);
    const paid = await svc.pay(req.id, { reference: 'VCH-CLOSE' }, adminA);

    expect(paid.accountClosed).toBe(true);
    expect(paid.balanceAfter.paise).toBe(0);

    const acct = await balanceOf(accountAId);
    expect(acct.status).toBe('closed');
    expect(acct.closedAt).not.toBeNull();
    // The full ₹5,000 left the account: ₹4,950 to the customer + ₹50 penalty.
    expect(acct.currentBalance).toBe(0);
    expect(acct.totalDeposited).toBe(500_000); // never reduced

    const debits = (
      await db.select().from(ledgerEntries).where(eq(ledgerEntries.pigmyAccountId, accountAId))
    ).filter((e) => e.type === 'debit');
    expect(debits.reduce((s, d) => s + d.amount, 0)).toBe(500_000);
  });

  it('credits maturity interest as its own ledger line and pays it out with no penalty', async () => {
    // Backdate the account so it is matured: opened termDays+5 ago.
    const openedAt = addDays(new Date(), -(DEFAULT_SCHEME.termDays + 5));
    await db
      .update(pigmyAccounts)
      .set({
        createdAt: openedAt,
        maturityDate: addDays(openedAt, DEFAULT_SCHEME.termDays),
      })
      .where(eq(pigmyAccounts.id, accountAId));

    const q = await svc.quote(customerAId, accountAId, 'closure');
    expect(q.matured).toBe(true);
    expect(q.penalty.paise).toBe(0); // no penalty at maturity
    expect(q.interest.paise).toBe(20_000); // ₹5,000 @ 4% for 365 days = ₹200

    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    expect(req.interest.paise).toBe(20_000);
    expect(req.penalty.paise).toBe(0);
    expect(req.netPayable.paise).toBe(520_000); // ₹5,200

    await svc.approve(req.id, {}, adminA);
    const paid = await svc.pay(req.id, { reference: 'VCH-MAT' }, adminA);

    expect(paid.status).toBe('paid');
    const acct = await balanceOf(accountAId);
    expect(acct.status).toBe('closed');
    expect(acct.currentBalance).toBe(20_000); // interest credited, principal paid out
    expect(acct.interestCreditedAt).not.toBeNull();

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.pigmyAccountId, accountAId));
    const interestLine = entries.find((e) => e.note?.includes('Maturity interest'));
    expect(interestLine).toBeDefined();
    expect(interestLine!.type).toBe('credit');
    expect(interestLine!.amount).toBe(20_000);
    // Quotes the rate SNAPSHOTTED on the account, not today's scheme.
    expect(interestLine!.note).toContain('4% p.a.');
  });

  it('does not credit interest twice for the same account', async () => {
    const openedAt = addDays(new Date(), -(DEFAULT_SCHEME.termDays + 5));
    await db
      .update(pigmyAccounts)
      .set({
        createdAt: openedAt,
        maturityDate: addDays(openedAt, DEFAULT_SCHEME.termDays),
        interestCreditedAt: new Date(),
      })
      .where(eq(pigmyAccounts.id, accountAId));

    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    expect(req.interest.paise).toBe(0);
  });

  it('keeps an existing account on the terms it was opened with after a scheme change', async () => {
    await scheme.update({ interestRateBps: 900 }, superAdmin); // bank raises the rate to 9%
    const acct = await balanceOf(accountAId);
    expect(acct.interestRateBps).toBe(DEFAULT_SCHEME.interestRateBps); // unchanged
  });

  // ── admin queue + village isolation ───────────────────────────────────────

  it('scopes the admin queue to the admin’s own villages', async () => {
    await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    await svc.create(customerBId, { kind: 'closure', payoutMethod: 'cash' });

    const forA = await svc.listForAdmin(adminA, { page: 1, limit: 20 });
    expect(forA.total).toBe(1);
    expect(forA.rows[0].customer.name).toBe('Asha (A)');

    const forSuper = await svc.listForAdmin(superAdmin, { page: 1, limit: 20 });
    expect(forSuper.total).toBe(2);

    expect(await svc.pendingCount(adminA)).toEqual({ pending: 1 });
    expect(await svc.pendingCount(superAdmin)).toEqual({ pending: 2 });
  });

  it('refuses to read, approve, reject or pay a request from another village', async () => {
    const foreign = await svc.create(customerBId, { kind: 'closure', payoutMethod: 'cash' });

    await expect(svc.getForAdmin(foreign.id, adminA)).rejects.toThrow(ForbiddenException);
    await expect(svc.approve(foreign.id, {}, adminA)).rejects.toThrow(ForbiddenException);
    await expect(svc.reject(foreign.id, { reason: 'no' }, adminA)).rejects.toThrow(ForbiddenException);
    await expect(svc.pay(foreign.id, { reference: 'X' }, adminA)).rejects.toThrow(ForbiddenException);

    // Untouched by the failed attempts.
    expect((await balanceOf(accountBId)).currentBalance).toBe(500_000);
  });

  it('filters the queue by status and returns the requester’s own list', async () => {
    const a = await svc.create(customerAId, {
      kind: 'partial',
      amountRupees: 1_000,
      payoutMethod: 'cash',
    });
    await svc.approve(a.id, {}, adminA);

    const pending = await svc.listForAdmin(adminA, { page: 1, limit: 20, status: 'pending' });
    expect(pending.total).toBe(0);
    const approved = await svc.listForAdmin(adminA, { page: 1, limit: 20, status: 'approved' });
    expect(approved.total).toBe(1);

    const mine = await svc.listForCustomer(customerAId, 1, 20);
    expect(mine.total).toBe(1);
    expect(mine.rows[0].id).toBe(a.id);

    const theirs = await svc.listForCustomer(customerBId, 1, 20);
    expect(theirs.total).toBe(0);
  });

  it('exposes the account’s maturity state to the approver', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    const detail = await svc.getForAdmin(req.id, adminA);
    expect(detail.account.accountNumber).toBe('PIG-AAAA-1111');
    expect(detail.account.matured).toBe(false);
    expect(detail.account.termDays).toBe(DEFAULT_SCHEME.termDays);
    expect(detail.account.interestRatePercent).toBe(4);
    expect(detail.village.id).toBe(villageAId);
  });

  it('throws BadRequestException (not a 500) for an invalid transition', async () => {
    const req = await svc.create(customerAId, { kind: 'closure', payoutMethod: 'cash' });
    await svc.reject(req.id, { reason: 'nope' }, adminA);
    await expect(svc.pay(req.id, { reference: 'X' }, adminA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
