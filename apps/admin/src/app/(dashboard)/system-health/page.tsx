'use client';

import { Activity, Database, Server, Clock, RefreshCw } from 'lucide-react';
import { useSystemHealth, useSystemStats } from '@/lib/hooks';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  Badge,
  LoadingBlock,
  ErrorState,
  Button,
} from '@/components/ui';

export default function SystemHealthPage() {
  const t = useT();
  const health = useSystemHealth();
  const stats = useSystemStats();

  function statusTone(status: string) {
    switch (status) {
      case 'healthy': return 'green' as const;
      case 'degraded': return 'yellow' as const;
      case 'down': return 'red' as const;
      default: return 'slate' as const;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        subtitle="Platform status and operational metrics"
        action={
          <Button
            variant="outline"
            onClick={() => { health.refetch(); stats.refetch(); }}
            icon={<RefreshCw size={16} className={health.isFetching ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
        }
      />

      {/* Health Status Cards */}
      {health.isLoading ? (
        <LoadingBlock />
      ) : health.isError ? (
        <ErrorState message={(health.error as Error)?.message} />
      ) : health.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Overall Status"
            value={health.data.status}
            icon={<Activity size={20} />}
            tone={statusTone(health.data.status)}
          />
          <StatusCard
            title="Database"
            value={health.data.database.status}
            icon={<Database size={20} />}
            tone={statusTone(health.data.database.status)}
            subtitle={`${health.data.database.latencyMs}ms latency`}
          />
          <StatusCard
            title="Transactions"
            value={health.data.transactions.status}
            icon={<Server size={20} />}
            tone={statusTone(health.data.transactions.status)}
            subtitle={`${health.data.transactions.pendingCount} pending`}
          />
          <StatusCard
            title="Last Check"
            value={formatDateTime(health.data.timestamp)}
            icon={<Clock size={20} />}
            tone="slate"
          />
        </div>
      ) : null}

      {/* System Statistics */}
      <Card>
        <CardBody>
          <h3 className="mb-4 text-lg font-medium text-ink">System Statistics</h3>
          {stats.isLoading ? (
            <LoadingBlock />
          ) : stats.isError ? (
            <ErrorState message={(stats.error as Error)?.message} />
          ) : stats.data ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatItem label="Total Customers" value={stats.data.totalCustomers} />
              <StatItem label="Active Pigmy Accounts" value={stats.data.activePigmyAccounts} />
              <StatItem label="Total Transactions" value={stats.data.totalTransactions} />
              <StatItem label="Pending Withdrawals" value={stats.data.pendingWithdrawals} />
              <StatItem label="Pending Loans" value={stats.data.pendingLoans} />
              <StatItem label="KYC Pending" value={stats.data.kycPending} />
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Transaction Health Details */}
      {health.data && (
        <Card>
          <CardBody>
            <h3 className="mb-4 text-lg font-medium text-ink">Transaction Health</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-ink-line bg-surface-2 p-4">
                <p className="text-sm text-ink-muted">Today&apos;s Transactions</p>
                <p className="text-2xl font-bold text-ink">{health.data.transactions.todayCount}</p>
              </div>
              <div className="rounded-lg border border-ink-line bg-surface-2 p-4">
                <p className="text-sm text-ink-muted">Today&apos;s Volume</p>
                <p className="text-2xl font-bold text-ink">
                  ₹{(health.data.transactions.todayVolume / 100).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="rounded-lg border border-ink-line bg-surface-2 p-4">
                <p className="text-sm text-ink-muted">Pending Transactions</p>
                <p className="text-2xl font-bold text-ink">{health.data.transactions.pendingCount}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatusCard({ title, value, icon, tone, subtitle }: { title: string; value: string; icon: React.ReactNode; tone: string; subtitle?: string }) {
  const toneStyles: Record<string, string> = {
    green: 'text-green-600 bg-green-soft border-green-line',
    yellow: 'text-yellow-600 bg-yellow-soft border-yellow-line',
    red: 'text-red-600 bg-red-soft border-red-line',
    slate: 'text-slate-600 bg-slate-100 border-slate-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${toneStyles[tone] || toneStyles.slate}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <p className="text-2xl font-bold capitalize">{value}</p>
          {subtitle && <p className="text-xs opacity-70">{subtitle}</p>}
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-line bg-surface-2 p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-2xl font-bold text-ink">{value.toLocaleString('en-IN')}</p>
    </div>
  );
}
