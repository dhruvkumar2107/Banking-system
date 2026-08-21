'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let counter = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = counter++;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />,
    error: <AlertCircle size={18} className="text-rose-600 dark:text-rose-400" />,
    info: <Info size={18} className="text-sky-600 dark:text-sky-400" />,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 shadow-pop animate-slide-up',
              t.kind === 'success' && 'border-emerald-200 dark:border-emerald-500/30',
              t.kind === 'error' && 'border-rose-200 dark:border-rose-500/30',
              t.kind === 'info' && 'border-sky-200 dark:border-sky-500/30',
            )}
          >
            {icons[t.kind]}
            <p className="flex-1 text-sm text-ink-soft">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="text-ink-faint transition hover:text-ink"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
