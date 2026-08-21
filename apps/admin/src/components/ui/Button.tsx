'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-glow hover:shadow-glow-lg hover:-translate-y-px active:translate-y-0',
  outline:
    'border border-line bg-surface/70 text-ink-soft backdrop-blur-sm hover:bg-surface-2 hover:border-brand-300/60',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger:
    'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm hover:from-rose-600 hover:to-rose-700 hover:-translate-y-px active:translate-y-0',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  const sheen = variant === 'primary' || variant === 'danger';
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold transition duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {/* Light sweep on hover for the solid gradient buttons. */}
      {sheen && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-sheen opacity-0 transition duration-700 group-hover:translate-x-full group-hover:opacity-100"
        />
      )}
      {loading && <Spinner size={size === 'sm' ? 14 : 16} />}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  );
});
