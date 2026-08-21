import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import { customers, pigmyAccounts, transactions, villages } from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from './notifications.service';
import { NotificationsScheduler } from './notifications.scheduler';

/**
 * The scheduler's query logic is exercised directly against a real embedded
 * Postgres (no cron, no Nest DI) — the two finder methods are the contract.
 */
describe('NotificationsScheduler', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let scheduler: NotificationsScheduler;

  let customerAId: string;
  let customerBId: string;
  let accountAId: string; // has a successful deposit today
  let accountBId: string; // no deposits at all

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    scheduler = new NotificationsScheduler(
      db,
      new NotificationsService(db, new AuditService(db)),
      new AppConfigService(),
    );

    const [village] = await db
      .insert(villages)
      .values({ name: 'Village A', code: 'VLGA' })
      .returning();

    const [custA] = await db
      .insert(customers)
      .values({ villageId: village.id, name: 'Asha', mobile: '9000000001' })
      .returning();
    const [custB] = await db
      .insert(customers)
      .values({ villageId: village.id, name: 'Bhanu', mobile: '9000000002' })
      .returning();
    customerAId = custA.id;
    customerBId = custB.id;

    const [accA] = await db
      .insert(pigmyAccounts)
      .values({ customerId: custA.id, accountNumber: 'PIG-AAAA-1111', dailyAmount: 10000 })
      .returning();
    const [accB] = await db
      .insert(pigmyAccounts)
      .values({ customerId: custB.id, accountNumber: 'PIG-BBBB-2222', dailyAmount: 5000 })
      .returning();
    accountAId = accA.id;
    accountBId = accB.id;

    // Account A already deposited today; account B has nothing.
    await db
      .insert(transactions)
      .values({ pigmyAccountId: accountAId, amount: 10000, status: 'success' });
  });

  afterEach(async () => close());

  it('flags active accounts with no successful deposit today (B), not those that deposited (A)', async () => {
    const list = await scheduler.findAccountsNeedingReminder(new Date());
    const ids = list.map((r) => r.accountId);

    expect(ids).toContain(accountBId);
    expect(ids).not.toContain(accountAId);

    const bRow = list.find((r) => r.accountId === accountBId);
    expect(bRow).toMatchObject({
      customerId: customerBId,
      accountNumber: 'PIG-BBBB-2222',
      dailyAmount: 5000,
    });
  });

  it('flags active accounts whose last successful deposit is >= threshold days ago', async () => {
    // A 3rd account whose only success is 5 days old.
    const [village] = await db.select().from(villages).limit(1);
    const [custC] = await db
      .insert(customers)
      .values({ villageId: village.id, name: 'Chandra', mobile: '9000000003' })
      .returning();
    const [accC] = await db
      .insert(pigmyAccounts)
      .values({ customerId: custC.id, accountNumber: 'PIG-CCCC-3333', dailyAmount: 20000 })
      .returning();

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await db
      .insert(transactions)
      .values({ pigmyAccountId: accC.id, amount: 20000, status: 'success', createdAt: fiveDaysAgo });

    const now = new Date();
    const missed = await scheduler.findAccountsWithMissedDays(now, 3);

    const cRow = missed.find((r) => r.accountId === accC.id);
    expect(cRow).toBeDefined();
    expect(cRow!.missedDays).toBeGreaterThanOrEqual(5);
    expect(cRow).toMatchObject({ customerId: custC.id, accountNumber: 'PIG-CCCC-3333' });

    // Account A deposited today, so it must not be flagged as missed.
    expect(missed.map((r) => r.accountId)).not.toContain(accountAId);
    // (accountAId is referenced to keep it meaningful across both specs.)
    expect(accountAId).toBeDefined();
  });
});
