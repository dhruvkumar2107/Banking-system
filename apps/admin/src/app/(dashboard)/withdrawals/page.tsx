'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, CheckCircle2, HandCoins, Hourglass } from 'lucide-react';
import { useVillages, useWithdrawals, useWithdrawalsPendingCount } from '@/lib/hooks';
import { useDebounce } from '@/lib/useDebounce';
import { money, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { WithdrawalKindBadge, WithdrawalStatusBadge } from '@/components/WithdrawalBadges';
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

const STATUSES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'] as const;
const KINDS = ['partial', 'closure', 'maturity'] as const;

/** Kind labels live under hand-cased keys, so map rather than compose. */
const KIND_KEY = {
  partial: 'withdrawals.kindPartialShort',
  closure: 'withdrawals.kindClosureShort',
  maturity: 'withdrawals.kindMaturityShort',
} as const;

export default function WithdrawalsPage() {
  const t = useT();
  // Default to the work that needs a human: the approval queue.
  const [status, setStatus] = useState<string>('pending');
  const [kind, setKind] = useState('');
  const [villageId, setVillageId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const limit = 20;

  const villages = useVillages();
  const list = useWithdrawals({
    page,
    limit,
    status: status || undefined,
    kind: kind || undefined,
    villageId: villageId || undefined,
    search: debounced || undefined,
  });

  // Head-line counters. `limit: 1` — we only read `.total`.
  const pending = useWithdrawalsPendingCount();
  const awaitingPayout = useWithdrawals({ status: 'approved', page: 1, limit: 1 });
  const paid = useWithdrawals({ status: 'paid', page: 1, limit: 1 });

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('withdrawals.title')}
        subtitle={t('withdrawals.subtitle')}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('withdrawals.statPendingApproval')}
          value={pending.data?.pending ?? '—'}
          icon={<Hourglass size={20} />}
          tone="amber"
          hint={t('withdrawals.hintPendingApproval')}
        />
        <StatCard
          label={t('withdrawals.statAwaitingPayout')}
          value={awaitingPayout.data?.total ?? '—'}
          icon={<HandCoins size={20} />}
          tone="indigo"
          hint={t('withdrawals.hintAwaitingPayout')}
        />
        <StatCard
          label={t('withdrawals.statPaidAllTime')}
          value={paid.data?.total ?? '—'}
          icon={<CheckCircle2 size={20} />}
          tone="green"
          hint={t('withdrawals.hintPaidAllTime')}
        />
      </div>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Banknote size={16} className="text-brand-600 dark:text-brand-300" />{' '}
              {t('withdrawals.requests')}
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
            <Field label={t('common.status')} className="w-44">
              <Select value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
                <option value="">{t('common.allStatuses')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.type')} className="w-40">
              <Select value={kind} onChange={(e) => reset(() => setKind(e.target.value))}>
                <option value="">{t('withdrawals.allTypes')}</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_KEY[k])}
                  </option>
                ))}
              </Select>
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
                placeholder={t('withdrawals.searchPlaceholder')}
              />
            </Field>
          </div>

          {list.isLoading ? (
            <LoadingBlock />
          ) : list.isError ? (
            <ErrorState message={(list.error as Error)?.message} />
          ) : list.data && list.data.data.length ? (
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <Th>{t('withdrawals.colRequested')}</Th>
                    <Th>{t('common.customer')}</Th>
                    <Th>{t('common.account')}</Th>
                    <Th>{t('common.type')}</Th>
                    <Th className="text-right">{t('withdrawals.colNetPayable')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th className="text-right">{t('withdrawals.colReview')}</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {list.data.data.map((w) => (
                    <Tr key={w.id}>
                      <Td className="whitespace-nowrap text-xs text-ink-muted">
                        {relativeTime(w.requestedAt)}
                      </Td>
                      <Td>
                        <div className="font-medium text-ink">{w.customer.name}</div>
                        <div className="text-xs text-ink-muted">
                          {w.customer.mobile} · {w.village}
                        </div>
                      </Td>
                      <Td>
                        <Link
                          href={`/pigmy-accounts/${w.pigmyAccountId}`}
                          className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-300"
                        >
                          {w.accountNumber}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {t('withdrawals.rowBalance', { amount: money(w.accountBalance) })}
                        </div>
                      </Td>
                      <Td>
                        <WithdrawalKindBadge kind={w.kind} compact />
                      </Td>
                      <Td className="text-right">
                        <div className="font-semibold text-ink">{money(w.netPayable)}</div>
                        {(w.penalty.paise > 0 || w.interest.paise > 0) && (
                          <div className="text-xs text-ink-muted">
                            {money(w.amount)}
                            {w.interest.paise > 0 &&
                              ` ${t('withdrawals.rowInterest', { amount: money(w.interest) })}`}
                            {w.penalty.paise > 0 &&
                              ` ${t('withdrawals.rowPenalty', { amount: money(w.penalty) })}`}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <WithdrawalStatusBadge status={w.status} compact />
                      </Td>
                      <Td className="text-right">
                        <Link href={`/withdrawals/${w.id}`}>
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
                status === 'pending'
                  ? t('withdrawals.emptyPending')
                  : t('withdrawals.emptyFiltered')
              }
              icon={<HandCoins size={22} />}
            />
          )}

          {list.data && list.data.data.length > 0 && (
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
