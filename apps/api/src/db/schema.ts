import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Digital Pigmee schema.
 *
 * MONEY: every monetary value is stored as an integer number of **paise**
 * (1 rupee = 100 paise) using bigint. Never floats — this is a ledger.
 *
 * GOLDEN RULE: pigmy_accounts.current_balance / total_deposited are DERIVED.
 * They are only ever written by the ledger service inside the same transaction
 * that inserts the corresponding ledger_entries row.
 */

// ── Enums ───────────────────────────────────────────────────────────────────
export const kycStatusEnum = pgEnum('kyc_status', ['pending', 'verified', 'rejected']);
export const docStatusEnum = pgEnum('doc_status', ['pending', 'verified', 'rejected']);
export const pigmyStatusEnum = pgEnum('pigmy_status', ['active', 'inactive', 'closed']);
export const txnStatusEnum = pgEnum('txn_status', ['pending', 'success', 'failed']);
export const ledgerTypeEnum = pgEnum('ledger_type', ['credit', 'debit']);
export const adminRoleEnum = pgEnum('admin_role', ['superadmin', 'admin', 'agent']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'registration']);
export const subjectTypeEnum = pgEnum('subject_type', ['customer', 'admin']);
export const actorTypeEnum = pgEnum('actor_type', ['customer', 'admin', 'system']);
export const notifCategoryEnum = pgEnum('notif_category', ['system', 'transaction', 'broadcast']);
export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
  'pending',
  'approved',
  'paid',
  'rejected',
  'cancelled',
]);
export const withdrawalKindEnum = pgEnum('withdrawal_kind', ['partial', 'closure', 'maturity']);
export const payoutMethodEnum = pgEnum('payout_method', ['bank_transfer', 'cash']);

const money = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

// ── Villages ────────────────────────────────────────────────────────────────
export const villages = pgTable('villages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  createdAt: createdAt(),
});

// ── Customers ───────────────────────────────────────────────────────────────
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    villageId: uuid('village_id')
      .notNull()
      .references(() => villages.id),
    name: text('name').notNull(),
    mobile: text('mobile').notNull(),
    address: text('address'),
    photoUrl: text('photo_url'),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    mobileIdx: uniqueIndex('customers_mobile_uq').on(t.mobile),
    villageIdx: index('customers_village_idx').on(t.villageId),
  }),
);

// ── Nominees ────────────────────────────────────────────────────────────────
export const nominees = pgTable(
  'nominees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name').notNull(),
    relation: text('relation'),
    mobile: text('mobile'),
    address: text('address'),
    createdAt: createdAt(),
  },
  (t) => ({ customerIdx: index('nominees_customer_idx').on(t.customerId) }),
);

// ── Customer documents (KYC) ────────────────────────────────────────────────
export const customerDocuments = pgTable(
  'customer_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    docType: text('doc_type').notNull(), // aadhaar, pan, voter_id, ...
    fileUrl: text('file_url').notNull(),
    verifiedStatus: docStatusEnum('verified_status').notNull().default('pending'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ customerIdx: index('documents_customer_idx').on(t.customerId) }),
);

// ── Customer bank details ───────────────────────────────────────────────────
export const customerBankDetails = pgTable(
  'customer_bank_details',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    accountNumber: text('account_number').notNull(),
    ifsc: text('ifsc').notNull(),
    accountHolderName: text('account_holder_name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ customerIdx: index('bank_details_customer_idx').on(t.customerId) }),
);

// ── Pigmy accounts ──────────────────────────────────────────────────────────
export const pigmyAccounts = pgTable(
  'pigmy_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    accountNumber: text('account_number').notNull().unique(),
    dailyAmount: money('daily_amount').notNull(), // paise
    // DERIVED — only written by the ledger service:
    currentBalance: money('current_balance').notNull().default(0),
    totalDeposited: money('total_deposited').notNull().default(0),
    status: pigmyStatusEnum('status').notNull().default('active'),
    // ── Scheme terms, SNAPSHOTTED at account opening ────────────────────────
    // Copied from scheme_settings when the account is created so that a later
    // change to the bank's scheme never silently re-prices an existing account.
    termDays: integer('term_days').notNull().default(365),
    interestRateBps: integer('interest_rate_bps').notNull().default(400), // 400 bps = 4.00% p.a.
    maturityDate: timestamp('maturity_date', { withTimezone: true }),
    /** Set once interest has been credited at maturity — prevents double credit. */
    interestCreditedAt: timestamp('interest_credited_at', { withTimezone: true }),
    maturedAt: timestamp('matured_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    customerIdx: index('pigmy_customer_idx').on(t.customerId),
    maturityIdx: index('pigmy_maturity_idx').on(t.maturityDate),
  }),
);

