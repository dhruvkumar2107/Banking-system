'use client';

import { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAnalytics } from '@/lib/hooks';
import { inr, formatDayShort } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Button,
  LoadingBlock,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { CollectionChart } from '@/components/charts/CollectionChart';
import { CountBars } from '@/components/charts/CountBars';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const report = useAnalytics(days);

  const totals = useMemo(() => {
    const s = report.data?.series ?? [];
    const collected = s.reduce((a, p) => a + p.collected.paise, 0);
    const success = s.reduce((a, p) => a + p.successCount, 0);
    const pending = s.reduce((a, p) => a + p.pendingCount, 0);
    const failed = s.reduce((a, p) => a + p.failedCount, 0);
    const activeDays = s.filter((p) => p.collected.paise > 0).length;
    return {
      collected,
      success,
      pending,
      failed,
      avgPerDay: s.length ? Math.round(collected / s.length) : 0,
      activeDays,
    };
  }, [report.data]);

  const chartData = report.data?.series.map((p) => ({ label: formatDayShort(p.day), paise: p.collected.paise })) ?? [];
  const statusBars = [
    { label: 'Success', value: totals.success, color: '#059669' },
    { label: 'Pending', value: totals.pending, color: '#d97706' },
    { label: 'Failed', value: totals.failed, color: '#e11d48' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Collection trends and payment outcomes over time."
        actions={
          <div className="inline-flex overflow-hidden rounded-lg border border-ink-line">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  days === r.days ? 'bg-brand-600 text-white' : 'bg-surface text-ink-soft hover:bg-surface-2'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Collected" value={inr(totals.collected)} icon={<TrendingUp size={20} />} tone="green" />
        <StatCard label="Avg / Day" value={inr(totals.avgPerDay)} icon={<BarChart3 size={20} />} tone="indigo" hint={`${totals.activeDays} active day(s)`} />
        <StatCard label="Successful" value={totals.success} icon={<CheckCircle2 size={20} />} tone="green" />
        <StatCard label="Failed" value={totals.failed} icon={<XCircle size={20} />} tone="red" />
      </div>

      <Card>
        <CardHeader title="Collection trend" subtitle={`Daily collection over the last ${days} days`} />
        <CardBody>
          {report.isError ? (
            <ErrorState message="Could not load analytics." />
          ) : report.isLoading ? (
            <LoadingBlock />
          ) : chartData.length ? (
            <CollectionChart data={chartData} />
          ) : (
            <EmptyState title="No collection data yet" icon={<BarChart3 size={22} />} />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payment outcomes" subtitle="Transaction counts by status" />
          <CardBody>
            {report.isError ? (
              <ErrorState message="Could not load analytics." />
            ) : report.isLoading ? (
              <LoadingBlock />
            ) : totals.success + totals.pending + totals.failed > 0 ? (
              <CountBars data={statusBars} />
            ) : (
              <EmptyState title="No transactions in this range" icon={<Clock size={22} />} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Success rate" subtitle="Share of transactions that completed" />
          <CardBody>
            <SuccessRate success={totals.success} pending={totals.pending} failed={totals.failed} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function SuccessRate({ success, pending, failed }: { success: number; pending: number; failed: number }) {
  const total = success + pending + failed;
  const pct = total ? Math.round((success / total) * 100) : 0;
  const seg = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold text-ink">{pct}%</span>
        <span className="text-sm text-ink-muted">of {total} transaction(s) succeeded</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="bg-emerald-500" style={{ width: `${seg(success)}%` }} />
        <div className="bg-amber-400" style={{ width: `${seg(pending)}%` }} />
        <div className="bg-rose-500" style={{ width: `${seg(failed)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Legend color="bg-emerald-500" label="Success" value={success} />
        <Legend color="bg-amber-400" label="Pending" value={pending} />
        <Legend color="bg-rose-500" label="Failed" value={failed} />
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-ink-muted">{label}</span>
      <span className="ml-auto font-semibold text-ink">{value}</span>
    </div>
  );
}
