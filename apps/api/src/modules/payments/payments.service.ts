import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { customers, pigmyAccounts, transactions, villages } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { LedgerService } from '../ledger/ledger.service';
import { PigmyService } from '../pigmy/pigmy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { formatPaise, rupeesToPaise, withRupees } from '../../common/money';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { RazorpayService } from './razorpay.service';
import { ReceiptService, type ReceiptData } from './receipt.service';
import type { CreateOrderDto, TransactionListQueryDto, VerifyPaymentDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly razorpay: RazorpayService,
    private readonly receipts: ReceiptService,
    private readonly ledger: LedgerService,
    private readonly pigmy: PigmyService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Order creation ──────────────────────────────────────────────────────

  async createOrder(customerId: string, dto: CreateOrderDto, ip?: string) {
    const account = await this.pigmy.resolvePayableAccount(customerId, dto.accountId);
    const amountPaise = dto.amountRupees ? rupeesToPaise(dto.amountRupees) : account.dailyAmount;
    if (amountPaise <= 0) throw new BadRequestException('Amount must be positive');

    // Create the pending transaction first so we have an id to use as the receipt.
    const idempotencyKey = randomUUID();
    const [txn] = await this.db
      .insert(transactions)
      .values({
        pigmyAccountId: account.id,
        amount: amountPaise,
        status: 'pending',
        gateway: this.razorpay.mode === 'live' ? 'razorpay' : 'razorpay-mock',
        idempotencyKey,
      })
      .returning();

    const order = await this.razorpay.createOrder(amountPaise, txn.id);

    await this.db
      .update(transactions)
      .set({ gatewayOrderId: order.orderId, updatedAt: new Date() })
      .where(eq(transactions.id, txn.id));

    await this.audit.record({
      actorId: customerId,
      actorType: 'customer',
      action: AuditAction.PAYMENT_ORDER_CREATED,
      entity: 'transaction',
      entityId: txn.id,
      after: { orderId: order.orderId, amount: amountPaise },
      ip,
    });

    return {
      transactionId: txn.id,
      orderId: order.orderId,
      amount: withRupees(amountPaise),
      currency: order.currency,
      keyId: order.keyId,
      mode: this.razorpay.mode,
      // Mock mode hands back a ready-made paymentId + signature so the client can
      // immediately POST /payments/verify and exercise the full settlement path.
      mock: order.mock,
    };
  }

  // ── Client-confirmed verification (server-side signature check) ───────────

  async verifyPayment(customerId: string, dto: VerifyPaymentDto, ip?: string) {
    // NEVER trust a client "success" alone — verify the signature server-side.
    this.razorpay.verifyPaymentSignature(dto.orderId, dto.paymentId, dto.signature);

    const txn = await this.findByOrderId(dto.orderId);
    const account = await this.pigmy.getByIdRaw(txn.pigmyAccountId);
    if (!account || account.customerId !== customerId) {
      throw new ForbiddenException('This order does not belong to you');
    }

    const result = await this.settle(dto.orderId, dto.paymentId, dto.signature, ip);
    return {
      verified: true,
      alreadyProcessed: result.alreadyProcessed,
      transactionId: result.transaction.id,
      status: result.transaction.status,
      newBalance: result.newBalance ? withRupees(result.newBalance) : undefined,
    };
  }

  // ── Webhook (primary trust path) ──────────────────────────────────────────

  async handleWebhook(rawBody: string, signature: string | undefined, ip?: string) {
    this.razorpay.verifyWebhookSignature(rawBody, signature);

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid webhook body');
    }

    await this.audit.record({
      actorType: 'system',
      action: AuditAction.PAYMENT_WEBHOOK,
      entity: 'webhook',
      after: { event: event?.event },
      ip,
    });

    const type: string = event?.event ?? '';
    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const orderId: string | undefined = paymentEntity?.order_id ?? orderEntity?.id;
    const paymentId: string | undefined = paymentEntity?.id ?? null;

    if (!orderId) return { received: true, ignored: 'no order id' };

    if (type === 'payment.captured' || type === 'order.paid') {
      const result = await this.settle(orderId, paymentId ?? null, null, ip);
      return { received: true, processed: !result.alreadyProcessed };
    }
    if (type === 'payment.failed') {
      await this.markFailed(orderId, paymentEntity?.error_description ?? 'payment failed', ip);
      return { received: true, failed: true };
    }
    return { received: true, ignored: type };
  }

  // ── Settlement (idempotent) ────────────────────────────────────────────────

  /**
   * Mark a transaction successful and credit the ledger — exactly once.
   * Safe under webhook retries: the ledger is idempotent per transactionId and
   * a transaction already in `success` short-circuits.
   */
  private async settle(orderId: string, paymentId: string | null, signature: string | null, ip?: string) {
    return this.db.transaction(async (tx: AppTransaction) => {
      const [txn] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.gatewayOrderId, orderId))
        .for('update')
        .limit(1);
      if (!txn) throw new NotFoundException('Transaction not found for order');

      if (txn.status === 'success') {
        const existing = await this.ledger.findEntryByTransaction(txn.id, tx);
        return {
          alreadyProcessed: true,
          transaction: txn,
          newBalance: existing?.newBalance,
        };
      }

      const [updated] = await tx
        .update(transactions)
        .set({
          status: 'success',
          gatewayPaymentId: paymentId,
          gatewaySignature: signature,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, txn.id))
        .returning();

      const ledgerResult = await this.ledger.credit(
        txn.pigmyAccountId,
        txn.amount,
        { transactionId: txn.id, actorType: 'customer', note: 'Pigmy deposit', ip },
        tx,
      );

      const account = await this.pigmy.getByIdRaw(txn.pigmyAccountId, tx);
      if (account) {
        await this.notifications.notifyCustomer(
          account.customerId,
          {
            title: 'Deposit successful',
            body: `${formatPaise(txn.amount)} credited to your pigmy account. Balance: ${formatPaise(ledgerResult.newBalance)}.`,
            category: 'transaction',
          },
          tx,
        );
      }

      await this.audit.record(
        {
          actorId: account?.customerId ?? null,
          actorType: 'customer',
          action: AuditAction.PAYMENT_SUCCESS,
          entity: 'transaction',
          entityId: txn.id,
          after: { amount: txn.amount, newBalance: ledgerResult.newBalance, paymentId },
          ip,
        },
        tx,
      );

      return { alreadyProcessed: false, transaction: updated, newBalance: ledgerResult.newBalance };
    });
  }

  private async markFailed(orderId: string, reason: string, ip?: string) {
    const [txn] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.gatewayOrderId, orderId))
      .limit(1);
    if (!txn || txn.status === 'success') return; // don't override a settled txn
    await this.db
      .update(transactions)
      .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
      .where(eq(transactions.id, txn.id));
    await this.audit.record({
      actorType: 'system',
      action: AuditAction.PAYMENT_FAILED,
      entity: 'transaction',
      entityId: txn.id,
      after: { reason },
      ip,
    });
  }

  private async findByOrderId(orderId: string) {
    const [txn] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.gatewayOrderId, orderId))
      .limit(1);
    if (!txn) throw new NotFoundException('Transaction not found for order');
    return txn;
  }

  // ── Reconciliation (recover payments whose webhook never arrived) ─────────

  /**
   * Pending transactions older than `cutoff` that have a gateway order id.
   * These are candidates whose capture callback/webhook may have been lost.
   * Side-effect free (db read only) so it is trivially testable.
   */
  async findStalePendingOrders(cutoff: Date): Promise<{ id: string; gatewayOrderId: string | null }[]> {
    return this.db
      .select({ id: transactions.id, gatewayOrderId: transactions.gatewayOrderId })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'pending'),
          isNotNull(transactions.gatewayOrderId),
          lte(transactions.createdAt, cutoff),
        ),
      );
  }

  /**
   * Sweep stale pending transactions and settle any the gateway reports as
   * captured. Reuses the idempotent `settle()` path, so a payment that a
   * late webhook later re-delivers is still credited exactly once. Runs
   * OUTSIDE any surrounding transaction (each settle() opens its own).
   * A no-op in mock mode — there is no external gateway to consult.
   */
  async reconcilePending(now: Date, staleMinutes: number): Promise<{ checked: number; settled: number }> {
    if (this.razorpay.mode !== 'live') {
      return { checked: 0, settled: 0 };
    }
    const cutoff = new Date(now.getTime() - staleMinutes * 60_000);
    const stale = await this.findStalePendingOrders(cutoff);
    let settled = 0;
    for (const t of stale) {
      if (!t.gatewayOrderId) continue;
      try {
        const status = await this.razorpay.fetchOrderStatus(t.gatewayOrderId);
        if (status.paid) {
          await this.settle(t.gatewayOrderId, status.paymentId, null, 'reconciler');
          settled += 1;
        }
      } catch (err) {
        this.logger.error(`Reconcile failed for order ${t.gatewayOrderId}`, err as Error);
      }
    }
    if (stale.length > 0) {
      this.logger.log(`Reconciliation: settled ${settled}/${stale.length} stale pending payment(s).`);
    }
    return { checked: stale.length, settled };
  }

  // ── Listings ────────────────────────────────────────────────────────────

  private serializeTxn(t: typeof transactions.$inferSelect) {
    return {
      id: t.id,
      amount: withRupees(t.amount),
      status: t.status,
      gateway: t.gateway,
      gatewayOrderId: t.gatewayOrderId,
      gatewayPaymentId: t.gatewayPaymentId,
      failureReason: t.failureReason,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async listForCustomer(customerId: string, page: number, limit: number) {
    const joinOwned = and(
      eq(transactions.pigmyAccountId, pigmyAccounts.id),
      eq(pigmyAccounts.customerId, customerId),
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({ txn: transactions })
        .from(transactions)
        .innerJoin(pigmyAccounts, joinOwned)
        .orderBy(desc(transactions.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ value: count() })
        .from(transactions)
        .innerJoin(pigmyAccounts, joinOwned),
    ]);
    return { rows: rows.map((r) => this.serializeTxn(r.txn)), total };
  }

  async getForCustomer(customerId: string, txnId: string) {
    const [row] = await this.db
      .select({ txn: transactions })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .where(and(eq(transactions.id, txnId), eq(pigmyAccounts.customerId, customerId)))
      .limit(1);
    if (!row) throw new NotFoundException('Transaction not found');
    return this.serializeTxn(row.txn);
  }

  async adminList(actor: AdminPrincipal, q: TransactionListQueryDto) {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (q.status) conds.push(eq(transactions.status, q.status));
    if (q.villageId) {
      assertVillageAccess(actor, q.villageId);
      conds.push(eq(customers.villageId, q.villageId));
    }
    if (q.from) conds.push(gte(transactions.createdAt, new Date(q.from)));
    if (q.to) conds.push(lte(transactions.createdAt, new Date(q.to)));
    const where = and(...conds.filter(Boolean));

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          txn: transactions,
          customerName: customers.name,
          customerMobile: customers.mobile,
          villageName: villages.name,
          accountNumber: pigmyAccounts.accountNumber,
        })
        .from(transactions)
        .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
        .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
        .innerJoin(villages, eq(villages.id, customers.villageId))
        .where(where)
        .orderBy(desc(transactions.createdAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db
        .select({ value: count() })
        .from(transactions)
        .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
        .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
        .where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        ...this.serializeTxn(r.txn),
        customer: { name: r.customerName, mobile: r.customerMobile },
        village: r.villageName,
        accountNumber: r.accountNumber,
      })),
      total,
    };
  }

  // ── Receipt ────────────────────────────────────────────────────────────

  async buildReceipt(txnId: string, opts: { customerId?: string; actor?: AdminPrincipal }): Promise<Buffer> {
    const [row] = await this.db
      .select({
        txn: transactions,
        customerId: customers.id,
        customerName: customers.name,
        customerMobile: customers.mobile,
        villageId: customers.villageId,
        villageName: villages.name,
        accountNumber: pigmyAccounts.accountNumber,
      })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .innerJoin(customers, eq(customers.id, pigmyAccounts.customerId))
      .innerJoin(villages, eq(villages.id, customers.villageId))
      .where(eq(transactions.id, txnId))
      .limit(1);
    if (!row) throw new NotFoundException('Transaction not found');

    if (opts.customerId && row.customerId !== opts.customerId) {
      throw new ForbiddenException('Not your transaction');
    }
    if (opts.actor) assertVillageAccess(opts.actor, row.villageId);
    if (row.txn.status !== 'success') {
      throw new BadRequestException('Receipt available only for successful payments');
    }

    const entry = await this.ledger.findEntryByTransaction(txnId);
    const data: ReceiptData = {
      receiptNo: row.txn.id,
      date: row.txn.updatedAt,
      customerName: row.customerName,
      customerMobile: row.customerMobile,
      villageName: row.villageName,
      accountNumber: row.accountNumber,
      amountPaise: row.txn.amount,
      balanceAfterPaise: entry?.newBalance ?? 0,
      paymentId: row.txn.gatewayPaymentId,
      orderId: row.txn.gatewayOrderId,
      status: row.txn.status,
    };
    return this.receipts.generate(data);
  }
}
