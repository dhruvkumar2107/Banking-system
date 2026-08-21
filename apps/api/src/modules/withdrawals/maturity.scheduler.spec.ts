import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import { auditLogs, customers, notifications, pigmyAccounts, villages } from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MaturityScheduler } from './maturity.scheduler';
import { addDays, DEFAULT_SCHEME } from './scheme.service';

/**
 * The maturity sweep's finder + marker are driven directly (no cron, no Nest DI),
 * mirroring NotificationsScheduler's spec. Two properties matter most: it must be
 * idempotent (safe to re-run, safe to miss a day) and it must move NO money —
 * interest is credited only when a withdrawal is paid.
 */
describe('MaturityScheduler', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let scheduler: MaturityScheduler;
  let ledger: LedgerService;

  let maturedAccountId: string; // term ended 5 days ago
  let openAccountId: string; // still mid-term
  let maturedCustomerId: string;

  const now = () => new Date();

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const audit = new AuditService(db);
    ledger = new LedgerService(db, audit);
    scheduler = new MaturityScheduler(db, new NotificationsService(db, audit), audit);

    const [village] = await db
      .insert(villages)
      .values({ name: 'Village A', code: 'VLGA' })
      .returning();

    const [matureCust] = await db
      .insert(customers)
      .values({ villageId: village.id, name: 'Asha', mobile: '9000000001' })
      .returning();
    const [openCust] = await db
      .insert(customers)
      .values({ villageId: village.id, name: 'Bhanu', mobile: '9000000002' })
      .returning();
    maturedCustomerId = matureCust.id;

    const openedLongAgo = addDays(new Date(), -(DEFAULT_SCHEME.termDays + 5));
    const [matured] = await db
      .insert(pigmyAccounts)
      .values({
        customerId: matureCust.id,
        accountNumber: 'PIG-MATURE-01',
        dailyAmount: 10_000,
        createdAt: openedLongAgo,
        maturityDate: addDays(openedLongAgo, DEFAULT_SCHEME.termDays),
      })
      .returning();
    const [open] = await db
      .insert(pigmyAccounts)
      .values({
        customerId: openCust.id,
        accountNumber: 'PIG-OPEN-02',
        dailyAmount: 10_000,
        maturityDate: addDays(new Date(), 100), // matures in 100 days
      })
      .returning();
    maturedAccountId = matured.id;
    openAccountId = open.id;

    await ledger.credit(maturedAccountId, 500_000, { note: 'deposits' }); // ₹5,000
    await ledger.credit(openAccountId, 500_000, { note: 'deposits' });
  });

  afterEach(async () => close());

  it('finds only accounts past their maturity date', async () => {
    const due = await scheduler.findMaturedAccounts(now());
    expect(due).toHaveLength(1);
    expect(due[0].accountId).toBe(maturedAccountId);
    expect(due[0].accountNumber).toBe('PIG-MATURE-01');
    expect(due[0].currentBalance).toBe(500_000);
    expect(due[0].termDays).toBe(DEFAULT_SCHEME.termDays);
  });

  it('ignores accounts with no maturity date at all', async () => {
    await db
      .update(pigmyAccounts)
      .set({ maturityDate: null })
      .where(eq(pigmyAccounts.id, maturedAccountId));
    expect(await scheduler.findMaturedAccounts(now())).toHaveLength(0);
  });

  it('ignores accounts that are not active', async () => {
    await db
      .update(pigmyAccounts)
      .set({ status: 'closed' })
      .where(eq(pigmyAccounts.id, maturedAccountId));
    expect(await scheduler.findMaturedAccounts(now())).toHaveLength(0);
  });

  it('marks the account matured, audits it and notifies the customer', async () => {
    const [due] = await scheduler.findMaturedAccounts(now());
    const projected = await scheduler.markMatured(due, now());

    // ₹5,000 @ 4% p.a. for a full 365-day term = ₹200
    expect(projected).toBe(20_000);

    const [acct] = await db
      .select()
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.id, maturedAccountId));
    expect(acct.maturedAt).not.toBeNull();

    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.customerId, maturedCustomerId));
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/matured/i);
    expect(notes[0].body).toContain('₹5,200.00'); // principal + interest
    // Customer-facing copy shows only the last 4 of the account number.
    expect(notes[0].body).not.toContain('PIG-MATURE-01');
    expect(notes[0].body).toContain('E-01');

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, maturedAccountId));
    expect(logs.some((l) => l.action === 'pigmy.matured')).toBe(true);
  });

  it('moves no money — interest is credited only at payout', async () => {
    const [due] = await scheduler.findMaturedAccounts(now());
    await scheduler.markMatured(due, now());

    const [acct] = await db
      .select()
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.id, maturedAccountId));
    expect(acct.currentBalance).toBe(500_000); // unchanged
    expect(acct.interestCreditedAt).toBeNull();
  });

  it('is idempotent: a second sweep finds nothing and sends no second notification', async () => {
    await scheduler.runMaturitySweep();
    expect(await scheduler.findMaturedAccounts(now())).toHaveLength(0);

    await scheduler.runMaturitySweep();
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.customerId, maturedCustomerId));
    expect(notes).toHaveLength(1);
  });

  it('caps interest at the account’s term even when the sweep runs late', async () => {
    // Simulate a sweep that only ran a year after maturity — the customer must
    // not accrue interest for the extra year the money sat past term.
    const [due] = await scheduler.findMaturedAccounts(now());
    const late = addDays(new Date(), 365);
    const projected = await scheduler.markMatured(due, late);
    expect(projected).toBe(20_000); // one term's worth, not two
  });

  it('the whole sweep runs without throwing when there is nothing to do', async () => {
    await scheduler.runMaturitySweep(); // clears the one due account
    await expect(scheduler.runMaturitySweep()).resolves.toBeUndefined();
  });
});
