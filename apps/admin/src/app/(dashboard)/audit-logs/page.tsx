'use client';

import { useState } from 'react';
import { ScrollText, Eye } from 'lucide-react';
import { useAuditLogs } from '@/lib/hooks';
import { formatDateTime } from '@/lib/format';
import type { AuditLog } from '@/lib/types';
import {
  PageHeader,
  Card,
  CardBody,
  Field,
  Input,
  Select,
  Button,
  Badge,
  Modal,
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

const ACTIONS: { value: string; label: string }[] = [
  { value: 'admin.login', label: 'Admin login' },
  { value: 'village.created', label: 'Village created' },
  { value: 'village.updated', label: 'Village updated' },
  { value: 'admin.created', label: 'Admin created' },
  { value: 'admin.updated', label: 'Admin updated' },
  { value: 'customer.registered', label: 'Customer registered' },
  { value: 'customer.updated', label: 'Customer updated' },
  { value: 'customer.kyc_updated', label: 'KYC updated' },
  { value: 'customer.document_verified', label: 'Document verified' },
  { value: 'customer.bank_details_updated', label: 'Bank details updated' },
  { value: 'pigmy.created', label: 'Pigmy account created' },
  { value: 'pigmy.status_changed', label: 'Pigmy status changed' },
  { value: 'ledger.credit', label: 'Ledger credit' },
  { value: 'ledger.debit', label: 'Ledger debit' },
  { value: 'payment.success', label: 'Payment success' },
  { value: 'payment.failed', label: 'Payment failed' },
  { value: 'payment.webhook_received', label: 'Payment webhook' },
  { value: 'notification.broadcast', label: 'Broadcast sent' },
];

function actorTone(actorType: string) {
  if (actorType === 'admin') return 'indigo' as const;
  if (actorType === 'system') return 'slate' as const;
  return 'blue' as const;
}

export default function AuditLogsPage() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const logs = useAuditLogs({
    entity: entity || undefined,
    action: action || undefined,
    from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
    to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    page,
    limit: 20,
  });

  function reset() {
    setEntity('');
    setAction('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        subtitle="Immutable, read-only record of every balance-affecting and administrative action."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Action" className="w-56">
              <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
                <option value="">All actions</option>
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Entity" className="w-44">
              <Input placeholder="e.g. customer" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} />
            </Field>
            <Field label="From" className="w-40"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
            <Field label="To" className="w-40"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
            <Button variant="outline" onClick={reset}>Reset</Button>
          </div>

          {logs.isLoading ? (
            <LoadingBlock />
          ) : logs.isError ? (
            <ErrorState message={(logs.error as Error)?.message} />
          ) : logs.data && logs.data.data.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>When</Th>
                      <Th>Actor</Th>
                      <Th>Action</Th>
                      <Th>Entity</Th>
                      <Th>IP</Th>
                      <Th className="text-right">Details</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {logs.data.data.map((row) => (
                      <Tr key={row.id}>
                        <Td className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Td>
                        <Td><Badge tone={actorTone(row.actorType)}>{row.actorType}</Badge></Td>
                        <Td className="font-mono text-xs text-ink">{row.action}</Td>
                        <Td className="text-xs">
                          {row.entity ? (
                            <span>
                              <span className="text-ink">{row.entity}</span>
                              {row.entityId && <span className="ml-1 text-ink-faint">#{row.entityId.slice(0, 8)}</span>}
                            </span>
                          ) : '—'}
                        </Td>
                        <Td className="font-mono text-xs text-ink-muted">{row.ip || '—'}</Td>
                        <Td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setDetail(row)}>
                            <Eye size={14} /> View
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
              <Pagination
                page={logs.data.page}
                pages={logs.data.pages}
                total={logs.data.total}
                limit={logs.data.limit}
                onPage={setPage}
              />
            </>
          ) : (
            <EmptyState title="No audit entries found" icon={<ScrollText size={22} />} />
          )}
        </CardBody>
      </Card>

      {detail && <DetailModal log={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Audit entry" size="lg" footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Meta label="Action" value={<span className="font-mono text-xs">{log.action}</span>} />
          <Meta label="Actor type" value={log.actorType} />
          <Meta label="Actor ID" value={log.actorId ? <span className="font-mono text-xs">{log.actorId}</span> : '—'} />
          <Meta label="IP" value={<span className="font-mono text-xs">{log.ip || '—'}</span>} />
          <Meta label="Entity" value={log.entity || '—'} />
          <Meta label="Entity ID" value={log.entityId ? <span className="font-mono text-xs">{log.entityId}</span> : '—'} />
          <Meta label="Timestamp" value={formatDateTime(log.createdAt)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <JsonBlock title="Before" value={log.before} />
          <JsonBlock title="After" value={log.after} />
        </div>
      </div>
    </Modal>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-ink">{value}</p>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const empty = value === null || value === undefined;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-ink-line bg-surface-2 p-3 text-xs text-ink-soft">
        {empty ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