// ── Transactions (payment attempts) ─────────────────────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pigmyAccountId: uuid('pigmy_account_id')
      .notNull()
      .references(() => pigmyAccounts.id),
    amount: money('amount').notNull(), // paise
    currency: text('currency').notNull().default('INR'),
    gateway: text('gateway').notNull().default('razorpay'),
    gatewayOrderId: text('gateway_order_id'),
    gatewayPaymentId: text('gateway_payment_id'),
    gatewaySignature: text('gateway_signature'),
    idempotencyKey: text('idempotency_key'),
    status: txnStatusEnum('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    pigmyIdx: index('txn_pigmy_idx').on(t.pigmyAccountId),
    statusIdx: index('txn_status_idx').on(t.status),
    createdIdx: index('txn_created_idx').on(t.createdAt),
    // Postgres treats NULLs as distinct, so these allow many pending rows
    // but enforce uniqueness once a real gateway id / idempotency key exists.
    orderUq: uniqueIndex('txn_order_uq').on(t.gatewayOrderId),
    paymentUq: uniqueIndex('txn_payment_uq').on(t.gatewayPaymentId),
    idemUq: uniqueIndex('txn_idempotency_uq').on(t.idempotencyKey),
  }),
);

// ── Ledger entries (append-only) ────────────────────────────────────────────
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pigmyAccountId: uuid('pigmy_account_id')
      .notNull()
      .references(() => pigmyAccounts.id),
    transactionId: uuid('transaction_id').references(() => transactions.id),
    type: ledgerTypeEnum('type').notNull(),
    amount: money('amount').notNull(), // paise
    previousBalance: money('previous_balance').notNull(),
    newBalance: money('new_balance').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => ({
    pigmyIdx: index('ledger_pigmy_idx').on(t.pigmyAccountId),
    createdIdx: index('ledger_created_idx').on(t.createdAt),
    // one ledger entry per successful transaction (idempotency backstop)
    txnUq: uniqueIndex('ledger_txn_uq').on(t.transactionId),
  }),
);

// ── Scheme settings (single active row) ────────────────────────────────────
// Bank-level product parameters. Values are snapshotted onto pigmy_accounts at
// opening time, so changing the scheme here affects only NEW accounts.
export const schemeSettings = pgTable('scheme_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  termDays: integer('term_days').notNull().default(365),
  interestRateBps: integer('interest_rate_bps').notNull().default(400), // 400 bps = 4.00% p.a.
  earlyWithdrawalAllowed: boolean('early_withdrawal_allowed').notNull().default(true),
  earlyPenaltyBps: integer('early_penalty_bps').notNull().default(100), // 1% of principal
  minBalancePaise: money('min_balance_paise').notNull().default(0),
  updatedById: uuid('updated_by_id').references(() => admins.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Withdrawal requests (maker-checker) ─────────────────────────────────────
// A customer request moves through a state machine:
//   pending → approved → paid   (rejected / cancelled can happen at any point
//   pending ──────────→ rejected   before payout)
//   pending ──────────→ cancelled (by the customer)
// Only `approved` → `paid` posts a ledger DEBIT (and possibly closes the
// account). Every transition is audited.
export const withdrawalRequests = pgTable(
  'withdrawal_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    pigmyAccountId: uuid('pigmy_account_id')
      .notNull()
      .references(() => pigmyAccounts.id),
    kind: withdrawalKindEnum('kind').notNull(), // partial | closure | maturity
    amount: money('amount').notNull(), // paise
    penalty: money('penalty').notNull().default(0), // paise (early withdrawal)
    interest: money('interest').notNull().default(0), // paise (maturity interest, if any)
    status: withdrawalStatusEnum('status').notNull().default('pending'),
    payoutMethod: payoutMethodEnum('payout_method').notNull().default('bank_transfer'),
    bankAccountMasked: text('bank_account_masked'), // "XXXX1234" at request time
    bankIfsc: text('bank_ifsc'), // stored so payouts keep an addressable record
    reference: text('reference'), // UTR for bank transfer / voucher no for cash
    note: text('note'),
    requestedAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    decidedById: uuid('decided_by_id').references(() => admins.id),
  },
  (t) => ({
    acctIdx: index('withdrawal_acct_idx').on(t.pigmyAccountId),
    statusIdx: index('withdrawal_status_idx').on(t.status),
    requestedIdx: index('withdrawal_requested_idx').on(t.requestedAt),
  }),
);

// ── Admins ──────────────────────────────────────────────────────────────────
export const admins = pgTable('admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: adminRoleEnum('role').notNull().default('admin'),
  // array of village ids; empty array + role superadmin => all villages
  assignedVillages: jsonb('assigned_villages').$type<string[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Audit logs (write-only) ─────────────────────────────────────────────────
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    actorType: actorTypeEnum('actor_type').notNull(),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => ({
    entityIdx: index('audit_entity_idx').on(t.entity, t.entityId),
    createdIdx: index('audit_created_idx').on(t.createdAt),
  }),
);

// ── OTP codes ───────────────────────────────────────────────────────────────
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mobile: text('mobile').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: otpPurposeEnum('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ mobileIdx: index('otp_mobile_idx').on(t.mobile, t.createdAt) }),
);

// ── Refresh tokens ──────────────────────────────────────────────────────────
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectId: uuid('subject_id').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ subjectIdx: index('refresh_subject_idx').on(t.subjectId) }),
);

