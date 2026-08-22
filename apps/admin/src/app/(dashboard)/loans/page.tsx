'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CircleDollarSign,
  HandCoins,
  Hourglass,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import { useVillages } from '@/lib/hooks';
import { useLoans, useLoansPendingCount, villageLabel } from '@/lib/loans-api';
import { LOAN_STATUSES } from '@/lib/loan-types';
import { useDebounce } from '@/lib/useDebounce';
import { inr, money, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { LoanStatusBadge } from '@/components/LoanBadges';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  StatCard,
  Button,
  Field,
  Input,
  Select,
  Pagination,
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Badge,
} from '@/components/ui';

export default function LoansPage() {
  const t = useT();
  // Default to the work that needs a human: the approval queue.
  const [status, setStatus] = useState<string>('pending');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [villageId, setVillageId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const limit = 20;

  const villages = useVillages();
  const list = useLoans({
    page,
    limit,
    status: status || undefined,
    // Only ever send `true` — the API coerces with Boolean(), which would read
    // the string "false" as on.
    overdueOnly: overdueOnly ? true : undefined,
    villageId: villageId || undefined,
    search: debounced || undefined,
  });

  // Head-line counters. `limit: 1` — we only read `.total`.
  const pending = useLoansPendingCount();
  const awaitingDisbursal = useLoans({ status: 'approved', page: 1, limit: 1 });
  const live = useLoans({ status: 'disbursed', page: 1, limit: 1 });

  const rows = list.data?.data ?? [];
  const outstandingOnPage = rows.reduce((sum, l) => sum + (l.outstanding?.paise ?? 0), 0);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('loans.title')} subtitle={t('loans.queueSubtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('loans.statPendingApplications')}
          value={pending.data?.pending ?? '—'}
          icon={<Hourglass size={20} />}
          tone="amber"
          hint={t('withdrawals.hintPendingApproval')}
        />
        <StatCard
          label={t('loans.statAwaitingDisbursal')}
          value={awaitingDisbursal.data?.total ?? '—'}
          icon={<HandCoins size={20} />}
          tone="indigo"
          hint={t('withdrawals.hintAwaitingPayout')}
        />
        <StatCard
          label={t('loans.statLiveLoans')}
          value={live.data?.total ?? '—'}
          icon={<TrendingUp size={20} />}
          tone="green"
          hint={t('loans.hintLiveLoans')}
        />
        <StatCard
          label={t('loans.statOutstandingOnPage')}
          value={rows.length ? inr(outstandingOnPage) : '—'}
          icon={<CircleDollarSign size={20} />}
          tone="slate"
          hint={t('loans.hintOutstandingOnPage')}
        />
      </div>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Landmark size={16} className="text-brand-600 dark:text-brand-300" />{' '}
              {t('loans.applications')}
            </span>
          }
          subtitle={t('withdrawals.newestFirst')}
          action={
            list.data ? (
              <Badge tone="slate">{t('withdrawals.totalCount', { count: list.data.total })}</Badge>
            ) : null
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('common.status')} className="w-48">
              <Select value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
                <option value="">{t('common.allStatuses')}</option>
                {LOAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('loans.repayment')} className="w-44">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface/70 px-3 py-2 text-sm text-ink-soft shadow-sm transition hover:border-ink-faint/60">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line accent-brand-600"
                  checked={overdueOnly}
                  onChange={(e) => reset(() => setOverdueOnly(e.target.checked))}
                />
                {t('loans.overdueOnly')}
              </label>
            </Field>
            <Field label={t('common.village')} className="w-52">
              <Select value={villageId} onChange={(e) => reset(() => setVillageId(e.target.value))}>
                <option value="">{t('common.allVillages')}</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.search')} className="min-w-[16rem] flex-1">
              <Input
                value={search}
                onChange={(e) => reset(() => setSearch(e.target.value))}
                placeholder={t('loans.searchPlaceholder')}
              />
            </Field>
          </div>

          {list.isLoading ? (
            <LoadingBlock />
          ) : list.isError ? (
            <ErrorState message={(list.error as Error)?.message} />
          ) : rows.length ? (
            <TableWrap>
              <Table className="min-w-[980px]">
                <Thead>
                  <tr>
                    <Th>{t('loans.colLoan')}</Th>
                    <Th>{t('common.customer')}</Th>
                    <Th>{t('common.village')}</Th>
                    <Th className="text-right">{t('loans.principal')}</Th>
                    <Th className="text-right">{t('loans.emi')}</Th>
                    <Th className="text-right">{t('loans.outstanding')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th>{t('loans.requestedAt')}</Th>
                    <Th className="text-right">{t('withdrawals.colReview')}</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {rows.map((l) => (
                    <Tr key={l.id}>
                      <Td>
                        <Link
                          href={`/loans/${l.id}`}
                          className="font-mono text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                        >
                          {l.loanNumber}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {t('loans.tenureMonths', { count: l.tenureMonths })} ·{' '}
                          {t('withdrawals.interestRateValue', { rate: l.interestRatePercent })}
                        </div>
                      </Td>
                      <Td>
                        <div className="font-medium text-ink">{l.customer.name}</div>
                        <div className="text-xs text-ink-muted">{l.customer.mobile}</div>
                      </Td>
                      <Td>
                        <div className="text-sm text-ink-soft">{villageLabel(l.village)}</div>
                        <div className="font-mono text-xs text-ink-muted">{l.accountNumber}</div>
                      </Td>
                      <Td className="text-right font-medium text-ink">{money(l.principal)}</Td>
                      <Td className="text-right">{money(l.emiAmount)}</Td>
                      <Td className="text-right font-semibold text-ink">{money(l.outstanding)}</Td>
                      <Td>
                        <LoanStatusBadge status={l.status} compact />
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-muted">
                        {relativeTime(l.requestedAt)}
                      </Td>
                      <Td className="text-right">
                        <Link href={`/loans/${l.id}`}>
                          <Button size="sm" variant="ghost">
                            {t('common.open')} <ArrowRight size={14} />
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState
              title={
                overdueOnly
                  ? t('loans.emptyOverdue')
                  : status === 'pending'
                    ? t('loans.emptyPending')
                    : t('loans.emptyFiltered')
              }
              icon={<Landmark size={22} />}
            />
          )}

          {list.data && rows.length > 0 && (
            <Pagination
              page={list.data.page}
              pages={list.data.pages}
              total={list.data.total}
              limit={list.data.limit}
              onPage={setPage}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
