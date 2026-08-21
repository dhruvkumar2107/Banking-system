'use client';

import { useMemo, useState } from 'react';
import { Wallet, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useDashboard, useTransactions, useVillages } from '@/lib/hooks';
import { money, isoStartOfToday, isoEndOfToday } from '@/lib/format';
import {
  PageHeader,
  StatCard,
  Card,
  CardBody,
  Select,
  Field,
  Pagination,
} from '@/components/ui';
import { TransactionsTable } from '@/components/TransactionsTable';

export default function CollectionPage() {
  const [status, setStatus] = useState('');
  const [villageId, setVillageId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const range = useMemo(() => ({ from: isoStartOfToday(), to: isoEndOfToday() }), []);
  const dash = useDashboard();
  const villages = useVillages();
  const txns = useTransactions({
    ...range,
    status: status || undefined,
    villageId: villageId || undefined,
    page,
    limit,
  });

  const d = dash.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today's Collection"
        subtitle="All micro-savings collected today, in real time."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected Today" value={money(d?.todayCollection)} icon={<Wallet size={20} />} tone="indigo" />
        <StatCard label="Successful" value={d?.todayCounts.success ?? '—'} icon={<CheckCircle2 size={20} />} tone="green" />
        <StatCard label="Pending" value={d?.todayCounts.pending ?? '—'} icon={<Clock size={20} />} tone="amber" />
        <StatCard label="Failed" value={d?.todayCounts.failed ?? '—'} icon={<XCircle size={20} />} tone="red" />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Status" className="w-40">
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </Select>
            </Field>
            <Field label="Village" className="w-56">
              <Select
                value={villageId}
                onChange={(e) => {
                  setVillageId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All villages</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <TransactionsTable
            rows={txns.data?.data}
            loading={txns.isLoading}
            error={txns.isError}
            emptyLabel="No collections recorded today yet"
          />

          {txns.data && (
            <Pagination
              page={txns.data.page}
              pages={txns.data.pages}
              total={txns.data.total}
              limit={txns.data.limit}
              onPage={setPage}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
