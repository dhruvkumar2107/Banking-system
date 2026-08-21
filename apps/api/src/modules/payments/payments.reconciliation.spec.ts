import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import { customers, pigmyAccounts, transactions, villages } from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { PigmyService } from '../pigmy/pigmy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from './payments.service';
import { ReceiptService } from './receipt.service';
import type { RazorpayService, GatewayOrderStatus } from './razorpay.service';

/**
 * Reconciliation recovers payments whose capture webhook never arrived. These
 * tests drive PaymentsService against a real embedded Postgres with a stubbed
 * gateway, proving (a) the finder selects exactly the stale-pending-with-order
 * rows, (b) a captured order gets settled + credited exactly once, and (c) it
 * is a no-op in mock mode.
 */
describe('Payment reconciliation', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let payments: PaymentsService;

  let accountId: string;
  let paidOrders: Set<string>;
  let mode: 'mock' | 'live';

  const STALE = 'order_stale_captured';
  const FRESH = 'order_fresh_pending';
  const NOID = null;
  const SETTLED = 'order_already_success';

  /** Minimal RazorpayService stand-in: reports `mode` and looks up captures. */
  const razorpayStub = {
    get mode() {
      return mode;
    },
    async fetchOrderStatus(orderId: string): Promise<GatewayOrderStatus> {
      return paidOrders.has(orderId)
        ? { paid: true, paymentId: `pay_for_${orderId}` }
        : { paid: false, paymentId: null };
    },
  } as unknown as RazorpayService;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    mode = 'live';
    paidOrders = new Set<string>();

    const audit = new AuditService(db);
    payments = new PaymentsService(
      db,
      razorpayStub,
      new ReceiptService(),
      new LedgerService(db, audit),
      new PigmyService(db, audit),
      new NotificationsService(db, audit),
      audit,
    );

    const [village] = await db.insert(villages).values({ name: 'Village A', code: 'VLGA' }).returning();
    const [cust] = await db
      .insert(customers)
      .values({ villageId: village.id, name: 'Asha', mobile: '9000000001' })
      .returning();
    const [acc] = await db
      .insert(pigmyAccounts)
      .values({ customerId: cust.id, accountNumber: 'PIG-AAAA-1111', dailyAmount: 10000 })
      .returning();
    accountId = acc.id;

    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
    const now = new Date();

    // Stale pending, captured at the gateway — should be recovered.
    await db.insert(transactions).values({
      pigmyAccountId: accountId,
      amount: 10000,
      status: 'pending',
      gateway: 'razorpay',
      gatewayOrderId: STALE,
      createdAt: thirtyMinAgo,
    });
    // Fresh pending — too recent, leave it alone.
    await db.insert(transactions).values({
      pigmyAccountId: accountId,
      amount: 10000,
      status: 'pending',
      gateway: 'razorpay',
      gatewayOrderId: FRESH,
      createdAt: now,
    });
    // Stale pending but no order id (order creation never completed) — skip.
    await db.insert(transactions).values({
      pigmyAccountId: accountId,
      amount: 10000,
      status: 'pending',
      gateway: 'razorpay',
      gatewayOrderId: NOID,
      createdAt: thirtyMinAgo,
    });
    // Already settled — must never be re-touched.
    await db.insert(transactions).values({
      pigmyAccountId: accountId,
      amount: 10000,
      status: 'success',
      gateway: 'razorpay',
      gatewayOrderId: SETTLED,
      createdAt: thirtyMinAgo,
    });
  });

  afterEach(async () => close());

  it('selects only stale pending transactions that carry a gateway order id', async () => {
    const cutoff = new Date(Date.now() - 10 * 60_000);
    const stale = await payments.findStalePendingOrders(cutoff);
    const orderIds = stale.map((s) => s.gatewayOrderId);

    expect(orderIds).toContain(STALE);
    expect(orderIds).not.toContain(FRESH); // too recent
    expect(orderIds).not.toContain(SETTLED); // not pending
    expect(orderIds).not.toContain(null); // no order id
    expect(stale).toHaveLength(1);
  });

  it('settles a captured stale payment and credits the ledger exactly once', async () => {
    paidOrders.add(STALE); // gateway confirms this one was captured

    const first = await payments.reconcilePending(new Date(), 10);
    expect(first).toEqual({ checked: 1, settled: 1 });

    const [txn] = await db.select().from(transactions).where(eq(transactions.gatewayOrderId, STALE));
    expect(txn.status).toBe('success');
    expect(txn.gatewayPaymentId).toBe(`pay_for_${STALE}`);

    const [acct] = await db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountId));
    expect(acct.currentBalance).toBe(10000);
    expect(acct.totalDeposited).toBe(10000);

    // Idempotent: a second sweep finds nothing pending and never double-credits.
    const second = await payments.reconcilePending(new Date(), 10);
    expect(second).toEqual({ checked: 0, settled: 0 });

    const [acctAfter] = await db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountId));
    expect(acctAfter.currentBalance).toBe(10000);
  });

  it('leaves stale payments the gateway does not report as captured still pending', async () => {
    // paidOrders is empty — the gateway says nothing was captured.
    const result = await payments.reconcilePending(new Date(), 10);
    expect(result).toEqual({ checked: 1, settled: 0 });

    const [txn] = await db.select().from(transactions).where(eq(transactions.gatewayOrderId, STALE));
    expect(txn.status).toBe('pending');
  });

  it('is a no-op in mock mode (no external gateway to reconcile against)', async () => {
    mode = 'mock';
    paidOrders.add(STALE);

    const result = await payments.reconcilePending(new Date(), 10);
    expect(result).toEqual({ checked: 0, settled: 0 });

    const [txn] = await db.select().from(transactions).where(eq(transactions.gatewayOrderId, STALE));
    expect(txn.status).toBe('pending');
  });
});
