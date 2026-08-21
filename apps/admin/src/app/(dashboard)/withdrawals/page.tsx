'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, CheckCircle2, HandCoins, Hourglass } from 'lucide-react';
import { useVillages, useWithdrawals, useWithdrawalsPendingCount } from '@/lib/hooks';
import { useDebounce } from '@/lib/useDebounce';
import { money, relativeTime } from '@/lib/format';
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

export default function WithdrawalsPage() {
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
        title="Withdrawals"
        subtitle="Maker-checker approvals. A request only moves money when an approver records the payout."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Pending approval"
          value={pending.data?.pending ?? '—'}
          icon={<Hourglass size={20} />}
          tone="amber"
          hint="Waiting on an admin decision"
        />
        <StatCard
          label="Awaiting payout"
          value={awaitingPayout.data?.total ?? '—'}
          icon={<HandCoins size={20} />}
          tone="indigo"
          hint="Approved — money not yet handed over"
        />
        <StatCard
          label="Paid all time"
          value={paid.data?.total ?? '—'}
          icon={<CheckCircle2 size={20} />}
          tone="green"
          hint="Completed payouts"
        />
      </div>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Banknote size={16} className="text-brand-600 dark:text-brand-300" /> Requests
            </span>
          }
          subtitle="Newest first."
          action={list.data ? <Badge tone="slate">{list.data.total} total</Badge> : null}
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Status" className="w-44">
              <Select value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" className="w-40">
              <Select value={kind} onChange={(e) => reset(() => setKind(e.target.value))}>
                <option value="">All types</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Village" className="w-52">
              <Select value={villageId} onChange={(e) => reset(() => setVillageId(e.target.value))}>
                <option value="">All villages</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Search" className="min-w-[16rem] flex-1">
              <Input
                value={search}
                onChange={(e) => reset(() => setSearch(e.target.value))}
                placeholder="Name, mobile or account number…"
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
                    <Th>Requested</Th>
                    <Th>Customer</Th>
                    <Th>Account</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Net payable</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Review</Th>
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
                          balance {money(w.accountBalance)}
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
                            {w.interest.paise > 0 && ` + ${money(w.interest)} int`}
                            {w.penalty.paise > 0 && ` − ${money(w.penalty)} penalty`}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <WithdrawalStatusBadge status={w.status} compact />
                      </Td>
                      <Td className="text-right">
                        <Link href={`/withdrawals/${w.id}`}>
                          <Button size="sm" variant="ghost">
                            Open <ArrowRight size={14} />
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
                  ? 'Nothing waiting for approval 🎉'
                  : 'No withdrawal requests match these filters'
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
