'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

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
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-ink-muted">
      <span>
        Showing <span className="font-medium text-ink-soft">{from}</span>–
        <span className="font-medium text-ink-soft">{to}</span> of{' '}
        <span className="font-medium text-ink-soft">{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium transition',
            page <= 1 ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-2',
          )}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="px-2 text-xs">
          Page <span className="font-semibold text-ink-soft">{page}</span> / {Math.max(pages, 1)}
        </span>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium transition',
            page >= pages ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-2',
          )}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
