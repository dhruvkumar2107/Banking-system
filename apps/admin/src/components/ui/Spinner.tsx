'use client';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin text-current', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/**
 * Centered loading state for a page/section. The default label is resolved at
 * render time rather than in the parameter list, so it follows the active locale
 * while callers that pass their own `label` keep overriding it as before.
 */
export function LoadingBlock({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-muted">
      <Spinner size={20} />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  );
}
