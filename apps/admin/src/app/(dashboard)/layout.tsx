import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
