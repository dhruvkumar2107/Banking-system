import { Injectable } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { PaymentsService } from '../payments/payments.service';
import { PigmyService } from '../pigmy/pigmy.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { withRupees } from '../../common/money';

/**
 * Customer self-service facade. Every method is keyed by the authenticated
 * customer's own id (never a path param), so a customer can only ever reach
 * their own data. Heavy lifting is delegated to the domain services.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly customers: CustomersService,
    private readonly payments: PaymentsService,
    private readonly pigmy: PigmyService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Home screen: profile summary, primary account, recent activity, unread count. */
  async dashboard(customerId: string) {
    const [profile, recent, unread] = await Promise.all([
      this.customers.fullProfile(customerId),
      this.payments.listForCustomer(customerId, 1, 5),
      this.notifications.unreadCount(customerId),
    ]);

    const primaryAccount = profile.pigmyAccounts[0] ?? null;
    const totalBalancePaise = profile.pigmyAccounts.reduce((sum, a) => sum + a.currentBalance.paise, 0);

    return {
      customer: {
        id: profile.id,
        name: profile.name,
        mobile: profile.mobile,
        kycStatus: profile.kycStatus,
        village: profile.village,
      },
      primaryAccount,
      accounts: profile.pigmyAccounts,
      totalBalance: withRupees(totalBalancePaise),
      recentTransactions: recent.rows,
      unreadNotifications: unread.unread,
    };
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  profile(customerId: string) {
    return this.customers.fullProfile(customerId);
  }

  updateProfile(customerId: string, dto: Parameters<CustomersService['updateProfile']>[1], ip?: string) {
    return this.customers.updateProfile(customerId, dto, { type: 'customer', id: customerId }, ip);
  }

  // ── Accounts + ledger ────────────────────────────────────────────────────────
  async accounts(customerId: string) {
    const profile = await this.customers.fullProfile(customerId);
    return profile.pigmyAccounts;
  }

  async accountLedger(customerId: string, accountId: string, page: number, limit: number) {
    // Ownership check: throws 404 if the account isn't this customer's.
    await this.pigmy.getAccountForCustomer(customerId, accountId);
    const { rows, total } = await this.ledger.entries(accountId, page, limit);
    return {
      rows: rows.map((e) => ({
        id: e.id,
        type: e.type,
        amount: withRupees(e.amount),
        balanceAfter: withRupees(e.newBalance),
        note: e.note,
        transactionId: e.transactionId,
        createdAt: e.createdAt,
      })),
      total,
    };
  }

  // ── Transactions / payments ──────────────────────────────────────────────────
  // Payment creation/verification and transaction history live in PaymentsController
  // (/payments/*). Notifications live in NotificationsController (/notifications).
  // `/me` owns only the aggregated dashboard plus profile/account/KYC self-service.

  // ── Nominees ───────────────────────────────────────────────────────────────
  listNominees(customerId: string) {
    return this.customers.listNominees(customerId);
  }

  addNominee(customerId: string, dto: Parameters<CustomersService['addNominee']>[1], ip?: string) {
    return this.customers.addNominee(customerId, dto, customerId, 'customer', ip);
  }

  deleteNominee(customerId: string, nomineeId: string, ip?: string) {
    return this.customers.deleteNominee(customerId, nomineeId, customerId, 'customer', ip);
  }

  // ── Documents ────────────────────────────────────────────────────────────────
  listDocuments(customerId: string) {
    return this.customers.listDocuments(customerId);
  }

  addDocument(customerId: string, dto: Parameters<CustomersService['addDocument']>[1], ip?: string) {
    return this.customers.addDocument(customerId, dto, customerId, 'customer', ip);
  }

  // ── Bank details ─────────────────────────────────────────────────────────────
  getBankDetails(customerId: string) {
    return this.customers.getBankDetails(customerId);
  }

  upsertBankDetails(customerId: string, dto: Parameters<CustomersService['upsertBankDetails']>[1], ip?: string) {
    return this.customers.upsertBankDetails(customerId, dto, customerId, 'customer', ip);
  }
}
