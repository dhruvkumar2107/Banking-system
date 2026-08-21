'use client';

import { useState } from 'react';
import { useTransactions, useVillages } from '@/lib/hooks';
import {
  PageHeader,
  Card,
  CardBody,
  Select,
  Field,
  Input,
  Pagination,
  Button,
} from '@/components/ui';
import { TransactionsTable } from '@/components/TransactionsTable';

export default function TransactionsPage() {
  const [status, setStatus] = useState('');
  const [villageId, setVillageId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const villages = useVillages();
  const txns = useTransactions({
    status: status || undefined,
    villageId: villageId || undefined,
    from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
    to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    page,
    limit,
  });

  function reset() {
    setStatus('');
    setVillageId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Transactions"
        subtitle="Every payment across all villages, with status and receipts."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Status" className="w-40">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </Select>
            </Field>
            <Field label="Village" className="w-52">
              <Select value={villageId} onChange={(e) => { setVillageId(e.target.value); setPage(1); }}>
                <option value="">All villages</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="From" className="w-40">
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </Field>
            <Field label="To" className="w-40">
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </Field>
            <Button variant="outline" onClick={reset}>Reset</Button>
          </div>

          <TransactionsTable rows={txns.data?.data} loading={txns.isLoading} error={txns.isError} />

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
