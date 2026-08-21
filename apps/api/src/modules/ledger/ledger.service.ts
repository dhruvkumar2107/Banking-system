import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { ledgerEntries, pigmyAccounts, type LedgerEntry } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';

export interface LedgerMutationOpts {
  transactionId?: string | null;
  note?: string | null;
  actorId?: string | null;
  actorType?: 'system' | 'admin' | 'customer';
  ip?: string | null;
}

export interface LedgerResult {
  entry: LedgerEntry;
  previousBalance: number;
  newBalance: number;
  totalDeposited: number;
  /** True when an existing entry for the transaction was found (no double credit). */
  idempotentHit: boolean;
}

/**
 * The ledger engine — the ONLY component allowed to mutate pigmy_accounts
 * balances. Every mutation:
 *   1. locks the account row (SELECT … FOR UPDATE) to serialize concurrent writes,
 *   2. is idempotent per transactionId (a payment webhook can retry safely),
 *   3. appends an immutable ledger_entries row with previous/new balance,
 *   4. updates the derived balance columns inside the same DB transaction,
 *   5. writes an audit log row atomically.
 */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  credit(accountId: string, amount: number, opts: LedgerMutationOpts = {}, tx?: AppTransaction) {
    return this.mutate('credit', accountId, amount, opts, tx);
  }

  debit(accountId: string, amount: number, opts: LedgerMutationOpts = {}, tx?: AppTransaction) {
    return this.mutate('debit', accountId, amount, opts, tx);
  }

  private async mutate(
    type: 'credit' | 'debit',
    accountId: string,
    amount: number,
    opts: LedgerMutationOpts,
    outerTx?: AppTransaction,
  ): Promise<LedgerResult> {
    // async so validation failures surface as a rejected promise (not a
    // synchronous throw) — callers rely on `await`/`.rejects` semantics.
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer (paise)');
    }

    const run = async (tx: AppTransaction): Promise<LedgerResult> => {
      // 1. Lock the account row so concurrent mutations serialize on this account.
      const [acct] = await tx
        .select()
        .from(pigmyAccounts)
        .where(eq(pigmyAccounts.id, accountId))
        .for('update')
        .limit(1);
      if (!acct) throw new NotFoundException('Pigmy account not found');

      // 2. Idempotency: if this transaction already produced an entry, return it.
      if (opts.transactionId) {
        const [existing] = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.transactionId, opts.transactionId))
          .limit(1);
        if (existing) {
          return {
            entry: existing,
            previousBalance: existing.previousBalance,
            newBalance: existing.newBalance,
            totalDeposited: acct.totalDeposited,
            idempotentHit: true,
          };
        }
      }

      if (acct.status !== 'active') {
        throw new BadRequestException(`Pigmy account is ${acct.status}, cannot post entries`);
      }

      const prev = acct.currentBalance;
      const next = type === 'credit' ? prev + amount : prev - amount;
      if (next < 0) throw new BadRequestException('Insufficient balance for debit');

      const newTotalDeposited =
        type === 'credit' ? acct.totalDeposited + amount : acct.totalDeposited;

      // 3. Append the immutable ledger entry.
      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          pigmyAccountId: accountId,
          transactionId: opts.transactionId ?? null,
          type,
          amount,
          previousBalance: prev,
          newBalance: next,
          note: opts.note ?? null,
        })
        .returning();

      // 4. Update the DERIVED balance columns (never written anywhere else).
      await tx
        .update(pigmyAccounts)
        .set({ currentBalance: next, totalDeposited: newTotalDeposited, updatedAt: new Date() })
        .where(eq(pigmyAccounts.id, accountId));

      // 5. Audit atomically with the change.
      await this.audit.record(
        {
          actorId: opts.actorId ?? null,
          actorType: opts.actorType ?? 'system',
          action: type === 'credit' ? AuditAction.LEDGER_CREDIT : AuditAction.LEDGER_DEBIT,
          entity: 'pigmy_account',
          entityId: accountId,
          before: { currentBalance: prev, totalDeposited: acct.totalDeposited },
          after: {
            currentBalance: next,
            totalDeposited: newTotalDeposited,
            amount,
            ledgerEntryId: entry.id,
            transactionId: opts.transactionId ?? null,
          },
          ip: opts.ip ?? null,
        },
        tx,
      );

      return {
        entry,
        previousBalance: prev,
        newBalance: next,
        totalDeposited: newTotalDeposited,
        idempotentHit: false,
      };
    };

    return outerTx ? run(outerTx) : this.db.transaction(run);
  }

  /** Paginated ledger history for an account (the transaction timeline). */
  async entries(accountId: string, page = 1, limit = 20) {
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.pigmyAccountId, accountId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ value: count() })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.pigmyAccountId, accountId)),
    ]);
    return { rows, total };
  }

  /**
   * Recompute balance from the ledger and compare to the stored value.
   * Used by the audit/consistency check — proves the derived balance matches
   * the sum of ledger movements.
   */
  async reconcile(accountId: string) {
    const [computed] = await this.db
      .select({
        credits: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'credit' then ${ledgerEntries.amount} else 0 end), 0)`,
        debits: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'debit' then ${ledgerEntries.amount} else 0 end), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.pigmyAccountId, accountId));

    const [acct] = await this.db
      .select({ currentBalance: pigmyAccounts.currentBalance })
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.id, accountId))
      .limit(1);
    if (!acct) throw new NotFoundException('Pigmy account not found');

    const computedBalance = Number(computed.credits) - Number(computed.debits);
    return {
      storedBalance: acct.currentBalance,
      computedBalance,
      consistent: computedBalance === acct.currentBalance,
      credits: Number(computed.credits),
      debits: Number(computed.debits),
    };
  }

  /** Find the ledger entry produced by a transaction (idempotency lookups). */
  async findEntryByTransaction(transactionId: string, runner: AppDatabase | AppTransaction = this.db) {
    const [row] = await runner
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.transactionId, transactionId)))
      .limit(1);
    return row ?? null;
  }
}
