'use client';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';
import type { ReactNode } from 'react';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'indigo';

const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25',
  slate: 'bg-surface-2 text-ink-soft ring-line',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-400/25',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  // payment
  success: 'green',
  pending: 'amber',
  failed: 'red',
  // account
  active: 'green',
  inactive: 'slate',
  closed: 'red',
  // kyc
  verified: 'green',
  rejected: 'red',
};

/**
 * Status → dictionary key. Covers the payment, account and KYC status unions,
 * all of which already live in the `status.*` namespace.
 */
const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  success: 'status.success',
  pending: 'status.pending',
  failed: 'status.failed',
  active: 'status.active',
  inactive: 'status.inactive',
  closed: 'status.closed',
  verified: 'status.verified',
  rejected: 'status.rejected',
};

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const tone = STATUS_TONE[status] ?? 'slate';
  const dot: Record<Tone, string> = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
    blue: 'bg-sky-500',
    slate: 'bg-ink-faint',
    indigo: 'bg-brand-500',
  };
  const key = STATUS_LABEL_KEY[status];
  return (
    <Badge tone={tone}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} />
      {/* Unmapped statuses still render their raw value, as before. */}
      {key ? t(key) : status}
    </Badge>
  );
}
