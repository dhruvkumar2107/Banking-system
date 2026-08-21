'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import type { AdminTransaction } from '@/lib/types';
import { downloadReceipt } from '@/lib/hooks';
import { money, formatDateTime, maskAccount } from '@/lib/format';
import { useToast } from '@/components/ui';
import {
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  StatusBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Button,
} from '@/components/ui';

export function TransactionsTable({
  rows,
  loading,
  error,
  emptyLabel = 'No transactions found',
}: {
  rows: AdminTransaction[] | undefined;
  loading?: boolean;
  error?: boolean;
  emptyLabel?: string;
}) {
  const toast = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  async function onDownload(id: string) {
    setDownloading(id);
    try {
      await downloadReceipt(id);
    } catch (e) {
      toast.error((e as Error).message || 'Could not download receipt');
    } finally {
      setDownloading(null);
    }
  }

  if (error) return <ErrorState message="Could not load transactions." />;
  if (loading) return <LoadingBlock />;
  if (!rows || rows.length === 0) return <EmptyState title={emptyLabel} />;

  return (
    <TableWrap>
      <Table>
        <Thead>
          <Tr>
            <Th>Customer</Th>
            <Th>Account</Th>
            <Th>Village</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <Th>Date</Th>
            <Th className="text-right">Receipt</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((t) => (
            <Tr key={t.id}>
              <Td>
                <div className="font-medium text-ink">{t.customer?.name ?? '—'}</div>
                <div className="text-xs text-ink-muted">{t.customer?.mobile}</div>
              </Td>
              <Td className="font-mono text-xs">{maskAccount(t.accountNumber)}</Td>
              <Td>{t.village ?? '—'}</Td>
              <Td className="font-semibold text-ink">{money(t.amount)}</Td>
              <Td>
                <StatusBadge status={t.status} />
              </Td>
              <Td className="text-xs">{formatDateTime(t.createdAt)}</Td>
              <Td className="text-right">
                {t.status === 'success' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={downloading === t.id}
                    onClick={() => onDownload(t.id)}
                  >
                    <Download size={14} /> PDF
                  </Button>
                ) : (
                  <span className="text-xs text-ink-faint">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
