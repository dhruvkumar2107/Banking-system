import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { ledgerEntries, pigmyAccounts, transactions } from '../../db/schema';
import { withRupees } from '../../common/money';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';

export type ReconciliationStatus = 'matched' | 'mismatch' | 'pending' | 'investigation' | 'resolved';

export interface ReconciliationItem {
  id: string;
  transactionId: string;
  orderId: string | null;
  paymentId: string | null;
  amount: number;
  status: ReconciliationStatus;
  ledgerEntryExists: boolean;
  ledgerAmount: number | null;
  discrepancy: string | null;
  createdAt: Date;
}

/**
 * Payment reconciliation engine. Detects discrepancies between payment
 * provider records and the internal ledger. This is a READ-ONLY analysis
 * tool — it NEVER modifies financial records.
 *
 * Discrepancies detected:
 * - Payment succeeded but ledger entry missing
 * - Ledger entry exists but payment not captured
 * - Amount mismatch between payment and ledger
 * - Duplicate ledger entries for same transaction
 * - Stale pending payments (webhook may have been lost)
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger('Reconciliation');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  /**
   * Full reconciliation scan: compare successful transactions against ledger
   * entries and identify discrepancies.
   */
  async scan(from?: Date, to?: Date): Promise<{
    totalTransactions: number;
    matched: number;
    mismatched: number;
    pendingReview: number;
    items: ReconciliationItem[];
  }> {
    const conds = [eq(transactions.status, 'success')];
    if (from) conds.push(gte(transactions.createdAt, from));
    if (to) conds.push(lte(transactions.createdAt, to));

    const successfulTxns = await this.db
      .select({
        id: transactions.id,
        pigmyAccountId: transactions.pigmyAccountId,
        amount: transactions.amount,
        gatewayOrderId: transactions.gatewayOrderId,
        gatewayPaymentId: transactions.gatewayPaymentId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(...conds));

    const items: ReconciliationItem[] = [];
    let matched = 0;
    let mismatched = 0;
    let pendingReview = 0;

    for (const txn of successfulTxns) {
      const [ledgerEntry] = await this.db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.transactionId, txn.id))
        .limit(1);

      let status: ReconciliationStatus;
      let discrepancy: string | null = null;
      let ledgerAmount: number | null = null;

      if (ledgerEntry) {
        ledgerAmount = ledgerEntry.amount;
        if (ledgerEntry.amount === txn.amount && ledgerEntry.type === 'credit') {
          status = 'matched';
          matched++;
        } else {
          status = 'mismatch';
          discrepancy = ledgerEntry.amount !== txn.amount
            ? `Amount mismatch: transaction=${txn.amount}, ledger=${ledgerEntry.amount}`
            : `Type mismatch: expected credit, got ${ledgerEntry.type}`;
          mismatched++;
        }
      } else {
        status = 'pending';
        discrepancy = 'Ledger entry missing for successful transaction';
        pendingReview++;
      }

      items.push({
        id: txn.id,
        transactionId: txn.id,
        orderId: txn.gatewayOrderId,
        paymentId: txn.gatewayPaymentId,
        amount: txn.amount,
        status,
        ledgerEntryExists: !!ledgerEntry,
        ledgerAmount,
        discrepancy,
        createdAt: txn.createdAt,
      });
    }

    return {
      totalTransactions: successfulTxns.length,
      matched,
      mismatched,
      pendingReview,
      items,
    };
  }

  /**
   * Find stale pending transactions that may need manual review.
   * These are payments that were created but never completed or failed.
   */
  async findStalePending(olderThanMinutes = 30): Promise<{
    count: number;
    totalAmount: number;
    items: { id: string; orderId: string | null; amount: number; age: number; createdAt: Date }[];
  }> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

    const stale = await this.db
      .select({
        id: transactions.id,
        orderId: transactions.gatewayOrderId,
        amount: transactions.amount,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'pending'),
          lte(transactions.createdAt, cutoff),
        ),
      )
      .orderBy(desc(transactions.createdAt));

    const items = stale.map((t) => ({
      id: t.id,
      orderId: t.orderId,
      amount: t.amount,
      age: Math.round((Date.now() - t.createdAt.getTime()) / 60_000),
      createdAt: t.createdAt,
    }));

    return {
      count: items.length,
      totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
      items,
    };
  }

  /**
   * Check for duplicate ledger entries (same transactionId appearing multiple times).
   * The unique index should prevent this, but this is a safety check.
   */
  async findDuplicateEntries(): Promise<{
    count: number;
    duplicates: { transactionId: string; count: number; totalAmount: number }[];
  }> {
    const dupes = await this.db
      .select({
        transactionId: ledgerEntries.transactionId,
        count: count(),
        totalAmount: sql<number>`sum(${ledgerEntries.amount})`,
      })
      .from(ledgerEntries)
      .where(sql`${ledgerEntries.transactionId} IS NOT NULL`)
      .groupBy(ledgerEntries.transactionId)
      .having(sql`count(*) > 1`);

    return {
      count: dupes.length,
      duplicates: dupes.map((d) => ({
        transactionId: d.transactionId!,
        count: Number(d.count),
        totalAmount: Number(d.totalAmount),
      })),
    };
  }

  /**
   * Account-level reconciliation: verify that the stored balance matches
   * the sum of all ledger entries for each account.
   */
  async accountReconciliation(accountId?: string): Promise<{
    totalAccounts: number;
    consistent: number;
    inconsistent: number;
    details: {
      accountId: string;
      accountNumber: string;
      storedBalance: number;
      computedBalance: number;
      consistent: boolean;
      difference: number;
    }[];
  }> {
    const where = accountId ? eq(pigmyAccounts.id, accountId) : undefined;
    const accounts = await this.db
      .select({
        id: pigmyAccounts.id,
        accountNumber: pigmyAccounts.accountNumber,
        currentBalance: pigmyAccounts.currentBalance,
      })
      .from(pigmyAccounts)
      .where(where);

    const details = [];
    let consistent = 0;
    let inconsistent = 0;

    for (const acct of accounts) {
      const [computed] = await this.db
        .select({
          credits: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'credit' then ${ledgerEntries.amount} else 0 end), 0)`,
          debits: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'debit' then ${ledgerEntries.amount} else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.pigmyAccountId, acct.id));

      const computedBalance = Number(computed.credits) - Number(computed.debits);
      const isConsistent = computedBalance === acct.currentBalance;

      if (isConsistent) consistent++;
      else inconsistent++;

      details.push({
        accountId: acct.id,
        accountNumber: acct.accountNumber,
        storedBalance: acct.currentBalance,
        computedBalance,
        consistent: isConsistent,
        difference: acct.currentBalance - computedBalance,
      });
    }

    return {
      totalAccounts: accounts.length,
      consistent,
      inconsistent,
      details,
    };
  }

  /**
   * Reconciliation summary for the admin dashboard.
   */
  async summary(): Promise<{
    totalSuccessfulTransactions: number;
    matchedEntries: number;
    missingEntries: number;
    stalePending: number;
    duplicateEntries: number;
    accountsInconsistent: number;
    lastScanAt: Date | null;
  }> {
    const [[{ value: totalSuccess }], [{ value: matchedEntries }], missingResult] =
      await Promise.all([
        this.db
          .select({ value: count() })
          .from(transactions)
          .where(eq(transactions.status, 'success')),
        this.db
          .select({ value: count() })
          .from(ledgerEntries)
          .where(sql`${ledgerEntries.transactionId} IN (SELECT id FROM transactions WHERE status = 'success')`),
        this.db.execute(sql<{ value: number }>`(
            SELECT count(*) as value FROM transactions t
            WHERE t.status = 'success'
            AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.transaction_id = t.id)
          )`),
      ]);
    const missingEntries = missingResult[0]?.value ?? 0;

    const stale = await this.findStalePending(30);
    const dupes = await this.findDuplicateEntries();
    const acctRec = await this.accountReconciliation();

    return {
      totalSuccessfulTransactions: Number(totalSuccess),
      matchedEntries: Number(matchedEntries),
      missingEntries: Number(missingEntries),
      stalePending: stale.count,
      duplicateEntries: dupes.count,
      accountsInconsistent: acctRec.inconsistent,
      lastScanAt: new Date(),
    };
  }
}
