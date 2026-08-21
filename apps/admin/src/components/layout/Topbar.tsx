'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { NAV_TITLES } from './nav';
import { ThemeToggle } from './ThemeToggle';

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  agent: 'Agent',
};

function titleFor(pathname: string): string {
  if (NAV_TITLES[pathname]) return NAV_TITLES[pathname];
  if (pathname.startsWith('/customers/')) return 'Customer 360°';
  if (pathname.startsWith('/villages/')) return 'Village Details';
  if (pathname.startsWith('/pigmy-accounts/')) return 'Account Details';
  return 'Digital Pigmee';
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
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
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{titleFor(pathname)}</h2>
      </div>

      <div className="flex items-center gap-1.5">
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
                {user ? ROLE_LABEL[user.role] : ''}
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
                <UserRound size={16} className="text-ink-muted" /> Account &amp; settings
              </a>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-500/10"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
