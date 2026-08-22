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
  Landmark,
  ShieldCheck,
  CalendarRange,
  Map,
  TrendingUp,
  Bell,
  FileClock,
  Settings,
} from 'lucide-react';
import type { AdminRole } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n/dictionaries';

export interface NavItem {
  href: string;
  /** i18n key resolved by the Sidebar / Topbar via useT(). */
  labelKey: TranslationKey;
  icon: LucideIcon;
  roles?: AdminRole[]; // undefined = all roles
  /** Live counter rendered next to the label. */
  badge?: 'withdrawalsPending';
}

export interface NavGroup {
  titleKey: TranslationKey;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    titleKey: 'nav.groupOverview',
    items: [
      { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { href: '/collection', labelKey: 'nav.collection', icon: Wallet },
    ],
  },
  {
    titleKey: 'nav.groupManage',
    items: [
      { href: '/villages', labelKey: 'nav.villages', icon: Building2 },
      { href: '/customers', labelKey: 'nav.customers', icon: Users },
      { href: '/pigmy-accounts', labelKey: 'nav.pigmyAccounts', icon: PiggyBank },
      // Agents may read the KYC queue but not decide on submissions.
      { href: '/kyc', labelKey: 'nav.kyc', icon: ShieldCheck, roles: ['superadmin', 'admin', 'agent'] },
    ],
  },
  {
    titleKey: 'nav.groupPayments',
    items: [
      { href: '/transactions', labelKey: 'nav.transactions', icon: Receipt },
      { href: '/pending-payments', labelKey: 'nav.pendingPayments', icon: Clock },
      {
        href: '/withdrawals',
        labelKey: 'nav.withdrawals',
        icon: HandCoins,
        badge: 'withdrawalsPending',
      },
      { href: '/loans', labelKey: 'nav.loans', icon: Landmark, roles: ['superadmin', 'admin'] },
    ],
  },
  {
    titleKey: 'nav.groupInsights',
    items: [
      { href: '/reports/date-wise', labelKey: 'nav.dateWise', icon: CalendarRange },
      { href: '/reports/village-wise', labelKey: 'nav.villageWise', icon: Map },
      { href: '/analytics', labelKey: 'nav.analytics', icon: TrendingUp },
    ],
  },
  {
    titleKey: 'nav.groupSystem',
    items: [
      { href: '/notifications', labelKey: 'nav.notifications', icon: Bell, roles: ['superadmin', 'admin'] },
      { href: '/audit-logs', labelKey: 'nav.auditLogs', icon: FileClock, roles: ['superadmin', 'admin'] },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
];

/** Flat lookup of href → i18n key for page titles. */
export const NAV_TITLE_KEYS: Record<string, TranslationKey> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.href, i.labelKey] as const),
);
