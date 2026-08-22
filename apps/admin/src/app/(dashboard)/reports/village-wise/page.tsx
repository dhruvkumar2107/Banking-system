'use client';

import { useMemo, useState } from 'react';
import { Map } from 'lucide-react';
import Link from 'next/link';
import { useVillageWise } from '@/lib/hooks';
import { money, inr } from '@/lib/format';
import { useT } from '@/lib/i18n';
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
  const t = useT();
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
      <PageHeader title={t('reports.villageWiseTitle')} subtitle={t('reports.villageWiseSubtitle')} />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('reports.collectedFrom')} className="w-40"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={t('reports.collectedTo')} className="w-40"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button variant="outline" onClick={() => { setFrom(''); setTo(''); }}>{t('common.reset')}</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('reports.totalBalance')} value={inr(totals.balance)} tone="green" />
        <StatCard label={t('reports.collectedRange')} value={inr(totals.collected)} tone="indigo" />
        <StatCard label={t('common.customers')} value={totals.customers} tone="amber" />
        <StatCard label={t('common.accounts')} value={totals.accounts} tone="slate" />
      </div>

      <Card>
        <CardHeader title={t('reports.byVillage')} />
        <CardBody>
          {report.isError ? (
            <ErrorState message={t('reports.loadError')} />
          ) : report.isLoading ? (
            <LoadingBlock />
          ) : report.data && report.data.length ? (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('common.village')}</Th>
                    <Th>{t('common.customers')}</Th>
                    <Th>{t('common.accounts')}</Th>
                    <Th>{t('common.balance')}</Th>
                    <Th>{t('common.deposited')}</Th>
                    <Th>{t('common.collected')}</Th>
                    <Th>{t('reports.successTxns')}</Th>
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
            <EmptyState title={t('reports.noVillages')} icon={<Map size={22} />} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
