import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { customers, pigmyAccounts, schemeSettings, villages } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { rupeesToPaise, withRupees } from '../../common/money';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { addDays, DEFAULT_SCHEME } from '../withdrawals/scheme.service';

@Injectable()
export class PigmyService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  private async generateAccountNumber(runner: AppDatabase | AppTransaction): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const candidate = `PIG${randomInt(1_000_000_0000, 9_999_999_9999)}`;
      const [existing] = await runner
        .select({ id: pigmyAccounts.id })
        .from(pigmyAccounts)
        .where(eq(pigmyAccounts.accountNumber, candidate))
        .limit(1);
      if (!existing) return candidate;
    }
    throw new Error('Could not allocate a unique pigmy account number');
  }

  /**
   * Read the bank's active scheme terms. Deliberately a direct table read rather
   * than an injected SchemeService: the withdrawals module already depends on
   * pigmy, so injecting the other way would create a circular module graph.
   * Falls back to DEFAULT_SCHEME when no scheme row has been saved yet.
   */
  private async activeSchemeTerms(runner: AppDatabase | AppTransaction) {
    const [row] = await runner
      .select({ termDays: schemeSettings.termDays, interestRateBps: schemeSettings.interestRateBps })
      .from(schemeSettings)
      .orderBy(desc(schemeSettings.updatedAt))
      .limit(1);
    return {
      termDays: row?.termDays ?? DEFAULT_SCHEME.termDays,
      interestRateBps: row?.interestRateBps ?? DEFAULT_SCHEME.interestRateBps,
    };
  }

  /**
   * Create a pigmy account. Can participate in an outer transaction (registration).
   *
   * The scheme's term and interest rate are SNAPSHOTTED onto the row here, and
   * the maturity date is derived from them, so a later change to the bank's
   * scheme never re-prices an account that is already open.
   */
  async createAccount(
    customerId: string,
    dailyAmountPaise: number,
    opts: { actorId?: string | null; actorType?: 'admin' | 'customer' | 'system'; ip?: string } = {},
    tx?: AppTransaction,
  ) {
    const runner = tx ?? this.db;
    const accountNumber = await this.generateAccountNumber(runner);
    const terms = await this.activeSchemeTerms(runner);
    const openedAt = new Date();

    const [row] = await runner
      .insert(pigmyAccounts)
      .values({
        customerId,
        accountNumber,
        dailyAmount: dailyAmountPaise,
        termDays: terms.termDays,
        interestRateBps: terms.interestRateBps,
        maturityDate: addDays(openedAt, terms.termDays),
      })
      .returning();

    await this.audit.record(
      {
        actorId: opts.actorId ?? null,
        actorType: opts.actorType ?? 'system',
        action: AuditAction.PIGMY_CREATED,
        entity: 'pigmy_account',
        entityId: row.id,
        after: row,
        ip: opts.ip,
      },
      tx,
    );
    return row;
  }

  async createForAdmin(customerId: string, dailyAmountRupees: number, actor: AdminPrincipal, ip?: string) {
    const [cust] = await this.db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!cust) throw new NotFoundException('Customer not found');
    assertVillageAccess(actor, cust.villageId);
    return this.createAccount(customerId, rupeesToPaise(dailyAmountRupees), {
      actorId: actor.sub,
      actorType: 'admin',
      ip,
    });
  }

  private serialize(a: typeof pigmyAccounts.$inferSelect) {
    const maturityDate = a.maturityDate
      ? a.maturityDate instanceof Date
        ? a.maturityDate
        : new Date(a.maturityDate)
      : null;
    const matured = !!a.maturedAt || (!!maturityDate && maturityDate.getTime() <= Date.now());
    return {
      id: a.id,
      customerId: a.customerId,
      accountNumber: a.accountNumber,
      status: a.status,
      dailyAmount: withRupees(a.dailyAmount),
      currentBalance: withRupees(a.currentBalance),
      totalDeposited: withRupees(a.totalDeposited),
      // Scheme terms snapshotted at opening + derived maturity state.
      termDays: a.termDays,
      interestRatePercent: a.interestRateBps / 100,
      maturityDate,
      matured,
      maturedAt: a.maturedAt,
      interestCreditedAt: a.interestCreditedAt,
      closedAt: a.closedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  async getByIdRaw(id: string, runner: AppDatabase | AppTransaction = this.db) {
    const [row] = await runner.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, id)).limit(1);
    return row ?? null;
  }

  async getPrimaryForCustomer(customerId: string) {
    const [row] = await this.db
      .select()
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.customerId, customerId))
      .orderBy(desc(pigmyAccounts.createdAt))
      .limit(1);
    if (!row) throw new NotFoundException('No pigmy account found');
    return this.serialize(row);
  }

  async getAccountForCustomer(customerId: string, accountId: string) {
    const acct = await this.getByIdRaw(accountId);
    if (!acct || acct.customerId !== customerId) throw new NotFoundException('Account not found');
    return this.serialize(acct);
  }

  /** Admin: get one account with owner + village, enforcing village scope. */
  async getForAdmin(accountId: string, actor: AdminPrincipal) {
    const [row] = await this.db
      .select({
        account: pigmyAccounts,
        customerName: customers.name,
        customerMobile: customers.mobile,
        villageId: customers.villageId,
        villageName: villages.name,
      })
      .from(pigmyAccounts)
      .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
      .innerJoin(villages, eq(villages.id, customers.villageId))
      .where(eq(pigmyAccounts.id, accountId))
      .limit(1);
    if (!row) throw new NotFoundException('Pigmy account not found');
    assertVillageAccess(actor, row.villageId);
    return {
      ...this.serialize(row.account),
      customer: { name: row.customerName, mobile: row.customerMobile },
      village: { id: row.villageId, name: row.villageName },
    };
  }

  /** Admin: paginated overview across accounts, village-scoped and searchable. */
  async overview(actor: AdminPrincipal, page: number, limit: number, search?: string, status?: string) {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (status) conds.push(eq(pigmyAccounts.status, status as never));
    if (search) {
      conds.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(pigmyAccounts.accountNumber, `%${search}%`),
          ilike(customers.mobile, `%${search}%`),
        ),
      );
    }
    const where = and(...conds.filter(Boolean));

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          account: pigmyAccounts,
          customerName: customers.name,
          customerMobile: customers.mobile,
          villageName: villages.name,
        })
        .from(pigmyAccounts)
        .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
        .innerJoin(villages, eq(villages.id, customers.villageId))
        .where(where)
        .orderBy(desc(pigmyAccounts.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ value: count() })
        .from(pigmyAccounts)
        .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
        .where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        ...this.serialize(r.account),
        customer: { name: r.customerName, mobile: r.customerMobile },
        village: r.villageName,
      })),
      total,
    };
  }

  async setStatus(accountId: string, status: 'active' | 'inactive' | 'closed', actor: AdminPrincipal, ip?: string) {
    const acct = await this.getForAdmin(accountId, actor); // enforces scope + existence
    const [before] = await this.db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountId));
    const [after] = await this.db
      .update(pigmyAccounts)
      .set({ status, updatedAt: new Date() })
      .where(eq(pigmyAccounts.id, accountId))
      .returning();
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.PIGMY_STATUS_CHANGED,
      entity: 'pigmy_account',
      entityId: accountId,
      before: { status: before.status },
      after: { status: after.status },
      ip,
    });
    return this.serialize(after);
  }

  async updateDailyAmount(accountId: string, dailyAmountRupees: number, actor: AdminPrincipal, ip?: string) {
    await this.getForAdmin(accountId, actor);
    if (dailyAmountRupees < 1) throw new BadRequestException('Daily amount must be >= 1');
    const [after] = await this.db
      .update(pigmyAccounts)
      .set({ dailyAmount: rupeesToPaise(dailyAmountRupees), updatedAt: new Date() })
      .where(eq(pigmyAccounts.id, accountId))
      .returning();
    return this.serialize(after);
  }

  /** Resolve the account a customer is paying into, or throw. */
  async resolvePayableAccount(customerId: string, accountId?: string) {
    let acct = accountId ? await this.getByIdRaw(accountId) : null;
    if (!acct) {
      const [row] = await this.db
        .select()
        .from(pigmyAccounts)
        .where(eq(pigmyAccounts.customerId, customerId))
        .orderBy(desc(pigmyAccounts.createdAt))
        .limit(1);
      acct = row ?? null;
    }
    if (!acct) throw new NotFoundException('No pigmy account found');
    if (acct.customerId !== customerId) throw new ForbiddenException('Not your account');
    if (acct.status !== 'active') throw new BadRequestException(`Account is ${acct.status}`);
    return acct;
  }
}
