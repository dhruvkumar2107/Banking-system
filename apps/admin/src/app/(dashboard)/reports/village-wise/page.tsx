'use client';

import { useMemo, useState } from 'react';
import { Map } from 'lucide-react';
import Link from 'next/link';
import { useVillageWise } from '@/lib/hooks';
import { money, inr } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Button,
  StatCard,
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

export default function VillageWiseReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const report = useVillageWise({
    from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
    to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
  });

  const totals = useMemo(() => {
    const r = report.data ?? [];
    return {
      balance: r.reduce((a, v) => a + v.currentBalance.paise, 0),
      collected: r.reduce((a, v) => a + v.collected.paise, 0),
      customers: r.reduce((a, v) => a + v.customers, 0),
      accounts: r.reduce((a, v) => a + v.accounts, 0),
    };
  }, [report.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Village-wise Reports" subtitle="Balances and collections broken down by village." />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Collected from" className="w-40"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Collected to" className="w-40"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button variant="outline" onClick={() => { setFrom(''); setTo(''); }}>Reset</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Balance" value={inr(totals.balance)} tone="green" />
        <StatCard label="Collected (range)" value={inr(totals.collected)} tone="indigo" />
        <StatCard label="Customers" value={totals.customers} tone="amber" />
        <StatCard label="Accounts" value={totals.accounts} tone="slate" />
      </div>

      <Card>
        <CardHeader title="By village" />
        <CardBody>
          {report.isError ? (
            <ErrorState message="Could not load report." />
          ) : report.isLoading ? (
            <LoadingBlock />
          ) : report.data && report.data.length ? (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Village</Th>
                    <Th>Customers</Th>
                    <Th>Accounts</Th>
                    <Th>Balance</Th>
                    <Th>Deposited</Th>
                    <Th>Collected</Th>
                    <Th>Success Txns</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {report.data.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <Link href={`/villages/${v.id}`} className="font-medium text-brand-700 hover:underline">
                          {v.name}
                        </Link>
                        <span className="ml-2 text-xs text-ink-muted">{v.code}</span>
                      </Td>
                      <Td>{v.customers}</Td>
                      <Td>{v.accounts}</Td>
                      <Td className="font-semibold text-ink">{money(v.currentBalance)}</Td>
                      <Td>{money(v.totalDeposited)}</Td>
                      <Td className="text-emerald-600">{money(v.collected)}</Td>
                      <Td>{v.successfulTxns}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState title="No villages yet" icon={<Map size={22} />} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
