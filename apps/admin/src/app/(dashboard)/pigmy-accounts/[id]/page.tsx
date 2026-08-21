'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Landmark, TrendingUp, CalendarDays, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  usePigmyAccount,
  useLedger,
  useReconcile,
  useSetPigmyStatus,
  useSetDailyAmount,
} from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { money, formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Button,
  Badge,
  StatusBadge,
  Modal,
  Field,
  Select,
  Input,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Pagination,
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
} from '@/components/ui';

export default function PigmyAccountDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole('superadmin', 'admin');
  const canReconcile = hasRole('superadmin');

  const acct = usePigmyAccount(id);
  const [page, setPage] = useState(1);
  const ledger = useLedger(id, { page, limit: 15 });

  const [reconcileOn, setReconcileOn] = useState(false);
  const reconcile = useReconcile(id, reconcileOn);

  const [modal, setModal] = useState<null | 'status' | 'daily'>(null);

  if (acct.isLoading) return <LoadingBlock />;
  if (acct.isError || !acct.data) return <ErrorState message={(acct.error as Error)?.message} />;
  const a = acct.data;

  return (
    <div className="space-y-6">
      <Link href="/pigmy-accounts" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Back to accounts
      </Link>

      <PageHeader
        title={<span className="font-mono">{a.accountNumber}</span>}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/customers/${a.customerId}`} className="font-medium text-brand-600 hover:underline">
              {a.customer?.name}
            </Link>
            <span>· {a.customer?.mobile}</span>
            {a.village && <span>· {a.village.name}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setModal('status')}>Change status</Button>
                <Button variant="outline" size="sm" onClick={() => setModal('daily')}>Daily amount</Button>
              </>
            )}
            {canReconcile && (
              <Button variant="outline" size="sm" onClick={() => setReconcileOn(true)}>
                <ShieldCheck size={14} /> Reconcile
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Current Balance" value={money(a.currentBalance)} icon={<Landmark size={20} />} tone="green" />
        <StatCard label="Total Deposited" value={money(a.totalDeposited)} icon={<TrendingUp size={20} />} tone="indigo" />
        <StatCard label="Daily Amount" value={money(a.dailyAmount)} icon={<CalendarDays size={20} />} tone="amber" />
      </div>

      {reconcileOn && (
        <Card>
          <CardHeader title="Reconciliation" subtitle="Stored balance vs. ledger-computed balance" />
          <CardBody>
            {reconcile.isLoading ? (
              <LoadingBlock label="Reconciling…" />
            ) : reconcile.data ? (
              <div className="flex flex-wrap items-center gap-6">
                <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${reconcile.data.consistent ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'}`}>
                  {reconcile.data.consistent ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  {reconcile.data.consistent ? 'Consistent' : 'Discrepancy detected'}
                </div>
                <Metric label="Stored" value={money(reconcile.data.storedBalance)} />
                <Metric label="Computed" value={money(reconcile.data.computedBalance)} />
                <Metric label="Credits" value={money(reconcile.data.credits)} />
                <Metric label="Debits" value={money(reconcile.data.debits)} />
              </div>
            ) : (
              <ErrorState message={(reconcile.error as Error)?.message} />
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Ledger History" subtitle="Immutable append-only record of every balance change" />
        <CardBody className="space-y-4">
          {ledger.isLoading ? (
            <LoadingBlock />
          ) : ledger.data && ledger.data.data.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Type</Th>
                      <Th>Amount</Th>
                      <Th>Previous</Th>
                      <Th>New Balance</Th>
                      <Th>Note</Th>
                      <Th>Date</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {ledger.data.data.map((e) => (
                      <Tr key={e.id}>
                        <Td>
                          <Badge tone={e.type === 'credit' ? 'green' : 'red'}>{e.type}</Badge>
                        </Td>
                        <Td className="font-semibold text-ink">{money(e.amount)}</Td>
                        <Td className="text-ink-muted">{money(e.previousBalance)}</Td>
                        <Td className="font-medium text-ink">{money(e.newBalance)}</Td>
                        <Td className="max-w-[220px] truncate text-xs">{e.note || '—'}</Td>
                        <Td className="text-xs">{formatDateTime(e.createdAt)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
              <Pagination
                page={ledger.data.page}
                pages={ledger.data.pages}
                total={ledger.data.total}
                limit={ledger.data.limit}
                onPage={setPage}
              />
            </>
          ) : (
            <EmptyState title="No ledger entries yet" />
          )}
        </CardBody>
      </Card>

      {modal === 'status' && <StatusModal id={id} current={a.status} onClose={() => setModal(null)} onDone={() => { toast.success('Status updated'); setModal(null); }} />}
      {modal === 'daily' && <DailyModal id={id} current={a.dailyAmount.rupees} onClose={() => setModal(null)} onDone={() => { toast.success('Daily amount updated'); setModal(null); }} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}

function StatusModal({ id, current, onClose, onDone }: { id: string; current: string; onClose: () => void; onDone: () => void }) {
  const m = useSetPigmyStatus(id);
  const [status, setStatus] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try { await m.mutateAsync(status); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Change account status" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="st" type="submit" loading={m.isPending}>Save</Button></>}>
      <form id="st" onSubmit={submit} className="space-y-4">
        <Field label="Status" error={err}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function DailyModal({ id, current, onClose, onDone }: { id: string; current: number; onClose: () => void; onDone: () => void }) {
  const m = useSetDailyAmount(id);
  const [amount, setAmount] = useState(String(current));
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = Number(amount);
    if (!n || n < 1) { setErr('Enter a valid amount.'); return; }
    try { await m.mutateAsync(n); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Change daily amount" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="da" type="submit" loading={m.isPending}>Save</Button></>}>
      <form id="da" onSubmit={submit} className="space-y-4">
        <Field label="Daily amount (₹)" error={err}>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
