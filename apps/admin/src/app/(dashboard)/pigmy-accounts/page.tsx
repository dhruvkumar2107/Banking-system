'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, PiggyBank } from 'lucide-react';
import { usePigmyAccounts } from '@/lib/hooks';
import { useDebounce } from '@/lib/useDebounce';
import { money } from '@/lib/format';
import { useT } from '@/lib/i18n';
import {
  PageHeader,
  Card,
  CardBody,
  Input,
  Select,
  Field,
  StatusBadge,
  Pagination,
  LoadingBlock,
  EmptyState,
  ErrorState,
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/ui';

/** Labels come from the shared `status.*` keys via a composed lookup. */
const STATUSES = ['active', 'inactive', 'closed'] as const;

export default function PigmyAccountsPage() {
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);

  const accounts = usePigmyAccounts({
    search: debounced || undefined,
    status: status || undefined,
    page,
    limit: 15,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('accounts.title')}
        subtitle={t('accounts.subtitle')}
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('common.search')} className="min-w-[220px] flex-1">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <Input
                  className="pl-9"
                  placeholder={t('accounts.searchPlaceholder')}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
            </Field>
            <Field label={t('common.status')} className="w-44">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">{t('common.allStatuses')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </Select>
            </Field>
          </div>

          {accounts.isError ? (
            <ErrorState message={t('accounts.loadError')} />
          ) : accounts.isLoading ? (
            <LoadingBlock />
          ) : accounts.data && accounts.data.data.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t('common.account')}</Th>
                      <Th>{t('common.customer')}</Th>
                      <Th>{t('common.village')}</Th>
                      <Th>{t('common.daily')}</Th>
                      <Th>{t('common.balance')}</Th>
                      <Th>{t('common.deposited')}</Th>
                      <Th>{t('common.status')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {accounts.data.data.map((a) => (
                      <Tr key={a.id} onClick={() => router.push(`/pigmy-accounts/${a.id}`)} className="cursor-pointer">
                        <Td className="font-mono text-xs font-medium text-ink">{a.accountNumber}</Td>
                        <Td>
                          <div className="font-medium text-ink">{a.customer?.name}</div>
                          <div className="text-xs text-ink-muted">{a.customer?.mobile}</div>
                        </Td>
                        <Td>{a.village}</Td>
                        <Td>{money(a.dailyAmount)}</Td>
                        <Td className="font-semibold text-ink">{money(a.currentBalance)}</Td>
                        <Td>{money(a.totalDeposited)}</Td>
                        <Td><StatusBadge status={a.status} /></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
              <Pagination
                page={accounts.data.page}
                pages={accounts.data.pages}
                total={accounts.data.total}
                limit={accounts.data.limit}
                onPage={setPage}
              />
            </>
          ) : (
            <EmptyState title={t('accounts.noneFound')} icon={<PiggyBank size={22} />} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
