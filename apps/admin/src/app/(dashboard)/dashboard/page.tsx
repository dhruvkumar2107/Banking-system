'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, PiggyBank, Users, Landmark, TrendingUp, ArrowRight,
  AlertTriangle, CheckCircle, Clock, Activity, Shield, Database,
} from 'lucide-react';
import { useAnalytics, useDashboard, useVillageWise, useReconciliationSummary, useSystemHealth, useRiskAlerts } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useT, type TranslationKey } from '@/lib/i18n';
import { money, formatDayShort, inr } from '@/lib/format';
import {
  Card,
  CardBody,
  CardHeader,
  StatCard,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Badge,
} from '@/components/ui';
import { CollectionChart } from '@/components/charts/CollectionChart';

export default function DashboardPage() {
  const dash = useDashboard();
  const analytics = useAnalytics(14);
  const villages = useVillageWise({});
  const reconciliation = useReconciliationSummary();
  const health = useSystemHealth();
  const risk = useRiskAlerts();
  const { user } = useAuth();
  const t = useT();

  const [greetingKey, setGreetingKey] = useState<TranslationKey>('dashboard.greetingWelcome');
  useEffect(() => {
    const h = new Date().getHours();
    setGreetingKey(
      h < 12
        ? 'dashboard.greetingMorning'
        : h < 17
          ? 'dashboard.greetingAfternoon'
          : 'dashboard.greetingEvening',
    );
  }, []);

  if (dash.isLoading) return <LoadingBlock label={t('dashboard.loading')} />;
  if (dash.isError || !dash.data) return <ErrorState message={(dash.error as Error)?.message} />;

  const d = dash.data;
  const chartData =
    analytics.data?.series.map((p) => ({ label: formatDayShort(p.day), paise: p.collected.paise })) ?? [];

  const topVillages = [...(villages.data ?? [])]
    .sort((a, b) => b.currentBalance.paise - a.currentBalance.paise)
    .slice(0, 5);

  const firstName = user?.name?.split(' ')[0];

  const healthStatus = health.data?.overall ?? 'unknown';
  const healthColor = healthStatus === 'healthy' ? 'text-emerald-500' : healthStatus === 'degraded' ? 'text-amber-500' : 'text-red-500';

  const riskSummary = risk.data?.summary;
  const recon = reconciliation.data;

  return (
    <div className="space-y-6">
      <div className="card card-topline relative overflow-hidden p-6 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-muted">
              {t(greetingKey)}
              {firstName ? `, ${firstName}` : ''}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="text-gradient">{t('dashboard.title')}</span>{' '}
              <span className="text-ink">{t('dashboard.titleSuffix')}</span>
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-ink-muted">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs">
              <Activity size={14} className={healthColor} />
              <span className="text-ink-muted">System</span>
              <span className={`font-semibold capitalize ${healthColor}`}>{healthStatus}</span>
            </div>
            <Link href="/collection" className="btn-primary shrink-0">
              <Wallet size={16} /> {t('dashboard.recordCollection')}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.todaysCollection')}
          value={money(d.todayCollection)}
          icon={<Wallet size={20} />}
          tone="indigo"
          hint={t('dashboard.successfulToday', { count: d.todayCounts.success })}
        />
        <StatCard
          label={t('dashboard.totalBalance')}
          value={money(d.totalBalance)}
          icon={<Landmark size={20} />}
          tone="green"
          hint={t('dashboard.acrossAllAccounts')}
        />
        <StatCard
          label={t('dashboard.activeAccounts')}
          value={d.activeAccounts.toLocaleString('en-IN')}
          icon={<PiggyBank size={20} />}
          tone="amber"
        />
        <StatCard
          label={t('dashboard.totalCustomers')}
          value={d.totalCustomers.toLocaleString('en-IN')}
          icon={<Users size={20} />}
          tone="slate"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recon && (
          <Card>
            <CardHeader title="Reconciliation" subtitle="Financial integrity" />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">Matched</span>
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={14} className="text-emerald-500" />
                  <Badge tone="green">{recon.matchedEntries}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">Missing entries</span>
                <div className="flex items-center gap-1.5">
                  {recon.missingEntries > 0 && <AlertTriangle size={14} className="text-amber-500" />}
                  <Badge tone={recon.missingEntries > 0 ? 'amber' : 'green'}>{recon.missingEntries}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">Stale pending</span>
                <div className="flex items-center gap-1.5">
                  {recon.stalePending > 0 && <Clock size={14} className="text-amber-500" />}
                  <Badge tone={recon.stalePending > 0 ? 'amber' : 'green'}>{recon.stalePending}</Badge>
                </div>
              </div>
              <div className="border-t border-line-soft pt-3">
                <Link href="/reconciliation" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View Reconciliation Center <ArrowRight size={12} className="inline" />
                </Link>
              </div>
            </CardBody>
          </Card>
        )}

        {riskSummary && (
          <Card>
            <CardHeader title="Risk Alerts" subtitle="Fraud detection" />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">Critical</span>
                <Badge tone={riskSummary.critical > 0 ? 'red' : 'green'}>{riskSummary.critical}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">High</span>
                <Badge tone={riskSummary.high > 0 ? 'red' : 'green'}>{riskSummary.high}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">Medium</span>
                <Badge tone={riskSummary.medium > 0 ? 'amber' : 'green'}>{riskSummary.medium}</Badge>
              </div>
              <div className="border-t border-line-soft pt-3">
                <Link href="/risk" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View Risk Center <ArrowRight size={12} className="inline" />
                </Link>
              </div>
            </CardBody>
          </Card>
        )}

        {health.data && (
          <Card>
            <CardHeader title="System Health" subtitle="Platform status" />
            <CardBody className="space-y-3">
              {health.data.components.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <span className="text-sm text-ink-soft capitalize">{c.name}</span>
                  <div className="flex items-center gap-1.5">
                    {c.status === 'healthy' ? (
                      <CheckCircle size={14} className="text-emerald-500" />
                    ) : c.status === 'degraded' ? (
                      <AlertTriangle size={14} className="text-amber-500" />
                    ) : (
                      <AlertTriangle size={14} className="text-red-500" />
                    )}
                    <Badge tone={c.status === 'healthy' ? 'green' : c.status === 'degraded' ? 'amber' : 'red'}>
                      {c.latencyMs}ms
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="border-t border-line-soft pt-3">
                <Link href="/system-health" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View System Health <ArrowRight size={12} className="inline" />
                </Link>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('dashboard.collectionTrend')}
            subtitle={t('dashboard.collectionTrendSubtitle')}
            action={
              <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                {t('analytics.title')} <ArrowRight size={13} />
              </Link>
            }
          />
          <CardBody>
            {analytics.isLoading ? (
              <LoadingBlock />
            ) : chartData.length ? (
              <CollectionChart data={chartData} />
            ) : (
              <EmptyState title={t('dashboard.noCollectionData')} icon={<TrendingUp size={22} />} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('dashboard.todayAtAGlance')} />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">{t('common.successful')}</span>
              <Badge tone="green">{d.todayCounts.success}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">{t('status.pending')}</span>
              <Badge tone="amber">{d.todayCounts.pending}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">{t('status.failed')}</span>
              <Badge tone="red">{d.todayCounts.failed}</Badge>
            </div>
            <div className="border-t border-line-soft pt-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">{t('dashboard.allTimeCollected')}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{money(d.totalCollectedAllTime)}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t('dashboard.topVillages')}
          action={
            <Link href="/reports/village-wise" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              {t('common.allVillages')} <ArrowRight size={13} />
            </Link>
          }
        />
        <CardBody>
          {villages.isLoading ? (
            <LoadingBlock />
          ) : topVillages.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topVillages.map((v) => (
                <Link
                  key={v.id}
                  href={`/villages/${v.id}`}
                  className="group rounded-xl border border-line bg-surface/40 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-400/60 hover:shadow-glow"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{v.name}</p>
                    <Badge tone="indigo">{v.code}</Badge>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-ink">{money(v.currentBalance)}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {t('dashboard.villageCounts', { customers: v.customers, accounts: v.accounts })}
                  </p>
                  <p className="mt-1 text-xs text-emerald-600">
                    {t('dashboard.villageCollected', { amount: inr(v.collected.paise) })}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t('dashboard.noVillages')} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
