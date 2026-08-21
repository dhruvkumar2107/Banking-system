// Shared types mirroring the Digital Pigmee API response shapes.

/** Money is always returned by the API as integer paise plus display helpers. */
export interface Money {
  paise: number;
  rupees: number;
  display: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export type AdminRole = 'superadmin' | 'admin' | 'agent';
export type PaymentStatus = 'pending' | 'success' | 'failed';
export type AccountStatus = 'active' | 'inactive' | 'closed';
export type KycStatus = 'pending' | 'verified' | 'rejected';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  assignedVillages: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  admin: AdminUser;
}

export interface DashboardSummary {
  todayCollection: Money;
  todayCounts: { success: number; pending: number; failed: number };
  totalCustomers: number;
  activeAccounts: number;
  totalBalance: Money;
  totalCollectedAllTime: Money;
}

export interface VillageListItem {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  customerCount: number;
}

export interface VillageDetail {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  stats: { customerCount: number; totalBalance: number };
}

export interface VillageWiseRow {
  id: string;
  name: string;
  code: string;
  customers: number;
  accounts: number;
  currentBalance: Money;
  totalDeposited: Money;
  collected: Money;
  successfulTxns: number;
}

export interface DateWisePoint {
  day: string;
  collected: Money;
  successCount: number;
  pendingCount: number;
  failedCount: number;
}

export interface DateWiseReport {
  from: string;
  to: string;
  series: DateWisePoint[];
}

export interface CustomerListItem {
  id: string;
  name: string;
  mobile: string;
  address: string | null;
  photoUrl: string | null;
  kycStatus: KycStatus;
  villageId: string;
  createdAt: string;
  updatedAt: string;
  village: string;
  totalBalance: Money;
  accountCount: number;
}

export interface PigmyAccountSummary {
  id: string;
  accountNumber: string;
  status: AccountStatus;
  dailyAmount: Money;
  currentBalance: Money;
  totalDeposited: Money;
  createdAt: string;
}

export interface Nominee {
  id: string;
  customerId: string;
  name: string;
  relation: string | null;
  mobile: string | null;
  address: string | null;
  createdAt?: string;
}

export interface CustomerDocument {
  id: string;
  customerId: string;
  docType: string;
  fileUrl: string;
  verifiedStatus: KycStatus;
  uploadedAt: string;
}

export interface BankDetails {
  id: string;
  customerId: string;
  accountNumber: string;
  ifsc: string;
  accountHolderName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerTxn {
  id: string;
  amount: Money;
  status: PaymentStatus;
  gateway: string;
  createdAt: string;
}

export interface Customer360 {
  id: string;
  name: string;
  mobile: string;
  address: string | null;
  photoUrl: string | null;
  kycStatus: KycStatus;
  villageId: string;
  createdAt: string;
  updatedAt: string;
  village: { id: string; name: string; code: string } | null;
  pigmyAccounts: PigmyAccountSummary[];
  nominees: Nominee[];
  documents: CustomerDocument[];
  bankDetails: BankDetails | null;
  recentTransactions: CustomerTxn[];
}

export interface PigmyOverviewRow {
  id: string;
  customerId: string;
  accountNumber: string;
  status: AccountStatus;
  dailyAmount: Money;
  currentBalance: Money;
  totalDeposited: Money;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; mobile: string };
  village: string;
}

export interface PigmyAccountDetail {
  id: string;
  customerId: string;
  accountNumber: string;
  status: AccountStatus;
  dailyAmount: Money;
  currentBalance: Money;
  totalDeposited: Money;
  /** Scheme terms snapshotted when the account was opened. */
  termDays: number;
  interestRatePercent: number;
  maturityDate: string | null;
  matured: boolean;
  maturedAt: string | null;
  interestCreditedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; mobile: string };
  village: { id: string; name: string };
}

export interface LedgerEntry {
  id: string;
  type: 'credit' | 'debit';
  amount: Money;
  previousBalance: Money;
  newBalance: Money;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
}

export interface Reconciliation {
  consistent: boolean;
  storedBalance: Money;
  computedBalance: Money;
  credits: Money;
  debits: Money;
}

export interface AdminTransaction {
  id: string;
  amount: Money;
  status: PaymentStatus;
  gateway: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; mobile: string };
  village: string;
  accountNumber: string;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorType: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

// ── withdrawals (maker-checker) ───────────────────────────────────────────────

export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
export type WithdrawalKind = 'partial' | 'closure' | 'maturity';
export type PayoutMethod = 'bank_transfer' | 'cash';

/** Shared shape returned by every withdrawal endpoint. */
export interface WithdrawalRequest {
  id: string;
  customerId: string;
  pigmyAccountId: string;
  kind: WithdrawalKind;
  status: WithdrawalStatus;
  /** Gross amount leaving the account. */
  amount: Money;
  penalty: Money;
  interest: Money;
  /** amount + interest − penalty: what the customer actually receives. */
  netPayable: Money;
  payoutMethod: PayoutMethod;
  /** Only ever the masked form ("XXXX1234") — the full number is never sent. */
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  /** UTR for a bank transfer, voucher number for cash. */
  reference: string | null;
  note: string | null;
  requestedAt: string;
  decidedAt: string | null;
  paidAt: string | null;
  decidedById: string | null;
}

/** A row in the admin approval queue. */
export interface WithdrawalRow extends WithdrawalRequest {
  customer: { name: string; mobile: string };
  village: string;
  accountNumber: string;
  accountBalance: Money;
}

/** Full detail an approver needs before deciding. */
export interface WithdrawalDetail extends WithdrawalRequest {
  customer: { id: string; name: string; mobile: string };
  village: { id: string; name: string };
  account: {
    id: string;
    accountNumber: string;
    status: AccountStatus;
    currentBalance: Money;
    totalDeposited: Money;
    maturityDate: string | null;
    termDays: number;
    interestRatePercent: number;
    matured: boolean;
  };
  decidedBy: string | null;
}

/** What `POST /withdrawals/:id/pay` returns — the request plus the ledger outcome. */
export interface PaidWithdrawal extends WithdrawalRequest {
  balanceAfter: Money;
  accountClosed: boolean;
}

/** The bank's scheme parameters. Changes apply to NEW accounts only. */
export interface Scheme {
  termDays: number;
  interestRateBps: number;
  interestRatePercent: number;
  earlyWithdrawalAllowed: boolean;
  earlyPenaltyBps: number;
  earlyPenaltyPercent: number;
  minBalance: number;
  interestBasis: string;
}
