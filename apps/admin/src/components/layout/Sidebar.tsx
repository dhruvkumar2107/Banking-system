'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PiggyBank, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { useWithdrawalsPendingCount } from '@/lib/hooks';
import { NAV } from './nav';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  // Polled so a request raised from the app shows up without a reload.
  const pendingWithdrawals = useWithdrawalsPendingCount();
  const badgeCount = (key: NonNullable<(typeof NAV)[number]['items'][number]['badge']>) =>
    key === 'withdrawalsPending' ? (pendingWithdrawals.data?.pending ?? 0) : 0;

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line/70 bg-surface/70 backdrop-blur-xl transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line-soft px-5">
          <Link href="/dashboard" className="group flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow transition duration-300 group-hover:scale-105 group-hover:rotate-3">
              <PiggyBank size={20} />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-gradient">Digital Pigmee</span>
          </Link>
          <button
            className="rounded-lg p-1 text-ink-muted transition hover:bg-surface-2 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV.map((group) => {
            const items = group.items.filter(
              (i) => !i.roles || (user && i.roles.includes(user.role)),
            );
            if (!items.length) return null;
            return (
              <div key={group.title}>
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    const count = item.badge ? badgeCount(item.badge) : 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition duration-200',
                          active
                            ? 'bg-gradient-to-r from-brand-500/15 to-violet-500/10 text-brand-700 shadow-inner-top ring-1 ring-brand-500/15 dark:text-brand-200'
                            : 'text-ink-soft hover:translate-x-0.5 hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-500 to-violet-600 shadow-glow" />
                        )}
                        <Icon
                          size={18}
                          className={cn(
                            'transition',
                            active
                              ? 'text-brand-600 dark:text-brand-300'
                              : 'text-ink-muted group-hover:text-ink-soft',
                          )}
                        />
                        {item.label}
                        {count > 0 && (
                          <span
                            className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300"
                            title={`${count} awaiting approval`}
                          >
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line-soft px-5 py-3 text-[11px] text-ink-faint">
          Corporate Bank · Micro-Savings
        </div>
      </aside>
    </>
  );
}
