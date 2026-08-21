import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import {
  admins,
  customerBankDetails,
  customers,
  pigmyAccounts,
  villages,
  withdrawalRequests,
  type WithdrawalRequest,
} from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rupeesToPaise, withRupees } from '../../common/money';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import {
  daysBetween,
  penaltyPaise,
  SchemeService,
  simpleInterestPaise,
} from './scheme.service';
import type {
  ApproveWithdrawalDto,
  CreateWithdrawalDto,
  PayWithdrawalDto,
  PayoutMethod,
  RejectWithdrawalDto,
  WithdrawalListQueryDto,
} from './withdrawals.dto';

/** Show only the last 4 digits of an account number — never store/log the rest. */
function mask(accountNumber: string): string {
  const last4 = accountNumber.length > 4 ? accountNumber.slice(-4) : accountNumber;
  return `XXXX${last4}`;
}

/**
 * Withdrawal engine — maker-checker.
 *
 * A customer *requests*; an admin *decides*; a payout is *recorded*. Money only
 * ever leaves the ledger at the final `pay` step, and only for an `approved`
 * request. That separation is the whole point: no single actor can move money
 * out on their own, and every transition leaves an audit row.
 *
 * State machine (enforced by `assertTransition`):
 *   pending → approved → paid
 *   pending → rejected            (admin, reason required)
 *   pending → cancelled           (customer, own request only)
 *
 * The ledger DEBIT is posted inside the same DB transaction that flips the
 * request to `paid`, so a crash can never pay out without recording it (or
 * record it without paying). Balance stays derived — this service never writes
 * `current_balance` itself, it always goes through LedgerService.
 */
