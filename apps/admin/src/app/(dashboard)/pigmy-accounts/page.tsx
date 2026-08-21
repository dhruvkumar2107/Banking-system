'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, PiggyBank } from 'lucide-react';
import { usePigmyAccounts } from '@/lib/hooks';
import { useDebounce } from '@/lib/useDebounce';
import { money } from '@/lib/format';
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

export default function PigmyAccountsPage() {
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
        title="Pigmy Accounts"
        subtitle="All daily micro-savings accounts across villages."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Search" className="min-w-[220px] flex-1">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <Input
                  className="pl-9"
                  placeholder="Account number, name, mobile…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
            </Field>
            <Field label="Status" className="w-44">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
          </div>

          {accounts.isError ? (
            <ErrorState message="Could not load accounts." />
          ) : accounts.isLoading ? (
            <LoadingBlock />
          ) : accounts.data && accounts.data.data.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Account</Th>
                      <Th>Customer</Th>
                      <Th>Village</Th>
                      <Th>Daily</Th>
                      <Th>Balance</Th>
                      <Th>Deposited</Th>
                      <Th>Status</Th>
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
            <EmptyState title="No accounts found" icon={<PiggyBank size={22} />} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
