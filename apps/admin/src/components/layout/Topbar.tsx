'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { useT, type Translator } from '@/lib/i18n';
import { NAV_TITLE_KEYS } from './nav';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';

function titleFor(pathname: string, t: Translator): string {
  const key = NAV_TITLE_KEYS[pathname];
  if (key) return t(key);
  if (pathname.startsWith('/customers/')) return t('customers.detailTitle');
  if (pathname.startsWith('/villages/')) return t('villages.detailTitle');
  if (pathname.startsWith('/pigmy-accounts/')) return t('accounts.detailTitle');
  if (pathname.startsWith('/loans/')) return t('loans.detailTitle');
  return 'Digital Pigmee';
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line/70 bg-surface/60 px-4 backdrop-blur-xl backdrop-saturate-150 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          className="rounded-xl p-2 text-ink-soft transition hover:bg-surface-2 lg:hidden"
          onClick={onMenu}
          aria-label={t('common.openMenu')}
        >
          <Menu size={20} />
        </button>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{titleFor(pathname, t)}</h2>
      </div>

      <div className="flex items-center gap-1.5">
        <LanguageToggle />
        <ThemeToggle />

        <div className="relative" ref={ref}>
          <button
            className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 transition hover:bg-surface-2"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white shadow-glow ring-2 ring-white/20">
              {initials(user?.name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-ink">{user?.name}</span>
              <span className="block text-[11px] leading-tight text-ink-muted">
                {user ? t(`role.${user.role}`) : ''}
              </span>
            </span>
            <ChevronDown size={16} className="text-ink-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-line/70 bg-surface/90 shadow-pop backdrop-blur-xl animate-scale-in">
              <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white">
                  {initials(user?.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
                  <p className="truncate text-xs text-ink-muted">{user?.email}</p>
                </div>
              </div>
              <a
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-soft transition hover:bg-surface-2"
              >
                <UserRound size={16} className="text-ink-muted" /> {t('nav.accountSettings')}
              </a>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-500/10"
              >
                <LogOut size={16} /> {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
