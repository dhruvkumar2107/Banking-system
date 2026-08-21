import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  Building2,
  Users,
  PiggyBank,
  Receipt,
  Clock,
  HandCoins,
  CalendarRange,
  Map,
  TrendingUp,
  Bell,
  FileClock,
  Settings,
} from 'lucide-react';
import type { AdminRole } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: AdminRole[]; // undefined = all roles
  /** Live counter rendered next to the label. */
  badge?: 'withdrawalsPending';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/collection', label: "Today's Collection", icon: Wallet },
    ],
  },
  {
    title: 'Manage',
    items: [
      { href: '/villages', label: 'Villages', icon: Building2 },
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/pigmy-accounts', label: 'Pigmy Accounts', icon: PiggyBank },
    ],
  },
  {
    title: 'Payments',
    items: [
      { href: '/transactions', label: 'Transactions', icon: Receipt },
      { href: '/pending-payments', label: 'Pending Payments', icon: Clock },
      {
        href: '/withdrawals',
        label: 'Withdrawals',
        icon: HandCoins,
        badge: 'withdrawalsPending',
      },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/reports/date-wise', label: 'Date-wise Reports', icon: CalendarRange },
      { href: '/reports/village-wise', label: 'Village-wise Reports', icon: Map },
      { href: '/analytics', label: 'Collection Analytics', icon: TrendingUp },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/notifications', label: 'Notifications', icon: Bell, roles: ['superadmin', 'admin'] },
      { href: '/audit-logs', label: 'Audit Logs', icon: FileClock, roles: ['superadmin', 'admin'] },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** Flat lookup of href → label for page titles. */
export const NAV_TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.href, i.label]),
);
