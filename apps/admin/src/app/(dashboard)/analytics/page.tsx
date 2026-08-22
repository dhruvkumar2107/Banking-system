'use client';

import { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAnalytics } from '@/lib/hooks';
import { inr, formatDayShort } from '@/lib/format';
import { useT, type TranslationKey } from '@/lib/i18n';
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

/** Labels are i18n keys — `t()` cannot run at module scope, so they resolve at render. */
const RANGES: { days: number; labelKey: TranslationKey }[] = [
  { days: 7, labelKey: 'analytics.range7' },
  { days: 14, labelKey: 'analytics.range14' },
  { days: 30, labelKey: 'analytics.range30' },
  { days: 90, labelKey: 'analytics.range90' },
];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const report = useAnalytics(days);
  const t = useT();

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
    { label: t('status.success'), value: totals.success, color: '#059669' },
    { label: t('status.pending'), value: totals.pending, color: '#d97706' },
    { label: t('status.failed'), value: totals.failed, color: '#e11d48' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
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
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('analytics.totalCollected')} value={inr(totals.collected)} icon={<TrendingUp size={20} />} tone="green" />
        <StatCard label={t('analytics.avgPerDay')} value={inr(totals.avgPerDay)} icon={<BarChart3 size={20} />} tone="indigo" hint={t('analytics.activeDays', { count: totals.activeDays })} />
        <StatCard label={t('common.successful')} value={totals.success} icon={<CheckCircle2 size={20} />} tone="green" />
        <StatCard label={t('status.failed')} value={totals.failed} icon={<XCircle size={20} />} tone="red" />
      </div>

      <Card>
        <CardHeader title={t('analytics.collectionTrend')} subtitle={t('analytics.collectionTrendSubtitle', { days })} />
        <CardBody>
          {report.isError ? (
            <ErrorState message={t('analytics.loadError')} />
          ) : report.isLoading ? (
            <LoadingBlock />
          ) : chartData.length ? (
            <CollectionChart data={chartData} />
          ) : (
            <EmptyState title={t('analytics.noCollectionData')} icon={<BarChart3 size={22} />} />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('analytics.paymentOutcomes')} subtitle={t('analytics.paymentOutcomesSubtitle')} />
          <CardBody>
            {report.isError ? (
              <ErrorState message={t('analytics.loadError')} />
            ) : report.isLoading ? (
              <LoadingBlock />
            ) : totals.success + totals.pending + totals.failed > 0 ? (
              <CountBars data={statusBars} />
            ) : (
              <EmptyState title={t('analytics.noTransactionsInRange')} icon={<Clock size={22} />} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('analytics.successRate')} subtitle={t('analytics.successRateSubtitle')} />
          <CardBody>
            <SuccessRate success={totals.success} pending={totals.pending} failed={totals.failed} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function SuccessRate({ success, pending, failed }: { success: number; pending: number; failed: number }) {
  const t = useT();
  const total = success + pending + failed;
  const pct = total ? Math.round((success / total) * 100) : 0;
  const seg = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold text-ink">{pct}%</span>
        <span className="text-sm text-ink-muted">{t('analytics.succeededOf', { total })}</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="bg-emerald-500" style={{ width: `${seg(success)}%` }} />
        <div className="bg-amber-400" style={{ width: `${seg(pending)}%` }} />
        <div className="bg-rose-500" style={{ width: `${seg(failed)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Legend color="bg-emerald-500" label={t('status.success')} value={success} />
        <Legend color="bg-amber-400" label={t('status.pending')} value={pending} />
        <Legend color="bg-rose-500" label={t('status.failed')} value={failed} />
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
