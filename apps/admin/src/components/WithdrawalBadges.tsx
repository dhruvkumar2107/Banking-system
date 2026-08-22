'use client';

import { Badge } from '@/components/ui';
import { useT, type TKey } from '@/lib/i18n';
import type { PayoutMethod, WithdrawalKind, WithdrawalStatus } from '@/lib/types';

/**
 * Withdrawal statuses/kinds have their own vocabulary (the shared StatusBadge
 * only knows payment + account states), so both withdrawal screens render them
 * from here to stay in step.
 */

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'indigo';

/**
 * The maps hold dictionary keys, not English: `long` is the detail-page pill,
 * `short` the one that has to fit in a list cell. Where both read the same in
 * English they share a key.
 */
const STATUS: Record<WithdrawalStatus, { tone: Tone; long: TKey; short: TKey }> = {
  pending: {
    tone: 'amber',
    long: 'withdrawals.statusPendingLong',
    short: 'withdrawals.statusPendingShort',
  },
  approved: {
    tone: 'blue',
    long: 'withdrawals.statusApprovedLong',
    short: 'withdrawals.statusApprovedShort',
  },
  paid: { tone: 'green', long: 'withdrawals.statusPaid', short: 'withdrawals.statusPaid' },
  rejected: {
    tone: 'red',
    long: 'withdrawals.statusRejected',
    short: 'withdrawals.statusRejected',
  },
  cancelled: {
    tone: 'slate',
    long: 'withdrawals.statusCancelledLong',
    short: 'withdrawals.statusCancelledShort',
  },
};

const KIND: Record<WithdrawalKind, { tone: Tone; long: TKey; short: TKey }> = {
  partial: {
    tone: 'blue',
    long: 'withdrawals.kindPartialLong',
    short: 'withdrawals.kindPartialShort',
  },
  closure: {
    tone: 'indigo',
    long: 'withdrawals.kindClosureLong',
    short: 'withdrawals.kindClosureShort',
  },
  maturity: {
    tone: 'green',
    long: 'withdrawals.kindMaturityLong',
    short: 'withdrawals.kindMaturityShort',
  },
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
  const t = useT();
  // A status outside the union falls through to the raw value: `t()` returns an
  // unknown key unchanged, which is the same fallback this badge always had.
  const s = STATUS[status] ?? { tone: 'slate' as Tone, long: status, short: status };
  return (
    <Badge tone={s.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {t(compact ? s.short : s.long)}
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
  const t = useT();
  const k = KIND[kind] ?? { tone: 'slate' as Tone, long: kind, short: kind };
  return <Badge tone={k.tone}>{t(compact ? k.short : k.long)}</Badge>;
}

/**
 * The three helpers below are plain functions, so they cannot reach the `useT`
 * hook. `withdrawals/[id]/page.tsx` — their only ever caller — now derives these
 * labels from the dictionary itself (`withdrawals.payout*` / `withdrawals.ref*`),
 * so nothing imports them any more. Left in place rather than deleted.
 */

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
