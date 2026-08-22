/**
 * Types for the loan book and the KYC review queue.
 *
 * These live outside `src/lib/types.ts` deliberately: loans and KYC are their
 * own bounded context. `Money`, `Paginated` and `AccountStatus` are reused from
 * there so there is exactly one money shape across the whole admin panel.
 */

import type { AccountStatus, Money } from './types';

/**
 * A village as it arrives on a loan or KYC payload. Some routes send the plain
 * name, others a `{ id, name }` object. `villageLabel()` in `loans-api.ts`
 * renders either, so no screen has to guess.
 */
export type VillageRef = string | { id?: string; name?: string } | null;

// ── loans ────────────────────────────────────────────────────────────────────

export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'disbursed'
  | 'closed'
  | 'defaulted';

export type LoanInstalmentStatus = 'due' | 'paid' | 'overdue' | 'waived';

/** How a repayment reached the bank. `from_savings` debits the pigmy ledger. */
export type RepaymentMethod = 'cash' | 'bank_transfer' | 'from_savings';

/** How the principal was handed to the borrower. */
export type DisbursementMethod = 'bank_transfer' | 'cash';

/** Every status a loan can be in, in the order the queue filter shows them. */
export const LOAN_STATUSES: readonly LoanStatus[] = [
  'pending',
  'approved',
  'disbursed',
  'closed',
  'rejected',
  'cancelled',
  'defaulted',
];

/** Statuses from which no further action is legal — the loan is finished. */
export const TERMINAL_LOAN_STATUSES: readonly LoanStatus[] = [
  'rejected',
  'cancelled',
  'closed',
  'defaulted',
];

/**
 * The fields every loan endpoint returns. Rate, tenure, interest and fee are
 * snapshotted onto the loan at approval, so later product changes never
 * re-price an existing loan.
 */
export interface LoanBase {
  id: string;
  loanNumber: string;
  status: LoanStatus;
  principal: Money;
  tenureMonths: number;
  interestRatePercent: number;
  totalInterest: Money;
  processingFee: Money;
  /** principal + totalInterest — the full amount the borrower must repay. */
  totalPayable: Money;
  emiAmount: Money;
  /** Derived from the instalment schedule: what is still unpaid. */
  outstanding: Money;
  purpose: string | null;
  requestedAt: string;
  decidedAt: string | null;
  disbursedAt: string | null;
  firstDueDate: string | null;
  closedAt: string | null;
  rejectionReason: string | null;
}

/** A row in the admin loan queue. */
export interface LoanRow extends LoanBase {
  customer: { name: string; mobile: string };
  village: VillageRef;
  accountNumber: string;
}

/** One EMI in the repayment schedule. Rows are never deleted. */
export interface LoanInstalment {
  id: string;
  instalmentNo: number;
  dueDate: string;
  amountDue: Money;
  amountPaid: Money;
  status: LoanInstalmentStatus;
  method: RepaymentMethod | null;
  reference: string | null;
  paidAt: string | null;
  waivedReason?: string | null;
}

/** The savings account that backs the loan and can fund repayments. */
export interface LoanAccount {
  id: string;
  accountNumber: string;
  currentBalance: Money;
  status?: AccountStatus;
  dailyAmount?: Money;
  totalDeposited?: Money;
}

/** Everything an approver needs on one screen. */
export interface LoanDetail extends LoanBase {
  customer: { id: string; name: string; mobile: string };
  village: VillageRef;
  account: LoanAccount;
  instalments: LoanInstalment[];
  decidedBy: string | null;
  interestRateBps?: number;
  disbursementMethod?: DisbursementMethod | null;
  bankAccountMasked?: string | null;
  bankIfsc?: string | null;
  reference?: string | null;
  note?: string | null;
}

/** The loan product parameters. Superadmin-editable; never retroactive. */
export interface LoanSettings {
  enabled: boolean;
  minAmount: Money;
  maxAmount: Money;
  interestRateBps: number;
  interestRatePercent: number;
  interestBasis: string;
  approxReducingRatePercent: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  maxLoanToBalanceBps: number;
  maxLoanToBalanceMultiple: number;
  processingFeeBps: number;
  processingFeePercent: number;
  minSavings: Money;
}

// ── loan mutation bodies ─────────────────────────────────────────────────────

/** Rate and tenure may be overridden for this one borrower at approval. */
export interface ApproveLoanBody {
  interestRateBps?: number;
  tenureMonths?: number;
  note?: string;
}

export interface RejectLoanBody {
  /** 4–280 characters. Shown to the customer in the app. */
  reason: string;
}

export interface DisburseLoanBody {
  /** UTR for a bank transfer, voucher number for cash. Proof of hand-over. */
  reference: string;
  disbursementMethod?: DisbursementMethod;
  note?: string;
}

