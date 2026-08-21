import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { customers, pigmyAccounts, transactions, villages } from '../../db/schema';
import { withRupees } from '../../common/money';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class ReportsService {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  private scopeCond(actor: AdminPrincipal, villageId?: string): SQL | undefined {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (villageId) {
      assertVillageAccess(actor, villageId);
      conds.push(eq(customers.villageId, villageId));
    }
    return and(...conds.filter(Boolean));
  }

  /** Admin dashboard headline numbers. */
  async dashboard(actor: AdminPrincipal) {
    const scope = villageScopeFilter(actor, customers.villageId);
    const today = startOfToday();

    // Today's transactions grouped by status (scoped).
    const todayRows = await this.db
      .select({
        status: transactions.status,
        cnt: count(),
        amount: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
      .where(and(gte(transactions.createdAt, today), scope))
      .groupBy(transactions.status);

    const byStatus = { success: 0, pending: 0, failed: 0 } as Record<string, number>;
    let todayCollectedPaise = 0;
    for (const r of todayRows) {
      byStatus[r.status] = Number(r.cnt);
      if (r.status === 'success') todayCollectedPaise = Number(r.amount);
    }

    const [[{ value: totalCustomers }], [{ value: activeAccounts }], [balanceRow], [allTimeRow]] =
      await Promise.all([
        this.db.select({ value: count() }).from(customers).where(scope),
        this.db
          .select({ value: count() })
          .from(pigmyAccounts)
          .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
          .where(and(eq(pigmyAccounts.status, 'active'), scope)),
        this.db
          .select({ value: sql<number>`coalesce(sum(${pigmyAccounts.currentBalance}), 0)` })
          .from(pigmyAccounts)
          .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
          .where(scope),
        this.db
          .select({ value: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
          .from(transactions)
          .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
          .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
          .where(and(eq(transactions.status, 'success'), scope)),
      ]);

    return {
      todayCollection: withRupees(todayCollectedPaise),
      todayCounts: {
        success: byStatus.success,
        pending: byStatus.pending,
        failed: byStatus.failed,
      },
      totalCustomers: Number(totalCustomers),
      activeAccounts: Number(activeAccounts),
      totalBalance: withRupees(Number(balanceRow.value)),
      totalCollectedAllTime: withRupees(Number(allTimeRow.value)),
    };
  }

  /** Date-wise collection totals within a range (defaults to last 30 days). */
  async dateWise(actor: AdminPrincipal, fromISO?: string, toISO?: string, villageId?: string) {
    const to = toISO ? new Date(toISO) : new Date();
    const from = fromISO ? new Date(fromISO) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const scope = this.scopeCond(actor, villageId);

    const rows = await this.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${transactions.createdAt}), 'YYYY-MM-DD')`,
        collected: sql<number>`coalesce(sum(case when ${transactions.status} = 'success' then ${transactions.amount} else 0 end), 0)`,
        successCount: sql<number>`sum(case when ${transactions.status} = 'success' then 1 else 0 end)`,
        pendingCount: sql<number>`sum(case when ${transactions.status} = 'pending' then 1 else 0 end)`,
        failedCount: sql<number>`sum(case when ${transactions.status} = 'failed' then 1 else 0 end)`,
      })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
      .where(and(gte(transactions.createdAt, from), lte(transactions.createdAt, to), scope))
      .groupBy(sql`date_trunc('day', ${transactions.createdAt})`)
      .orderBy(sql`date_trunc('day', ${transactions.createdAt})`);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      series: rows.map((r) => ({
        day: r.day,
        collected: withRupees(Number(r.collected)),
        successCount: Number(r.successCount),
        pendingCount: Number(r.pendingCount),
        failedCount: Number(r.failedCount),
      })),
    };
  }

  /** Per-village collection + balances (all-time, or a date range for collected). */
  async villageWise(actor: AdminPrincipal, fromISO?: string, toISO?: string) {
    const scopeVillages = villageScopeFilter(actor, villages.id);
    const scopeCustomers = villageScopeFilter(actor, customers.villageId);

    const vRows = await this.db
      .select({ id: villages.id, name: villages.name, code: villages.code })
      .from(villages)
      .where(scopeVillages);

    // Customers + balances per village.
    const balRows = await this.db
      .select({
        villageId: customers.villageId,
        customers: sql<number>`count(distinct ${customers.id})`,
        accounts: sql<number>`count(distinct ${pigmyAccounts.id})`,
        balance: sql<number>`coalesce(sum(${pigmyAccounts.currentBalance}), 0)`,
        deposited: sql<number>`coalesce(sum(${pigmyAccounts.totalDeposited}), 0)`,
      })
      .from(customers)
      .leftJoin(pigmyAccounts, eq(pigmyAccounts.customerId, customers.id))
      .where(scopeCustomers)
      .groupBy(customers.villageId);

    // Collected (successful) per village, optional date range.
    const collectedConds = [scopeCustomers, eq(transactions.status, 'success')];
    if (fromISO) collectedConds.push(gte(transactions.createdAt, new Date(fromISO)));
    if (toISO) collectedConds.push(lte(transactions.createdAt, new Date(toISO)));
    const colRows = await this.db
      .select({
        villageId: customers.villageId,
        collected: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        txns: count(),
      })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
      .where(and(...collectedConds.filter(Boolean)))
      .groupBy(customers.villageId);

    const balByVillage = new Map(balRows.map((r) => [r.villageId, r]));
    const colByVillage = new Map(colRows.map((r) => [r.villageId, r]));

    return vRows.map((v) => {
      const bal = balByVillage.get(v.id);
      const col = colByVillage.get(v.id);
      return {
        id: v.id,
        name: v.name,
        code: v.code,
        customers: Number(bal?.customers ?? 0),
        accounts: Number(bal?.accounts ?? 0),
        currentBalance: withRupees(Number(bal?.balance ?? 0)),
        totalDeposited: withRupees(Number(bal?.deposited ?? 0)),
        collected: withRupees(Number(col?.collected ?? 0)),
        successfulTxns: Number(col?.txns ?? 0),
      };
    });
  }

  /** Collection analytics: a daily time series for charts. */
  async analytics(actor: AdminPrincipal, days: number) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
    return this.dateWise(actor, from.toISOString(), to.toISOString());
  }
}
