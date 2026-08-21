'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
