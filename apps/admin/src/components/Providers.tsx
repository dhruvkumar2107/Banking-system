'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query';
import { AuthProvider } from '@/lib/auth';
import { LocaleProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/ui';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/* Outside QueryProvider so every screen — including /login, which sits
          outside the dashboard shell — can call useT(). */}
      <LocaleProvider>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
