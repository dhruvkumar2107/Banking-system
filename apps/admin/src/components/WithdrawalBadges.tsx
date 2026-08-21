import { Badge } from '@/components/ui';
import type { PayoutMethod, WithdrawalKind, WithdrawalStatus } from '@/lib/types';

/**
 * Withdrawal statuses/kinds have their own vocabulary (the shared StatusBadge
 * only knows payment + account states), so both withdrawal screens render them
 * from here to stay in step.
 */

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'indigo';

const STATUS: Record<WithdrawalStatus, { tone: Tone; long: string; short: string }> = {
  pending: { tone: 'amber', long: 'Pending approval', short: 'Pending' },
  approved: { tone: 'blue', long: 'Approved — awaiting payout', short: 'Approved' },
  paid: { tone: 'green', long: 'Paid', short: 'Paid' },
  rejected: { tone: 'red', long: 'Rejected', short: 'Rejected' },
  cancelled: { tone: 'slate', long: 'Cancelled by customer', short: 'Cancelled' },
};

const KIND: Record<WithdrawalKind, { tone: Tone; long: string; short: string }> = {
  partial: { tone: 'blue', long: 'Partial withdrawal', short: 'Partial' },
  closure: { tone: 'indigo', long: 'Account closure', short: 'Closure' },
  maturity: { tone: 'green', long: 'Maturity payout', short: 'Maturity' },
};

const DOT: Record<Tone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  blue: 'bg-sky-500',
  slate: 'bg-ink-faint',
  indigo: 'bg-brand-500',
};

export function WithdrawalStatusBadge({
  status,
  compact,
}: {
  status: WithdrawalStatus;
  compact?: boolean;
}) {
  const s = STATUS[status] ?? { tone: 'slate' as Tone, long: status, short: status };
  return (
    <Badge tone={s.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {compact ? s.short : s.long}
    </Badge>
  );
}

export function WithdrawalKindBadge({
  kind,
  compact,
}: {
  kind: WithdrawalKind;
  compact?: boolean;
}) {
  const k = KIND[kind] ?? { tone: 'slate' as Tone, long: kind, short: kind };
  return <Badge tone={k.tone}>{compact ? k.short : k.long}</Badge>;
}

/** How the money reaches the customer. */
export function payoutLabel(method: PayoutMethod): string {
  return method === 'cash' ? 'Cash at branch' : 'Bank transfer';
}

/** What the admin types in to prove the payout happened. */
export function referenceLabel(method: PayoutMethod): string {
  return method === 'cash' ? 'Voucher number' : 'UTR number';
}

export function referenceHint(method: PayoutMethod): string {
  return method === 'cash'
    ? 'The branch cash voucher / receipt number handed to the customer.'
    : 'The UTR from the NEFT/IMPS transfer.';
}
