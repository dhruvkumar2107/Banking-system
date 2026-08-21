import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'Nothing here yet',
  message,
  icon,
  action,
}: {
  title?: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
        {icon ?? <Inbox size={22} />}
      </div>
      <div>
        <p className="text-sm font-medium text-ink-soft">{title}</p>
        {message && <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Something went wrong</p>
      <p className="max-w-sm text-sm text-ink-muted">{message ?? 'Please try again.'}</p>
    </div>
  );
}