@Injectable()
export class WithdrawalsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly scheme: SchemeService,
  ) {}

  // ── serialization ──────────────────────────────────────────────────────────
  private serialize(r: WithdrawalRequest) {
    const net = r.amount + r.interest - r.penalty;
    return {
      id: r.id,
      customerId: r.customerId,
      pigmyAccountId: r.pigmyAccountId,
      kind: r.kind,
      status: r.status,
      amount: withRupees(r.amount),
      penalty: withRupees(r.penalty),
      interest: withRupees(r.interest),
      netPayable: withRupees(net),
      payoutMethod: r.payoutMethod,
      bankAccountMasked: r.bankAccountMasked,
      bankIfsc: r.bankIfsc,
      reference: r.reference,
      note: r.note,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      paidAt: r.paidAt,
      decidedById: r.decidedById,
    };
  }

  /** Guard every state change through one place. */
  private assertTransition(current: WithdrawalRequest['status'], next: WithdrawalRequest['status']) {
    const allowed: Record<string, string[]> = {
      pending: ['approved', 'rejected', 'cancelled'],
      approved: ['paid'],
      paid: [],
      rejected: [],
      cancelled: [],
    };
    if (!allowed[current]?.includes(next)) {
      throw new BadRequestException(
        `Cannot move a ${current} withdrawal request to ${next}`,
      );
    }
  }

  // ── quote ──────────────────────────────────────────────────────────────────
  /**
   * What a customer would actually receive today, without creating anything.
   * Powers the "you'll get ₹X (₹Y penalty)" preview in the app before they
   * commit, so the penalty is never a surprise after the fact.
   */
  async quote(customerId: string, accountId?: string, kind: 'partial' | 'closure' = 'closure', amountRupees?: number) {
    const acct = await this.resolveOwnAccount(customerId, accountId);
    const s = await this.scheme.current();
    const now = new Date();

    const principal =
      kind === 'closure' ? acct.currentBalance : rupeesToPaise(amountRupees ?? 0);
    const matured = this.isMatured(acct, now);
    const heldDays = daysBetween(new Date(acct.createdAt), now);

    // Interest is only paid on a matured closure — an early exit forfeits it.
    const interest =
      matured && kind === 'closure' && !acct.interestCreditedAt
        ? simpleInterestPaise(acct.currentBalance, acct.interestRateBps, Math.min(heldDays, acct.termDays))
        : 0;
    const penalty = matured ? 0 : penaltyPaise(principal, s.earlyPenaltyBps);

    return {
      accountId: acct.id,
      accountNumber: acct.accountNumber,
      kind,
      matured,
      maturityDate: acct.maturityDate,
      daysHeld: heldDays,
      termDays: acct.termDays,
      interestRatePercent: acct.interestRateBps / 100,
      currentBalance: withRupees(acct.currentBalance),
      requestedAmount: withRupees(principal),
      interest: withRupees(interest),
      penalty: withRupees(penalty),
      netPayable: withRupees(Math.max(0, principal + interest - penalty)),
      earlyWithdrawalAllowed: s.earlyWithdrawalAllowed,
      minBalance: withRupees(s.minBalancePaise),
    };
  }

  private isMatured(
    acct: { maturityDate: Date | string | null; maturedAt: Date | string | null },
    now: Date,
  ): boolean {
    if (acct.maturedAt) return true;
    if (!acct.maturityDate) return false;
    const d = acct.maturityDate instanceof Date ? acct.maturityDate : new Date(acct.maturityDate);
    return d.getTime() <= now.getTime();
  }

  /** Load an account and prove it belongs to this customer. */
  private async resolveOwnAccount(customerId: string, accountId?: string) {
    const rows = await this.db
      .select()
      .from(pigmyAccounts)
      .where(
        accountId
          ? eq(pigmyAccounts.id, accountId)
          : eq(pigmyAccounts.customerId, customerId),
      )
      .orderBy(desc(pigmyAccounts.createdAt))
      .limit(1);
    const acct = rows[0];
    if (!acct) throw new NotFoundException('No pigmy account found');
    if (acct.customerId !== customerId) throw new ForbiddenException('Not your account');
    return acct;
  }

  // ── customer: create ───────────────────────────────────────────────────────
  /**
   * Raise a withdrawal request. Validates against the live balance and the
   * scheme rules, computes penalty/interest, and snapshots the payout
   * destination. Creates NO ledger movement — that waits for approval + payout.
   */
  async create(customerId: string, dto: CreateWithdrawalDto, ip?: string) {
    const acct = await this.resolveOwnAccount(customerId, dto.accountId);
    if (acct.status === 'closed') {
      throw new BadRequestException('This account is already closed');
    }
    if (acct.currentBalance <= 0) {
      throw new BadRequestException('There is no balance to withdraw');
    }

    const s = await this.scheme.current();
    const now = new Date();
    const matured = this.isMatured(acct, now);

    if (!matured && !s.earlyWithdrawalAllowed) {
      throw new BadRequestException(
        'Early withdrawal is not permitted under the current scheme. Please wait until maturity.',
      );
    }

    // One open request per account at a time — otherwise two pending requests
    // could each pass the balance check and jointly overdraw the account.
    const [open] = await this.db
      .select({ id: withdrawalRequests.id, status: withdrawalRequests.status })
      .from(withdrawalRequests)
      .where(
        and(
          eq(withdrawalRequests.pigmyAccountId, acct.id),
          or(eq(withdrawalRequests.status, 'pending'), eq(withdrawalRequests.status, 'approved')),
        ),
      )
      .limit(1);
    if (open) {
      throw new BadRequestException(
        `A ${open.status} withdrawal request already exists for this account`,
      );
    }

    const isClosure = dto.kind === 'closure';
    const amount = isClosure ? acct.currentBalance : rupeesToPaise(dto.amountRupees ?? 0);

    if (!isClosure) {
      if (!dto.amountRupees || amount <= 0) {
        throw new BadRequestException('amountRupees is required for a partial withdrawal');
      }
      if (amount > acct.currentBalance) {
        throw new BadRequestException('Amount exceeds the available balance');
      }
      const remaining = acct.currentBalance - amount;
      if (remaining < s.minBalancePaise) {
        throw new BadRequestException(
          `A minimum balance of ${withRupees(s.minBalancePaise).display} must remain in the account`,
        );
      }
    }

    const heldDays = daysBetween(new Date(acct.createdAt), now);
    const interest =
      matured && isClosure && !acct.interestCreditedAt
        ? simpleInterestPaise(acct.currentBalance, acct.interestRateBps, Math.min(heldDays, acct.termDays))
        : 0;
    const penalty = matured ? 0 : penaltyPaise(amount, s.earlyPenaltyBps);

    const payoutMethod: PayoutMethod = dto.payoutMethod ?? 'bank_transfer';

    // Snapshot where the money is going. For a bank transfer the customer must
    // already have bank details on file; only the masked number + IFSC are kept
    // on the request (the full number stays in customer_bank_details).
    let bankAccountMasked: string | null = null;
    let bankIfsc: string | null = null;
    if (payoutMethod === 'bank_transfer') {
      const [bank] = await this.db
        .select()
        .from(customerBankDetails)
        .where(eq(customerBankDetails.customerId, customerId))
        .orderBy(desc(customerBankDetails.updatedAt))
        .limit(1);
      if (!bank) {
        throw new BadRequestException(
          'Add your bank account details before requesting a bank transfer, or choose cash at branch',
        );
      }
      bankAccountMasked = mask(bank.accountNumber);
      bankIfsc = bank.ifsc;
    }

    const [row] = await this.db
      .insert(withdrawalRequests)
      .values({
        customerId,
        pigmyAccountId: acct.id,
        kind: isClosure ? 'closure' : 'partial',
        amount,
        penalty,
        interest,
        payoutMethod,
        bankAccountMasked,
        bankIfsc,
        note: dto.note ?? null,
        status: 'pending',
      })
      .returning();

    await this.audit.record({
      actorId: customerId,
      actorType: 'customer',
      action: AuditAction.WITHDRAWAL_REQUESTED,
      entity: 'withdrawal_request',
      entityId: row.id,
      after: {
        kind: row.kind,
        amount,
        penalty,
        interest,
        payoutMethod,
        accountId: acct.id,
        matured,
      },
      ip,
    });

    await this.notifications.notifyCustomer(customerId, {
      title: 'Withdrawal request received',
      body: `Your request to withdraw ${withRupees(amount).display} is pending approval. We'll notify you once it's reviewed.`,
      category: 'transaction',
    });

    return this.serialize(row);
  }

  // ── customer: list / cancel ────────────────────────────────────────────────
  async listForCustomer(customerId: string, page: number, limit: number) {
    const where = eq(withdrawalRequests.customerId, customerId);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(withdrawalRequests)
        .where(where)
        .orderBy(desc(withdrawalRequests.requestedAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(withdrawalRequests).where(where),
    ]);
    return { rows: rows.map((r) => this.serialize(r)), total };
  }

  async cancel(customerId: string, requestId: string, ip?: string) {
    const [row] = await this.db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.id, requestId))
      .limit(1);
    if (!row) throw new NotFoundException('Withdrawal request not found');
    if (row.customerId !== customerId) throw new ForbiddenException('Not your request');
    this.assertTransition(row.status, 'cancelled');

    const [updated] = await this.db
      .update(withdrawalRequests)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(eq(withdrawalRequests.id, requestId))
      .returning();

    await this.audit.record({
      actorId: customerId,
      actorType: 'customer',
      action: AuditAction.WITHDRAWAL_CANCELLED,
      entity: 'withdrawal_request',
      entityId: requestId,
      before: { status: row.status },
      after: { status: 'cancelled' },
      ip,
    });
    return this.serialize(updated);
  }

  // ── admin: list / detail ───────────────────────────────────────────────────
  /** Village-scoped queue. Joins customer + village so the admin sees who/where. */
  async listForAdmin(actor: AdminPrincipal, q: WithdrawalListQueryDto) {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (q.status) conds.push(eq(withdrawalRequests.status, q.status));
    if (q.kind) conds.push(eq(withdrawalRequests.kind, q.kind));
    if (q.villageId) {
      assertVillageAccess(actor, q.villageId);
      conds.push(eq(customers.villageId, q.villageId));
    }
    if (q.search) {
      conds.push(
        or(
          ilike(customers.name, `%${q.search}%`),
          ilike(customers.mobile, `%${q.search}%`),
          ilike(pigmyAccounts.accountNumber, `%${q.search}%`),
        ),
      );
    }
    const where = and(...conds.filter(Boolean));

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          req: withdrawalRequests,
          customerName: customers.name,
          customerMobile: customers.mobile,
          villageName: villages.name,
          accountNumber: pigmyAccounts.accountNumber,
          accountBalance: pigmyAccounts.currentBalance,
        })
        .from(withdrawalRequests)
        .innerJoin(customers, eq(customers.id, withdrawalRequests.customerId))
        .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, withdrawalRequests.pigmyAccountId))
        .innerJoin(villages, eq(villages.id, customers.villageId))
        .where(where)
        .orderBy(desc(withdrawalRequests.requestedAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db
        .select({ value: count() })
        .from(withdrawalRequests)
        .innerJoin(customers, eq(customers.id, withdrawalRequests.customerId))
        .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, withdrawalRequests.pigmyAccountId))
        .where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        ...this.serialize(r.req),
        customer: { name: r.customerName, mobile: r.customerMobile },
        village: r.villageName,
        accountNumber: r.accountNumber,
        accountBalance: withRupees(Number(r.accountBalance)),
      })),
      total,
    };
  }

  /** How many requests are awaiting a decision (drives the sidebar badge). */
  async pendingCount(actor: AdminPrincipal) {
    const conds = [
      villageScopeFilter(actor, customers.villageId),
      eq(withdrawalRequests.status, 'pending'),
    ];
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(withdrawalRequests)
      .innerJoin(customers, eq(customers.id, withdrawalRequests.customerId))
      .where(and(...conds.filter(Boolean)));
    return { pending: value };
  }

  /** One request with everything an approver needs, village-scoped. */
  async getForAdmin(requestId: string, actor: AdminPrincipal) {
    const [row] = await this.db
      .select({
        req: withdrawalRequests,
        customerId: customers.id,
        customerName: customers.name,
        customerMobile: customers.mobile,
        villageId: customers.villageId,
        villageName: villages.name,
        account: pigmyAccounts,
        decidedByName: admins.name,
      })
      .from(withdrawalRequests)
      .innerJoin(customers, eq(customers.id, withdrawalRequests.customerId))
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, withdrawalRequests.pigmyAccountId))
      .innerJoin(villages, eq(villages.id, customers.villageId))
      .leftJoin(admins, eq(admins.id, withdrawalRequests.decidedById))
      .where(eq(withdrawalRequests.id, requestId))
      .limit(1);
    if (!row) throw new NotFoundException('Withdrawal request not found');
    assertVillageAccess(actor, row.villageId);

    return {
      ...this.serialize(row.req),
      customer: { id: row.customerId, name: row.customerName, mobile: row.customerMobile },
      village: { id: row.villageId, name: row.villageName },
      account: {
        id: row.account.id,
        accountNumber: row.account.accountNumber,
        status: row.account.status,
        currentBalance: withRupees(row.account.currentBalance),
        totalDeposited: withRupees(row.account.totalDeposited),
        maturityDate: row.account.maturityDate,
        termDays: row.account.termDays,
        interestRatePercent: row.account.interestRateBps / 100,
        matured: this.isMatured(row.account, new Date()),
      },
      decidedBy: row.decidedByName ?? null,
    };
  }

  /** Load a request for mutation, enforcing village scope. Returns the raw row. */
  private async loadForDecision(requestId: string, actor: AdminPrincipal) {
    const [row] = await this.db
      .select({ req: withdrawalRequests, villageId: customers.villageId })
      .from(withdrawalRequests)
      .innerJoin(customers, eq(customers.id, withdrawalRequests.customerId))
      .where(eq(withdrawalRequests.id, requestId))
      .limit(1);
    if (!row) throw new NotFoundException('Withdrawal request not found');
    assertVillageAccess(actor, row.villageId);
    return row.req;
  }

  // ── admin: approve / reject ────────────────────────────────────────────────
  /**
   * Approve — the "checker" half of maker-checker. Still no money movement:
   * approval only authorises the payout, which is recorded separately. Re-checks
   * the balance because deposits/other debits may have landed since the request.
   */
  async approve(requestId: string, dto: ApproveWithdrawalDto, actor: AdminPrincipal, ip?: string) {
    const req = await this.loadForDecision(requestId, actor);
    this.assertTransition(req.status, 'approved');

    const [acct] = await this.db
      .select()
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.id, req.pigmyAccountId))
      .limit(1);
    if (!acct) throw new NotFoundException('Pigmy account not found');
    if (req.amount > acct.currentBalance) {
      throw new BadRequestException(
        `Balance has changed — the account now holds ${withRupees(acct.currentBalance).display}, less than the requested ${withRupees(req.amount).display}. Reject this request and ask the customer to raise a new one.`,
      );
    }

    const [updated] = await this.db
      .update(withdrawalRequests)
      .set({
        status: 'approved',
        decidedAt: new Date(),
        decidedById: actor.sub,
        note: dto.note ?? req.note,
      })
      .where(eq(withdrawalRequests.id, requestId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.WITHDRAWAL_APPROVED,
      entity: 'withdrawal_request',
      entityId: requestId,
      before: { status: req.status },
      after: { status: 'approved', amount: req.amount, note: dto.note ?? null },
      ip,
    });

    await this.notifications.notifyCustomer(req.customerId, {
      title: 'Withdrawal approved',
      body: `Your withdrawal of ${withRupees(req.amount).display} has been approved and will be paid out shortly.`,
      category: 'transaction',
    });

    return this.serialize(updated);
  }

  async reject(requestId: string, dto: RejectWithdrawalDto, actor: AdminPrincipal, ip?: string) {
    const req = await this.loadForDecision(requestId, actor);
    this.assertTransition(req.status, 'rejected');

    const [updated] = await this.db
      .update(withdrawalRequests)
      .set({
        status: 'rejected',
        decidedAt: new Date(),
        decidedById: actor.sub,
        note: dto.reason,
      })
      .where(eq(withdrawalRequests.id, requestId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.WITHDRAWAL_REJECTED,
      entity: 'withdrawal_request',
      entityId: requestId,
      before: { status: req.status },
      after: { status: 'rejected', reason: dto.reason },
      ip,
    });

    await this.notifications.notifyCustomer(req.customerId, {
      title: 'Withdrawal request declined',
      body: `Your withdrawal request was declined. Reason: ${dto.reason}`,
      category: 'transaction',
    });

    return this.serialize(updated);
  }

  // ── admin: record the payout (the only step that moves money) ──────────────
  /**
   * Record that the money has actually been handed over, and post the ledger
   * DEBIT for it. Everything happens in ONE transaction:
   *
   *   1. re-read + flip the request to `paid` (guarded so a concurrent call
   *      cannot pay the same request twice),
   *   2. credit maturity interest (if any) so it appears as its own ledger line,
   *   3. debit principal + penalty,
   *   4. close the account when the request was a closure.
   *
   * Interest is credited *before* the debit so the passbook reads in a way a
   * customer can follow: interest in, then the payout out.
   *
   * NOTE (PGlite): every call inside the transaction passes `tx` — PGlite has a
   * single connection, so touching `this.db` in here would deadlock.
   */
  async pay(requestId: string, dto: PayWithdrawalDto, actor: AdminPrincipal, ip?: string) {
    const req = await this.loadForDecision(requestId, actor);
    this.assertTransition(req.status, 'paid');

    const payoutMethod = dto.payoutMethod ?? req.payoutMethod;

    // Read the account's SNAPSHOTTED rate up front (outside the tx) so the
    // interest note quotes the rate this account was opened on, not whatever the
    // scheme happens to say today.
    const [acctBefore] = await this.db
      .select({ interestRateBps: pigmyAccounts.interestRateBps })
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.id, req.pigmyAccountId))
      .limit(1);
    if (!acctBefore) throw new NotFoundException('Pigmy account not found');
    const ratePercent = acctBefore.interestRateBps / 100;

    return this.db.transaction(async (tx: AppTransaction) => {
      // 1. Claim the request. The status predicate makes this a compare-and-set:
      //    a second concurrent payout finds no row and aborts.
      const claimed = await tx
        .update(withdrawalRequests)
        .set({
          status: 'paid',
          paidAt: new Date(),
          reference: dto.reference,
          payoutMethod,
          decidedById: req.decidedById ?? actor.sub,
        })
        .where(and(eq(withdrawalRequests.id, requestId), eq(withdrawalRequests.status, 'approved')))
        .returning();
      if (claimed.length === 0) {
        throw new BadRequestException('This request is no longer awaiting payout');
      }
      const updated = claimed[0];

      // 2. Maturity interest, as its own credit line.
      if (req.interest > 0) {
        await this.ledger.credit(
          req.pigmyAccountId,
          req.interest,
          {
            note: `Maturity interest @ ${ratePercent}% p.a.`,
            actorId: actor.sub,
            actorType: 'admin',
            ip,
          },
          tx,
        );
        await tx
          .update(pigmyAccounts)
          .set({ interestCreditedAt: new Date() })
          .where(eq(pigmyAccounts.id, req.pigmyAccountId));

        await this.audit.record(
          {
            actorId: actor.sub,
            actorType: 'admin',
            action: AuditAction.PIGMY_INTEREST_CREDITED,
            entity: 'pigmy_account',
            entityId: req.pigmyAccountId,
            after: { interest: req.interest, withdrawalRequestId: requestId },
            ip,
          },
          tx,
        );
      }

      // 3. The payout debit. `amount` is the GROSS sum drawn from the account;
      //    the penalty is deducted *from* it, not charged on top, so the two
      //    debits always sum to exactly `amount` and can never exceed the
      //    balance that was validated at request + approval time. (Charging the
      //    penalty on top would make an early closure unpayable: the principal
      //    debit would empty the account and the penalty would then fail.)
      //    They are two lines, not one, so the passbook shows what was deducted.
      const netToCustomer = req.amount - req.penalty;
      const method = payoutMethod === 'cash' ? 'cash' : 'bank transfer';
      const debitNote =
        req.kind === 'closure'
          ? `Account closure payout (${method}) ref ${dto.reference}`
          : `Withdrawal payout (${method}) ref ${dto.reference}`;

      let balanceAfter: number | null = null;

      if (netToCustomer > 0) {
        const principalResult = await this.ledger.debit(
          req.pigmyAccountId,
          netToCustomer,
          { note: debitNote, actorId: actor.sub, actorType: 'admin', ip },
          tx,
        );
        balanceAfter = principalResult.newBalance;
      }

      if (req.penalty > 0) {
        const penaltyResult = await this.ledger.debit(
          req.pigmyAccountId,
          req.penalty,
          {
            note: 'Early withdrawal penalty',
            actorId: actor.sub,
            actorType: 'admin',
            ip,
          },
          tx,
        );
        balanceAfter = penaltyResult.newBalance;
      }

      // 4. A closure empties and closes the account.
      if (req.kind === 'closure' || req.kind === 'maturity') {
        await tx
          .update(pigmyAccounts)
          .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
          .where(eq(pigmyAccounts.id, req.pigmyAccountId));
      }

      await this.audit.record(
        {
          actorId: actor.sub,
          actorType: 'admin',
          action: AuditAction.WITHDRAWAL_PAID,
          entity: 'withdrawal_request',
          entityId: requestId,
          before: { status: 'approved' },
          after: {
            status: 'paid',
            amount: req.amount,
            penalty: req.penalty,
            interest: req.interest,
            payoutMethod,
            reference: dto.reference,
            closedAccount: req.kind !== 'partial',
          },
          ip,
        },
        tx,
      );

      const net = req.amount + req.interest - req.penalty;
      await this.notifications.notifyCustomer(
        req.customerId,
        {
          title: 'Withdrawal paid',
          body:
            payoutMethod === 'cash'
              ? `${withRupees(net).display} has been paid out in cash. Voucher ${dto.reference}.`
              : `${withRupees(net).display} has been transferred to your bank account. Reference ${dto.reference}.`,
          category: 'transaction',
        },
        tx,
      );

      // If nothing was debited at all (a zero-amount edge case) fall back to a
      // fresh read so the caller still gets a truthful balance.
      if (balanceAfter === null) {
        const [acct] = await tx
          .select({ currentBalance: pigmyAccounts.currentBalance })
          .from(pigmyAccounts)
          .where(eq(pigmyAccounts.id, req.pigmyAccountId))
          .limit(1);
        balanceAfter = acct?.currentBalance ?? 0;
      }

      return {
        ...this.serialize(updated),
        balanceAfter: withRupees(balanceAfter),
        accountClosed: req.kind !== 'partial',
      };
    });
  }
}
