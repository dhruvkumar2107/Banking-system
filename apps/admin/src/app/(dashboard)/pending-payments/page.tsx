'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { usePendingPayments, useVillages } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Select,
  Field,
  Pagination,
  Badge,
} from '@/components/ui';
import { TransactionsTable } from '@/components/TransactionsTable';

export default function PendingPaymentsPage() {
  const [villageId, setVillageId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const villages = useVillages();
  const pending = usePendingPayments({ villageId: villageId || undefined, page, limit });
  const t = useT();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pendingPayments.title')}
        subtitle={t('pendingPayments.subtitle')}
      />

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Clock size={16} className="text-amber-500" /> {t('pendingPayments.awaitingSettlement')}
            </span>
          }
          action={
            pending.data ? (
              <Badge tone="amber">{t('pendingPayments.pendingCount', { count: pending.data.total })}</Badge>
            ) : null
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('common.village')} className="w-56">
              <Select value={villageId} onChange={(e) => { setVillageId(e.target.value); setPage(1); }}>
                <option value="">{t('common.allVillages')}</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <TransactionsTable
            rows={pending.data?.data}
            loading={pending.isLoading}
            error={pending.isError}
            emptyLabel={t('pendingPayments.empty')}
          />

          {pending.data && (
            <Pagination
              page={pending.data.page}
              pages={pending.data.pages}
              total={pending.data.total}
              limit={pending.data.limit}
              onPage={setPage}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
