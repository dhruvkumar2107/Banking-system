'use client';

import { useState } from 'react';
import { ScrollText, Eye } from 'lucide-react';
import { useAuditLogs } from '@/lib/hooks';
import { formatDateTime } from '@/lib/format';
import { useT, type TranslationKey } from '@/lib/i18n';
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

/**
 * Module scope cannot call `t()`, so entries carry a key and the label is
 * resolved at render — the same convention as `components/layout/nav.ts`.
 */
const ACTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'admin.login', labelKey: 'auditLogs.actionAdminLogin' },
  { value: 'village.created', labelKey: 'auditLogs.actionVillageCreated' },
  { value: 'village.updated', labelKey: 'auditLogs.actionVillageUpdated' },
  { value: 'admin.created', labelKey: 'auditLogs.actionAdminCreated' },
  { value: 'admin.updated', labelKey: 'auditLogs.actionAdminUpdated' },
  { value: 'customer.registered', labelKey: 'auditLogs.actionCustomerRegistered' },
  { value: 'customer.updated', labelKey: 'auditLogs.actionCustomerUpdated' },
  { value: 'customer.kyc_updated', labelKey: 'auditLogs.actionKycUpdated' },
  { value: 'customer.document_verified', labelKey: 'auditLogs.actionDocumentVerified' },
  { value: 'customer.bank_details_updated', labelKey: 'auditLogs.actionBankDetailsUpdated' },
  { value: 'pigmy.created', labelKey: 'auditLogs.actionPigmyCreated' },
  { value: 'pigmy.status_changed', labelKey: 'auditLogs.actionPigmyStatusChanged' },
  { value: 'ledger.credit', labelKey: 'auditLogs.actionLedgerCredit' },
  { value: 'ledger.debit', labelKey: 'auditLogs.actionLedgerDebit' },
  { value: 'payment.success', labelKey: 'auditLogs.actionPaymentSuccess' },
  { value: 'payment.failed', labelKey: 'auditLogs.actionPaymentFailed' },
  { value: 'payment.webhook_received', labelKey: 'auditLogs.actionPaymentWebhook' },
  { value: 'notification.broadcast', labelKey: 'auditLogs.actionBroadcastSent' },
];

function actorTone(actorType: string) {
  if (actorType === 'admin') return 'indigo' as const;
  if (actorType === 'system') return 'slate' as const;
  return 'blue' as const;
}

export default function AuditLogsPage() {
  const t = useT();
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
        title={t('auditLogs.title')}
        subtitle={t('auditLogs.subtitle')}
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('auditLogs.action')} className="w-56">
              <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
                <option value="">{t('auditLogs.allActions')}</option>
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{t(a.labelKey)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('auditLogs.entity')} className="w-44">
              <Input placeholder={t('auditLogs.entityPlaceholder')} value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} />
            </Field>
            <Field label={t('common.from')} className="w-40"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
            <Field label={t('common.to')} className="w-40"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
            <Button variant="outline" onClick={reset}>{t('common.reset')}</Button>
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
                      <Th>{t('auditLogs.when')}</Th>
                      <Th>{t('auditLogs.actor')}</Th>
                      <Th>{t('auditLogs.action')}</Th>
                      <Th>{t('auditLogs.entity')}</Th>
                      <Th>{t('auditLogs.ip')}</Th>
                      <Th className="text-right">{t('auditLogs.details')}</Th>
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
                            <Eye size={14} /> {t('common.view')}
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
            <EmptyState title={t('auditLogs.noneFound')} icon={<ScrollText size={22} />} />
          )}
        </CardBody>
      </Card>

      {detail && <DetailModal log={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const t = useT();
  return (
    <Modal open onClose={onClose} title={t('auditLogs.entryTitle')} size="lg" footer={<Button variant="outline" onClick={onClose}>{t('common.close')}</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Meta label={t('auditLogs.action')} value={<span className="font-mono text-xs">{log.action}</span>} />
          <Meta label={t('auditLogs.actorType')} value={log.actorType} />
          <Meta label={t('auditLogs.actorId')} value={log.actorId ? <span className="font-mono text-xs">{log.actorId}</span> : '—'} />
          <Meta label={t('auditLogs.ip')} value={<span className="font-mono text-xs">{log.ip || '—'}</span>} />
          <Meta label={t('auditLogs.entity')} value={log.entity || '—'} />
          <Meta label={t('auditLogs.entityId')} value={log.entityId ? <span className="font-mono text-xs">{log.entityId}</span> : '—'} />
          <Meta label={t('auditLogs.timestamp')} value={formatDateTime(log.createdAt)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <JsonBlock title={t('auditLogs.before')} value={log.before} />
          <JsonBlock title={t('auditLogs.after')} value={log.after} />
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
