import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'indigo',
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: 'indigo' | 'green' | 'amber' | 'red' | 'slate';
  className?: string;
}) {
  // Gradient icon tiles + the matching hover-glow color, keyed by tone.
  const tones: Record<string, { tile: string; glow: string }> = {
    indigo: {
      tile: 'bg-gradient-to-br from-brand-500 to-violet-600 text-white',
      glow: 'rgb(99 102 241 / 0.35)',
    },
    green: {
      tile: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white',
      glow: 'rgb(16 185 129 / 0.32)',
    },
    amber: {
      tile: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
      glow: 'rgb(245 158 11 / 0.32)',
    },
    red: {
      tile: 'bg-gradient-to-br from-rose-400 to-rose-600 text-white',
      glow: 'rgb(244 63 94 / 0.32)',
    },
    slate: {
      tile: 'bg-gradient-to-br from-cyan-400 to-brand-500 text-white',
      glow: 'rgb(34 211 238 / 0.30)',
    },
  };
  const t = tones[tone];
  return (
    <div
      className={cn(
        'card card-topline group relative flex items-center gap-4 overflow-hidden p-5 transition duration-300 hover:-translate-y-0.5',
        className,
      )}
    >
      {/* Radial glow that blooms from the icon on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-6 -top-6 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `radial-gradient(circle, ${t.glow}, transparent 70%)` }}
      />
      {icon && (
        <div
          className={cn(
            'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-glow transition duration-300 group-hover:scale-110 group-hover:-rotate-3',
            t.tile,
          )}
        >
          {icon}
        </div>
      )}
      <div className="relative min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold tracking-tight text-ink">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}
