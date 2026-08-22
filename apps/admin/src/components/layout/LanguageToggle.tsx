'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LOCALES, LOCALE_META, useLocale, useT } from '@/lib/i18n';

/**
 * English / हिंदी / ಕನ್ನಡ switcher. Sits beside <ThemeToggle /> and borrows its
 * metrics (h-9, rounded-xl, muted-until-hover) plus the Topbar menu's popover
 * styling. Shows a neutral code until mounted so the first paint — which is
 * always English — matches the server render.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, mounted } = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        aria-label={t('common.language')}
        title={t('common.language')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
          open && 'bg-surface-2 text-ink',
        )}
      >
        <Languages size={18} />
        <span className="text-xs font-semibold tabular-nums">
          {mounted ? LOCALE_META[locale].short : LOCALE_META.en.short}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-line/70 bg-surface/90 shadow-pop backdrop-blur-xl animate-scale-in"
        >
          <p className="border-b border-line-soft px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            {t('common.language')}
          </p>
          {LOCALES.map((code) => {
            const active = mounted && code === locale;
            return (
              <button
                key={code}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition hover:bg-surface-2',
                  active ? 'font-medium text-brand-700 dark:text-brand-300' : 'text-ink-soft',
                )}
              >
                <span className="w-6 text-xs font-semibold text-ink-muted">
                  {LOCALE_META[code].short}
                </span>
                <span className="flex-1">{LOCALE_META[code].full}</span>
                {active && <Check size={15} className="text-brand-600 dark:text-brand-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