export interface RecordRepaymentBody {
  amountRupees: number;
  method: RepaymentMethod;
  reference?: string;
}

export interface WaiveInstalmentBody {
  /** 4–280 characters. */
  reason: string;
}

export interface DefaultLoanBody {
  /** At least 8 characters — writing a loan off is a serious, audited act. */
  reason: string;
}

export interface UpdateLoanSettingsBody {
  enabled?: boolean;
  minAmountPaise?: number;
  maxAmountPaise?: number;
  interestRateBps?: number;
  minTenureMonths?: number;
  maxTenureMonths?: number;
  maxLoanToBalanceBps?: number;
  processingFeeBps?: number;
  minSavingsPaise?: number;
}

export interface LoanListParams {
  page?: number;
  limit?: number;
  status?: string;
  /** Send `true` or omit — never `false`; see `loans-api.ts`. */
  overdueOnly?: true;
  villageId?: string;
  search?: string;
}

// ── KYC ──────────────────────────────────────────────────────────────────────

export type KycStage = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'bypassed';

/** Filter order for the review queue — the work that needs a human comes first. */
export const KYC_STAGES: readonly KycStage[] = [
  'submitted',
  'verified',
  'rejected',
  'bypassed',
  'not_started',
];

/** Stages that satisfy the gate and let the customer transact. */
export const KYC_PASSING_STAGES: readonly KycStage[] = ['verified', 'bypassed'];

export interface KycNominee {
  id: string;
  name: string;
  relation: string | null;
  mobile: string | null;
  address?: string | null;
}

export interface KycDocument {
  id: string;
  /** aadhaar, pan, voter_id, photo … */
  kind: string;
  /** Usually an access-controlled `/api/uploads/…` path, not a public URL. */
  fileUrl: string;
  status: string;
  uploadedAt: string;
}

/** A row in the KYC review queue. */
export interface KycQueueRow {
  customerId: string;
  name: string;
  mobile: string;
  village: string;
  kycStage: KycStage;
  kycSubmittedAt: string | null;
  kycVerifiedAt: string | null;
  /** Only ever the masked form, e.g. "XXXX-XXXX-1234". */
  aadhaarMasked: string | null;
  photoUrl: string | null;
  nomineeCount: number | null;
}

/** One submission, as the reviewer sees it: the queue row plus the evidence. */
export interface KycSubmission extends KycQueueRow {
  kycRejectionReason: string | null;
  /** True when the photo was captured live in the app rather than uploaded. */
  photoIsLive: boolean;
  address: string | null;
  nominees: KycNominee[];
  documents: KycDocument[];
  bypassedAt: string | null;
  bypassReason: string | null;
  verifiedBy: string | null;
  bypassedBy: string | null;
}

export interface RejectKycBody {
  /** 4–280 characters. Shown to the customer in the app. */
  reason: string;
}

export interface BypassKycBody {
  /** At least 8 characters — a bypass is a permanently audited override. */
  reason: string;
}

export interface KycListParams {
  page?: number;
  limit?: number;
  stage?: string;
  villageId?: string;
  search?: string;
}

// ── KYC wire shapes ──────────────────────────────────────────────────────────
//
// The API spells the KYC fields two ways. The admin queue contract uses the
// `kyc*` prefix (`kycStage`, `kycSubmittedAt`, `village` as a plain name),
// while the shared serializer inside the API's kyc.service spreads the
// un-prefixed form (`stage`, `submittedAt`) and returns `village` as an object
// on the detail route. Rather than guess, both spellings are accepted here and
// flattened by the normalisers in `loans-api.ts`, so every page sees exactly
// one shape. (`VillageRef` is declared at the top — loans need it too.)

export interface KycRowWire {
  customerId?: string;
  id?: string;
  name?: string;
  mobile?: string;
  village?: VillageRef;
  kycStage?: KycStage;
  stage?: KycStage;
  kycSubmittedAt?: string | null;
  submittedAt?: string | null;
  kycVerifiedAt?: string | null;
  verifiedAt?: string | null;
  aadhaarMasked?: string | null;
  photoUrl?: string | null;
  nomineeCount?: number | null;
}

export interface KycDocumentWire {
  id: string;
  kind?: string;
  docType?: string;
  fileUrl: string;
  status?: string;
  verifiedStatus?: string;
  uploadedAt: string;
}

export interface KycSubmissionWire extends KycRowWire {
  customer?: { id?: string; name?: string; mobile?: string; address?: string | null };
  address?: string | null;
  photoIsLive?: boolean | null;
  kycRejectionReason?: string | null;
  rejectionReason?: string | null;
  bypassedAt?: string | null;
  bypassReason?: string | null;
  verifiedBy?: string | null;
  bypassedBy?: string | null;
  nominees?: KycNominee[] | null;
  documents?: KycDocumentWire[] | null;
}
