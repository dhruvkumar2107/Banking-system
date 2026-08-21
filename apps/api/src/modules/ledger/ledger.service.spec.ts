import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import { customers, ledgerEntries, pigmyAccounts, transactions, villages } from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from './ledger.service';

/**
 * The ledger engine is tested in isolation (per the build plan) against a real
 * embedded Postgres. These tests are the contract for the golden rule.
 */
describe('LedgerService', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let ledger: LedgerService;
  let accountId: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    ledger = new LedgerService(db, new AuditService(db));

    const [v] = await db.insert(villages).values({ name: 'Village A', code: 'VLGA' }).returning();
    const [c] = await db
      .insert(customers)
      .values({ villageId: v.id, name: 'Rahul', mobile: '9000000001' })
      .returning();
    const [a] = await db
      .insert(pigmyAccounts)
      .values({ customerId: c.id, accountNumber: 'PIG-TEST-1', dailyAmount: 10000 })
      .returning();
    accountId = a.id;
  });

  afterEach(async () => close());

  const balance = async () => {
    const [acct] = await db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountId));
    return acct;
  };

  it('credits and updates the derived balance + total deposited', async () => {
    const r = await ledger.credit(accountId, 10000, { note: 'day 1' });
    expect(r.previousBalance).toBe(0);
    expect(r.newBalance).toBe(10000);
    expect(r.idempotentHit).toBe(false);

    const acct = await balance();
    expect(acct.currentBalance).toBe(10000);
    expect(acct.totalDeposited).toBe(10000);
  });

  it('records previous/new balance on every entry and keeps a running chain', async () => {
    await ledger.credit(accountId, 10000);
    await ledger.credit(accountId, 5000);
    await ledger.credit(accountId, 2500);

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.pigmyAccountId, accountId))
      .orderBy(ledgerEntries.createdAt);

    expect(entries.map((e) => [e.previousBalance, e.newBalance])).toEqual([
      [0, 10000],
      [10000, 15000],
      [15000, 17500],
    ]);
    expect((await balance()).currentBalance).toBe(17500);
  });

  it('is idempotent per transactionId (no double credit on webhook retry)', async () => {
    const [txn] = await db
      .insert(transactions)
      .values({ pigmyAccountId: accountId, amount: 10000, status: 'success' })
      .returning();

    const first = await ledger.credit(accountId, 10000, { transactionId: txn.id });
    const second = await ledger.credit(accountId, 10000, { transactionId: txn.id });

    expect(first.idempotentHit).toBe(false);
    expect(second.idempotentHit).toBe(true);
    expect(second.newBalance).toBe(first.newBalance);

    const acct = await balance();
    expect(acct.currentBalance).toBe(10000); // credited exactly once
    expect(acct.totalDeposited).toBe(10000);

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, txn.id));
    expect(entries).toHaveLength(1);
  });

  it('debits and refuses to go negative', async () => {
    await ledger.credit(accountId, 10000);
    const r = await ledger.debit(accountId, 4000, { note: 'withdrawal' });
    expect(r.newBalance).toBe(6000);
    expect((await balance()).currentBalance).toBe(6000);
    // total_deposited is not reduced by a debit
    expect((await balance()).totalDeposited).toBe(10000);

    await expect(ledger.debit(accountId, 999999)).rejects.toThrow(/Insufficient balance/);
  });

  it('rejects non-positive and non-integer amounts', async () => {
    await expect(ledger.credit(accountId, 0)).rejects.toThrow();
    await expect(ledger.credit(accountId, -100)).rejects.toThrow();
    await expect(ledger.credit(accountId, 10.5)).rejects.toThrow();
  });

  it('reconciles the stored balance against the ledger sum', async () => {
    await ledger.credit(accountId, 10000);
    await ledger.credit(accountId, 5000);
    await ledger.debit(accountId, 3000);

    const rec = await ledger.reconcile(accountId);
    expect(rec.credits).toBe(15000);
    expect(rec.debits).toBe(3000);
    expect(rec.computedBalance).toBe(12000);
    expect(rec.storedBalance).toBe(12000);
    expect(rec.consistent).toBe(true);
  });

  it('refuses to post to a non-active account', async () => {
    await db
      .update(pigmyAccounts)
      .set({ status: 'closed' })
      .where(eq(pigmyAccounts.id, accountId));
    await expect(ledger.credit(accountId, 10000)).rejects.toThrow(/closed/);
  });
});
