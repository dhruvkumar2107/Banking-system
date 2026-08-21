'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Coins,
  HandCoins,
  Landmark,
  Percent,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import {
  useApproveWithdrawal,
  usePayWithdrawal,
  useRejectWithdrawal,
  useWithdrawal,
} from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, money } from '@/lib/format';
import {
  WithdrawalKindBadge,
  WithdrawalStatusBadge,
  payoutLabel,
  referenceHint,
  referenceLabel,
} from '@/components/WithdrawalBadges';
import type { PayoutMethod, WithdrawalDetail } from '@/lib/types';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  StatusBadge,
  Modal,
  Field,
  Input,
  Select,
  Textarea,
  LoadingBlock,
  ErrorState,
  useToast,
} from '@/components/ui';

export default function WithdrawalDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const canDecide = hasRole('superadmin', 'admin');

  const q = useWithdrawal(id);
  const [modal, setModal] = useState<null | 'approve' | 'reject' | 'pay'>(null);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} />;
  const w = q.data;

  const isPending = w.status === 'pending';
  const isApproved = w.status === 'approved';

  return (
    <div className="space-y-6">
      <Link
        href="/withdrawals"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to withdrawals
      </Link>

      <PageHeader
        title={<span className="font-mono">{money(w.netPayable)}</span>}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/customers/${w.customer.id}`}
              className="font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              {w.customer.name}
            </Link>
            <span>· {w.customer.mobile}</span>
            <span>· {w.village.name}</span>
            <span>· requested {formatDateTime(w.requestedAt)}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WithdrawalKindBadge kind={w.kind} />
            <WithdrawalStatusBadge status={w.status} />
            {canDecide && isPending && (
              <>
                <Button size="sm" variant="danger" onClick={() => setModal('reject')}>
                  <XCircle size={14} /> Reject
                </Button>
                <Button size="sm" onClick={() => setModal('approve')}>
                  <CheckCircle2 size={14} /> Approve
                </Button>
              </>
            )}
            {canDecide && isApproved && (
              <Button size="sm" onClick={() => setModal('pay')}>
                <HandCoins size={14} /> Record payout
              </Button>
            )}
          </div>
        }
      />

      {!canDecide && (isPending || isApproved) && (
        <Notice tone="slate" icon={<ShieldCheck size={16} />}>
          You can review this request, but only an <strong>Admin</strong> or{' '}
          <strong>Super Admin</strong> can approve, reject or record a payout.
        </Notice>
      )}

      {isPending && (
        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          Nothing has left the account yet. Approving is a decision only — the balance is debited in
          a second step, when the payout reference is recorded.
        </Notice>
      )}

      {isApproved && (
        <Notice tone="blue" icon={<HandCoins size={16} />}>
          Approved{w.decidedBy ? ` by ${w.decidedBy}` : ''}
          {w.decidedAt ? ` on ${formatDateTime(w.decidedAt)}` : ''}. Pay the customer by{' '}
          {payoutLabel(w.payoutMethod).toLowerCase()}, then record the{' '}
          {referenceLabel(w.payoutMethod).toLowerCase()} here to post the debit.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── money breakdown ─────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Coins size={16} className="text-brand-600 dark:text-brand-300" /> Payout breakdown
              </span>
            }
            subtitle="Every figure was locked in when the request was raised."
          />
          <CardBody className="space-y-1">
            <Row label="Amount drawn from account" value={money(w.amount)} />
            {w.interest.paise > 0 && (
              <Row
                label="Maturity interest credited"
                value={`+ ${money(w.interest)}`}
                tone="green"
                hint={`Simple interest at ${w.account.interestRatePercent}% p.a. — posted as its own passbook line at payout.`}
              />
            )}
            {w.penalty.paise > 0 && (
              <Row
                label="Early withdrawal penalty"
                value={`− ${money(w.penalty)}`}
                tone="red"
                hint="Deducted from the amount drawn, not charged on top."
              />
            )}
            <div className="mt-3 flex items-baseline justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium text-ink-soft">Net payable to customer</span>
              <span className="text-xl font-bold tracking-tight text-ink">
                {money(w.netPayable)}
              </span>
            </div>

            <div className="pt-4">
              <p className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Payout destination
              </p>
              <Row label="Method" value={payoutLabel(w.payoutMethod)} />
              {w.payoutMethod === 'bank_transfer' && (
                <>
                  <Row
                    label="Bank account"
                    value={w.bankAccountMasked ? `••••${w.bankAccountMasked.slice(-4)}` : '—'}
                    mono
                  />
                  <Row label="IFSC" value={w.bankIfsc ?? '—'} mono />
                </>
              )}
              {w.reference && (
                <Row label={referenceLabel(w.payoutMethod)} value={w.reference} mono />
              )}
              {w.note && <Row label="Note" value={w.note} />}
            </div>
          </CardBody>
        </Card>

        {/* ── account + timeline ──────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Landmark size={16} className="text-brand-600 dark:text-brand-300" /> Account
                </span>
              }
              action={<StatusBadge status={w.account.status} />}
            />
            <CardBody className="space-y-1">
              <Row
                label="Account number"
                value={
                  <Link
                    href={`/pigmy-accounts/${w.account.id}`}
                    className="font-mono text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {w.account.accountNumber}
                  </Link>
                }
              />
              <Row label="Current balance" value={money(w.account.currentBalance)} />
              <Row label="Total deposited" value={money(w.account.totalDeposited)} />
              <Row label="Term" value={`${w.account.termDays} days`} />
              <Row
                label="Interest rate"
                value={`${w.account.interestRatePercent}% p.a.`}
                hint="Snapshotted when the account was opened — later scheme changes do not re-price it."
              />
              <Row
                label="Maturity date"
                value={
                  <span className="inline-flex items-center gap-2">
                    {formatDate(w.account.maturityDate)}
                    {w.account.matured ? (
                      <Badge tone="green">Matured</Badge>
                    ) : (
                      <Badge tone="slate">In term</Badge>
                    )}
                  </span>
                }
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <CalendarClock size={16} className="text-brand-600 dark:text-brand-300" /> Trail
                </span>
              }
              subtitle="Maker-checker: the requester never approves their own request."
            />
            <CardBody>
              <ol className="space-y-4">
                <Step
                  done
                  title="Requested by customer"
                  when={formatDateTime(w.requestedAt)}
                />
                <Step
                  done={w.status !== 'pending'}
                  failed={w.status === 'rejected' || w.status === 'cancelled'}
                  title={
                    w.status === 'rejected'
                      ? 'Rejected'
                      : w.status === 'cancelled'
                        ? 'Cancelled by customer'
                        : 'Approved by admin'
                  }
                  when={w.decidedAt ? formatDateTime(w.decidedAt) : 'Awaiting decision'}
                  by={w.decidedBy}
                />
                <Step
                  done={w.status === 'paid'}
                  last
                  title="Payout recorded"
                  when={w.paidAt ? formatDateTime(w.paidAt) : 'Not paid yet'}
                />
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      {modal === 'approve' && <ApproveModal w={w} onClose={() => setModal(null)} />}
      {modal === 'reject' && <RejectModal w={w} onClose={() => setModal(null)} />}
      {modal === 'pay' && <PayModal w={w} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ─────────────────────────── small pieces ─────────────────────────── */

function Row({
  label,
  value,
  hint,
  tone,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'green' | 'red';
  mono?: boolean;
}) {
  const toneCls =
    tone === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'red'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-ink';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-sm font-medium ${toneCls} ${mono ? 'font-mono' : ''}`}>{value}</span>
      {hint && <p className="w-full text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function Notice({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: 'amber' | 'blue' | 'slate' | 'red';
  icon?: React.ReactNode;
}) {
  const tones = {
    amber:
      'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200',
    blue: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-200',
    slate: 'border-line bg-surface-2 text-ink-soft',
    red: 'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200',
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

function Step({
  title,
  when,
  by,
  done,
  failed,
  last,
}: {
  title: string;
  when: string;
  by?: string | null;
  done?: boolean;
  failed?: boolean;
  last?: boolean;
}) {
  const dot = failed
    ? 'bg-rose-500'
    : done
      ? 'bg-emerald-500'
      : 'bg-surface-2 ring-1 ring-inset ring-line';
  return (
    <li className="relative flex gap-3 pl-1">
      {!last && <span className="absolute left-[9px] top-5 h-full w-px bg-line-soft" />}
      <span className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${done || failed ? 'text-ink' : 'text-ink-muted'}`}>
          {title}
        </p>
        <p className="text-xs text-ink-muted">{when}</p>
        {by && <p className="text-xs text-ink-faint">by {by}</p>}
      </div>
    </li>
  );
}

/* ─────────────────────────── decisions ─────────────────────────── */

function ApproveModal({ w, onClose }: { w: WithdrawalDetail; onClose: () => void }) {
  const approve = useApproveWithdrawal(w.id, w.account.id);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const shortfall = w.amount.paise > w.account.currentBalance.paise;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await approve.mutateAsync({ note: note.trim() || undefined });
      toast.success('Request approved — record the payout next');
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Could not approve this request');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Approve withdrawal"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="approve-wd" type="submit" loading={approve.isPending}>
            <CheckCircle2 size={15} /> Approve
          </Button>
        </>
      }
    >
      <form id="approve-wd" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-muted">Net payable</span>
            <span className="text-lg font-bold text-ink">{money(w.netPayable)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {w.customer.name} · {w.account.accountNumber} · balance{' '}
            {money(w.account.currentBalance)}
          </p>
        </div>

        {shortfall && (
          <Notice tone="red" icon={<TriangleAlert size={16} />}>
            The balance is now lower than the requested amount. Approval will be refused — ask the
            customer to raise a fresh request.
          </Notice>
        )}

        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          This moves no money. The account is debited only when you record the{' '}
          {referenceLabel(w.payoutMethod).toLowerCase()} in the next step.
        </Notice>

        <Field label="Note (optional)" htmlFor="ap-note" error={err} hint="Kept on the audit trail.">
          <Textarea
            id="ap-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Verified passbook and KYC."
          />
        </Field>
      </form>
    </Modal>
  );
}

function RejectModal({ w, onClose }: { w: WithdrawalDetail; onClose: () => void }) {
  const reject = useRejectWithdrawal(w.id, w.account.id);
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (reason.trim().length < 3) {
      setErr('Give the customer a reason (at least 3 characters).');
      return;
    }
    try {
      await reject.mutateAsync({ reason: reason.trim() });
      toast.success('Request rejected');
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Could not reject this request');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Reject withdrawal"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="reject-wd" type="submit" variant="danger" loading={reject.isPending}>
            <XCircle size={15} /> Reject request
          </Button>
        </>
      }
    >
      <form id="reject-wd" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {w.customer.name}’s request for <span className="font-medium text-ink">{money(w.netPayable)}</span>{' '}
          will be closed. The reason is sent to them in the app, so keep it plain.
        </p>
        <Field label="Reason" htmlFor="rj-reason" error={err}>
          <Textarea
            id="rj-reason"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please visit the branch with your passbook to complete KYC."
          />
        </Field>
      </form>
    </Modal>
  );
}

function PayModal({ w, onClose }: { w: WithdrawalDetail; onClose: () => void }) {
  const pay = usePayWithdrawal(w.id, w.account.id);
  const toast = useToast();
  const [method, setMethod] = useState<PayoutMethod>(w.payoutMethod);
  const [reference, setReference] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const closes = w.kind !== 'partial';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!reference.trim()) {
      setErr(`${referenceLabel(method)} is required — it is the proof of payout.`);
      return;
    }
    try {
      const res = await pay.mutateAsync({ reference: reference.trim(), payoutMethod: method });
      toast.success(
        res.accountClosed
          ? `Payout recorded · account closed`
          : `Payout recorded · balance now ${money(res.balanceAfter)}`,
      );
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Could not record this payout');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payout"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="pay-wd" type="submit" loading={pay.isPending}>
            <HandCoins size={15} /> Record payout
          </Button>
        </>
      }
    >
      <form id="pay-wd" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-ink-muted">Hand over to customer</span>
            <span className="text-xl font-bold text-ink">{money(w.netPayable)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {money(w.amount)} from the account
            {w.interest.paise > 0 && ` + ${money(w.interest)} interest`}
            {w.penalty.paise > 0 && ` − ${money(w.penalty)} penalty`}
          </p>
        </div>

        <Notice tone="red" icon={<TriangleAlert size={16} />}>
          Confirm the money has actually been handed over. This debits the account immediately and
          cannot be undone{closes ? ', and closes the account' : ''}.
        </Notice>

        <Field label="Payout method" htmlFor="pw-method">
          <Select
            id="pw-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash at branch</option>
          </Select>
        </Field>

        {method === 'bank_transfer' && (
          <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 text-ink-soft">
              <Banknote size={15} className="text-ink-muted" />
              {w.bankAccountMasked ? (
                <>
                  <span className="font-mono">••••{w.bankAccountMasked.slice(-4)}</span>
                  {w.bankIfsc && <span className="font-mono text-ink-muted">· {w.bankIfsc}</span>}
                </>
              ) : (
                <span className="text-ink-muted">No bank details captured on this request.</span>
              )}
            </p>
          </div>
        )}

        <Field
          label={referenceLabel(method)}
          htmlFor="pw-ref"
          hint={referenceHint(method)}
          error={err}
        >
          <Input
            id="pw-ref"
            required
            maxLength={64}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === 'cash' ? 'VCH-00184' : 'AXISN12345678901'}
          />
        </Field>
      </form>
    </Modal>
  );
}
