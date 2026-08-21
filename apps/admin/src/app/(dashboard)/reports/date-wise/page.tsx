'use client';

import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { useDateWise, useVillages } from '@/lib/hooks';
import { money, inr, formatDate, formatDayShort, isoDaysAgo } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
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
import { CollectionChart } from '@/components/charts/CollectionChart';

function toInput(iso: string) {
  return iso.slice(0, 10);
}

export default function DateWiseReportsPage() {
  const villages = useVillages();
  const [from, setFrom] = useState(toInput(isoDaysAgo(30)));
  const [to, setTo] = useState(toInput(new Date().toISOString()));
  const [villageId, setVillageId] = useState('');

  const report = useDateWise({
    from: new Date(from + 'T00:00:00').toISOString(),
    to: new Date(to + 'T23:59:59').toISOString(),
    villageId: villageId || undefined,
  });

  const totals = useMemo(() => {
    const s = report.data?.series ?? [];
    return {
      collected: s.reduce((a, p) => a + p.collected.paise, 0),
      success: s.reduce((a, p) => a + p.successCount, 0),
      pending: s.reduce((a, p) => a + p.pendingCount, 0),
      failed: s.reduce((a, p) => a + p.failedCount, 0),
    };
  }, [report.data]);

  const chartData = report.data?.series.map((p) => ({ label: formatDayShort(p.day), paise: p.collected.paise })) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Date-wise Reports" subtitle="Collection totals grouped by day, for any range." />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-40"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" className="w-40"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Village" className="w-56">
              <Select value={villageId} onChange={(e) => setVillageId(e.target.value)}>
                <option value="">All villages</option>
                {villages.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Collected" value={inr(totals.collected)} tone="green" />
        <StatCard label="Successful" value={totals.success} tone="indigo" />
        <StatCard label="Pending" value={totals.pending} tone="amber" />
        <StatCard label="Failed" value={totals.failed} tone="red" />
      </div>

      <Card>
        <CardHeader title="Collection trend" />
        <CardBody>
          {report.isError ? <ErrorState message="Could not load report." /> : report.isLoading ? <LoadingBlock /> : chartData.length ? <CollectionChart data={chartData} /> : <EmptyState title="No data in this range" icon={<CalendarRange size={22} />} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Daily breakdown" />
        <CardBody>
          {report.isError ? (
            <ErrorState message="Could not load report." />
          ) : report.isLoading ? (
            <LoadingBlock />
          ) : report.data && report.data.series.length ? (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Collected</Th>
                    <Th>Success</Th>
                    <Th>Pending</Th>
                    <Th>Failed</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {report.data.series.map((p) => (
                    <Tr key={p.day}>
                      <Td className="font-medium text-ink">{formatDate(p.day)}</Td>
                      <Td className="font-semibold text-ink">{money(p.collected)}</Td>
                      <Td className="text-emerald-600">{p.successCount}</Td>
                      <Td className="text-amber-600">{p.pendingCount}</Td>
                      <Td className="text-rose-600">{p.failedCount}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState title="No data in this range" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
