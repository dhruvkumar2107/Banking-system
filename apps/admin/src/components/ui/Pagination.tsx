'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export function Pagination({
  page,
  pages,
  total,
  limit,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}) {
  const t = useT();
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-ink-muted">
      {/* One sentence, not stitched fragments: hi/kn put the total first. */}
      <span>{t('common.showingRange', { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium transition',
            page <= 1 ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-2',
          )}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} /> {t('common.prev')}
        </button>
        <span className="px-2 text-xs">
          {t('common.pageOf', { page, pages: Math.max(pages, 1) })}
        </span>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium transition',
            page >= pages ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-2',
          )}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          {t('common.next')} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
