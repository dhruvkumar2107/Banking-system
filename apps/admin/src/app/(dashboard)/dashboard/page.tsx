'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, PiggyBank, Users, Landmark, TrendingUp, ArrowRight } from 'lucide-react';
import { useAnalytics, useDashboard, useVillageWise } from '@/lib/hooks';
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
  const { user } = useAuth();
  const t = useT();

  // Time-of-day greeting is resolved client-side to avoid SSR hydration drift.
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
    analytics.data?.series.map((p) => ({ label: formatDayShort(p.day), paise: p.collected.paise })) ??
    [];

  const topVillages = [...(villages.data ?? [])]
    .sort((a, b) => b.currentBalance.paise - a.currentBalance.paise)
    .slice(0, 5);

  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
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
              {firstName ? `, ${firstName}` : ''} 👋
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="text-gradient">{t('dashboard.title')}</span>{' '}
              <span className="text-ink">{t('dashboard.titleSuffix')}</span>
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-ink-muted">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <Link href="/collection" className="btn-primary shrink-0">
            <Wallet size={16} /> {t('dashboard.recordCollection')}
          </Link>
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
