'use client';

import { Badge } from '@/components/ui';
import { useT, type TKey } from '@/lib/i18n';
import type {
  DisbursementMethod,
  KycStage,
  LoanInstalmentStatus,
  LoanStatus,
  RepaymentMethod,
} from '@/lib/loan-types';

/**
 * Loans, instalments and KYC each have their own vocabulary that the shared
 * `StatusBadge` does not know (it only speaks payment + account states), so
 * every loan and KYC screen renders its pills from here and stays in step.
 *
 * The pills read their text from the dictionary. `long` (English) survives only
 * where one of the plain `*Label()` helpers at the foot of this file still needs
 * it — those are not components, so they cannot call the `useT` hook, and their
 * callers translate at the call site instead.
 */

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'indigo';

const DOT: Record<Tone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  blue: 'bg-sky-500',
  slate: 'bg-ink-faint',
  indigo: 'bg-brand-500',
};

const LOAN_STATUS: Record<
  LoanStatus,
  { tone: Tone; long: string; longKey: TKey; shortKey: TKey }
> = {
  pending: {
    tone: 'amber',
    long: 'Pending approval',
    longKey: 'loans.statusPendingLong',
    shortKey: 'status.pending',
  },
  approved: {
    tone: 'blue',
    long: 'Approved — awaiting disbursal',
    longKey: 'loans.statusApprovedLong',
    shortKey: 'status.approved',
  },
  disbursed: {
    tone: 'indigo',
    long: 'Disbursed — repaying',
    longKey: 'loans.statusDisbursedLong',
    shortKey: 'status.disbursed',
  },
  closed: {
    tone: 'green',
    long: 'Closed — fully repaid',
    longKey: 'loans.statusClosedLong',
    shortKey: 'status.closed',
  },
  rejected: {
    tone: 'red',
    long: 'Rejected',
    longKey: 'status.rejected',
    shortKey: 'status.rejected',
  },
  cancelled: {
    tone: 'slate',
    long: 'Cancelled by customer',
    longKey: 'loans.statusCancelledLong',
    shortKey: 'status.cancelled',
  },
  defaulted: {
    tone: 'red',
    long: 'Written off as defaulted',
    longKey: 'loans.statusDefaultedLong',
    shortKey: 'status.defaulted',
  },
};

/** Long and short read alike for every instalment state, so they share a key. */
const INSTALMENT_STATUS: Record<LoanInstalmentStatus, { tone: Tone; longKey: TKey; shortKey: TKey }> =
  {
    due: { tone: 'slate', longKey: 'status.due', shortKey: 'status.due' },
    paid: { tone: 'green', longKey: 'status.paid', shortKey: 'status.paid' },
    overdue: { tone: 'red', longKey: 'status.overdue', shortKey: 'status.overdue' },
    waived: { tone: 'blue', longKey: 'status.waived', shortKey: 'status.waived' },
  };

const KYC_STAGE: Record<KycStage, { tone: Tone; long: string; longKey: TKey; shortKey: TKey }> = {
  not_started: {
    tone: 'slate',
    long: 'Not started',
    longKey: 'status.notStarted',
    shortKey: 'status.notStarted',
  },
  submitted: {
    tone: 'amber',
    long: 'Submitted — awaiting review',
    longKey: 'kyc.stageSubmittedLong',
    shortKey: 'status.submitted',
  },
  verified: {
    tone: 'green',
    long: 'Verified',
    longKey: 'status.verified',
    shortKey: 'status.verified',
  },
  rejected: {
    tone: 'red',
    long: 'Rejected',
    longKey: 'status.rejected',
    shortKey: 'status.rejected',
  },
  bypassed: {
    tone: 'indigo',
    long: 'Bypassed by an admin',
    longKey: 'kyc.stageBypassedLong',
    shortKey: 'status.bypassed',
  },
};

export function LoanStatusBadge({ status, compact }: { status: LoanStatus; compact?: boolean }) {
  const t = useT();
  // A value outside the union falls through to the raw string: `t()` hands back
  // an unknown key unchanged, which is the fallback these pills always had.
  const s = LOAN_STATUS[status] ?? { tone: 'slate' as Tone, longKey: status, shortKey: status };
  return (
    <Badge tone={s.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {t(compact ? s.shortKey : s.longKey)}
    </Badge>
  );
}

export function InstalmentStatusBadge({
  status,
  compact,
}: {
  status: LoanInstalmentStatus;
  compact?: boolean;
}) {
  const t = useT();
  const s = INSTALMENT_STATUS[status] ?? {
    tone: 'slate' as Tone,
    longKey: status,
    shortKey: status,
  };
  return (
    <Badge tone={s.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {t(compact ? s.shortKey : s.longKey)}
    </Badge>
  );
}

export function KycStageBadge({ stage, compact }: { stage: KycStage; compact?: boolean }) {
  const t = useT();
  const s = KYC_STAGE[stage] ?? { tone: 'slate' as Tone, longKey: stage, shortKey: stage };
  return (
    <Badge tone={s.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {t(compact ? s.shortKey : s.longKey)}
    </Badge>
  );
}

/**
 * Plain-text labels for prose outside a pill. These are not components, so they
 * cannot translate themselves — each returns English and the calling page is
 * expected to look the wording up itself. The dictionary keys that match are
 * noted against each one.
 */

/** Plain-English label for a loan status, for prose outside a pill. `loans.status*Long`. */
export function loanStatusLabel(status: LoanStatus): string {
  return LOAN_STATUS[status]?.long ?? status;
}

/** Plain-English label for a KYC stage, for prose outside a pill. `kyc.stage*` / `status.*`. */
export function kycStageLabel(stage: KycStage): string {
  return KYC_STAGE[stage]?.long ?? stage;
}

/** How the borrower paid an instalment. `loans.cash` / `loans.bankTransfer` / `loans.fromSavings`. */
export function repaymentMethodLabel(method?: RepaymentMethod | null): string {
  if (method === 'cash') return 'Cash at branch';
  if (method === 'bank_transfer') return 'Bank transfer';
  if (method === 'from_savings') return 'From savings';
  return '—';
}

/** How the principal reached the borrower. `loans.cash` / `loans.bankTransfer`. */
export function disbursementLabel(method?: DisbursementMethod | null): string {
  return method === 'cash' ? 'Cash at branch' : 'Bank transfer';
}

/** What the admin types in to prove the money moved. `withdrawals.refVoucher` / `refUtr`. */
export function referenceLabelFor(method?: RepaymentMethod | DisbursementMethod | null): string {
  if (method === 'cash') return 'Voucher number';
  if (method === 'from_savings') return 'Reference (optional)';
  return 'UTR number';
}

export function referenceHintFor(method?: RepaymentMethod | DisbursementMethod | null): string {
  if (method === 'cash') return 'The branch cash voucher / receipt number.';
  if (method === 'from_savings') return 'Nothing to reference — the pigmy ledger entry is the proof.';
  return 'The UTR from the NEFT/IMPS transfer.';
}