// ── Notifications ───────────────────────────────────────────────────────────
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id').references(() => customers.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    category: notifCategoryEnum('category').notNull().default('system'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdByAdminId: uuid('created_by_admin_id').references(() => admins.id),
    createdAt: createdAt(),
  },
  (t) => ({ customerIdx: index('notif_customer_idx').on(t.customerId, t.createdAt) }),
);

// ── Relations ───────────────────────────────────────────────────────────────
export const villagesRelations = relations(villages, ({ many }) => ({
  customers: many(customers),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  village: one(villages, { fields: [customers.villageId], references: [villages.id] }),
  nominees: many(nominees),
  documents: many(customerDocuments),
  bankDetails: many(customerBankDetails),
  pigmyAccounts: many(pigmyAccounts),
  notifications: many(notifications),
}));

export const nomineesRelations = relations(nominees, ({ one }) => ({
  customer: one(customers, { fields: [nominees.customerId], references: [customers.id] }),
}));

export const documentsRelations = relations(customerDocuments, ({ one }) => ({
  customer: one(customers, { fields: [customerDocuments.customerId], references: [customers.id] }),
}));

export const bankDetailsRelations = relations(customerBankDetails, ({ one }) => ({
  customer: one(customers, {
    fields: [customerBankDetails.customerId],
    references: [customers.id],
  }),
}));

export const pigmyAccountsRelations = relations(pigmyAccounts, ({ one, many }) => ({
  customer: one(customers, { fields: [pigmyAccounts.customerId], references: [customers.id] }),
  transactions: many(transactions),
  ledgerEntries: many(ledgerEntries),
  withdrawalRequests: many(withdrawalRequests),
}));

export const withdrawalRequestsRelations = relations(withdrawalRequests, ({ one }) => ({
  customer: one(customers, {
    fields: [withdrawalRequests.customerId],
    references: [customers.id],
  }),
  pigmyAccount: one(pigmyAccounts, {
    fields: [withdrawalRequests.pigmyAccountId],
    references: [pigmyAccounts.id],
  }),
  decidedBy: one(admins, {
    fields: [withdrawalRequests.decidedById],
    references: [admins.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  pigmyAccount: one(pigmyAccounts, {
    fields: [transactions.pigmyAccountId],
    references: [pigmyAccounts.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  pigmyAccount: one(pigmyAccounts, {
    fields: [ledgerEntries.pigmyAccountId],
    references: [pigmyAccounts.id],
  }),
  transaction: one(transactions, {
    fields: [ledgerEntries.transactionId],
    references: [transactions.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  customer: one(customers, { fields: [notifications.customerId], references: [customers.id] }),
}));

// ── Convenience type exports ────────────────────────────────────────────────
export type Village = typeof villages.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type PigmyAccount = typeof pigmyAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type SchemeSettings = typeof schemeSettings.$inferSelect;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
