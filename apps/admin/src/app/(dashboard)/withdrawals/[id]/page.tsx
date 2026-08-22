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
import { useT, type Translator } from '@/lib/i18n';
import { WithdrawalKindBadge, WithdrawalStatusBadge } from '@/components/WithdrawalBadges';
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

/**
 * The payout vocabulary, from the dictionary. Plain helpers, not components, so
 * the translator is passed in rather than pulled from a hook.
 */
const payoutLabel = (t: Translator, method: PayoutMethod) =>
  t(method === 'cash' ? 'withdrawals.payoutCash' : 'withdrawals.payoutBank');

/** What the admin types in to prove the payout happened. */
const referenceLabel = (t: Translator, method: PayoutMethod) =>
  t(method === 'cash' ? 'withdrawals.refVoucher' : 'withdrawals.refUtr');

const referenceHint = (t: Translator, method: PayoutMethod) =>
  t(method === 'cash' ? 'withdrawals.refVoucherHint' : 'withdrawals.refUtrHint');

export default function WithdrawalDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const t = useT();
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
        <ArrowLeft size={15} /> {t('withdrawals.backToWithdrawals')}
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
            <span>· {t('withdrawals.requestedAt', { when: formatDateTime(w.requestedAt) })}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WithdrawalKindBadge kind={w.kind} />
            <WithdrawalStatusBadge status={w.status} />
            {canDecide && isPending && (
              <>
                <Button size="sm" variant="danger" onClick={() => setModal('reject')}>
                  <XCircle size={14} /> {t('withdrawals.reject')}
                </Button>
                <Button size="sm" onClick={() => setModal('approve')}>
                  <CheckCircle2 size={14} /> {t('withdrawals.approve')}
                </Button>
              </>
            )}
            {canDecide && isApproved && (
              <Button size="sm" onClick={() => setModal('pay')}>
                <HandCoins size={14} /> {t('withdrawals.recordPayout')}
              </Button>
            )}
          </div>
        }
      />

      {!canDecide && (isPending || isApproved) && (
        <Notice tone="slate" icon={<ShieldCheck size={16} />}>
          {t('withdrawals.readOnlyNotice')}
        </Notice>
      )}

      {isPending && (
        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          {t('withdrawals.pendingNotice')}
        </Notice>
      )}

      {isApproved && (
        <Notice tone="blue" icon={<HandCoins size={16} />}>
          {t('withdrawals.statusApprovedShort')}
          {w.decidedBy ? t('withdrawals.approvedBy', { name: w.decidedBy }) : ''}
          {w.decidedAt ? t('withdrawals.approvedOn', { when: formatDateTime(w.decidedAt) }) : ''}.{' '}
          {t('withdrawals.approvedNotice', {
            method: payoutLabel(t, w.payoutMethod).toLowerCase(),
            reference: referenceLabel(t, w.payoutMethod).toLowerCase(),
          })}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── money breakdown ─────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Coins size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                {t('withdrawals.payoutBreakdown')}
              </span>
            }
            subtitle={t('withdrawals.payoutBreakdownSubtitle')}
          />
          <CardBody className="space-y-1">
            <Row label={t('withdrawals.amountDrawn')} value={money(w.amount)} />
            {w.interest.paise > 0 && (
              <Row
                label={t('withdrawals.maturityInterest')}
                value={`+ ${money(w.interest)}`}
                tone="green"
                hint={t('withdrawals.maturityInterestHint', {
                  rate: w.account.interestRatePercent,
                })}
              />
            )}
            {w.penalty.paise > 0 && (
              <Row
                label={t('withdrawals.earlyPenalty')}
                value={`− ${money(w.penalty)}`}
                tone="red"
                hint={t('withdrawals.earlyPenaltyHint')}
              />
            )}
            <div className="mt-3 flex items-baseline justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium text-ink-soft">
                {t('withdrawals.netPayable')}
              </span>
              <span className="text-xl font-bold tracking-tight text-ink">
                {money(w.netPayable)}
              </span>
            </div>

            <div className="pt-4">
              <p className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {t('withdrawals.payoutDestination')}
              </p>
              <Row label={t('common.method')} value={payoutLabel(t, w.payoutMethod)} />
              {w.payoutMethod === 'bank_transfer' && (
                <>
                  <Row
                    label={t('withdrawals.bankAccount')}
                    value={w.bankAccountMasked ? `••••${w.bankAccountMasked.slice(-4)}` : '—'}
                    mono
                  />
                  <Row label={t('customers.ifsc')} value={w.bankIfsc ?? '—'} mono />
                </>
              )}
              {w.reference && (
                <Row label={referenceLabel(t, w.payoutMethod)} value={w.reference} mono />
              )}
              {w.note && <Row label={t('common.note')} value={w.note} />}
            </div>
          </CardBody>
        </Card>

        {/* ── account + timeline ──────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Landmark size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('withdrawals.account')}
                </span>
              }
              action={<StatusBadge status={w.account.status} />}
            />
            <CardBody className="space-y-1">
              <Row
                label={t('withdrawals.accountNumber')}
                value={
                  <Link
                    href={`/pigmy-accounts/${w.account.id}`}
                    className="font-mono text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {w.account.accountNumber}
                  </Link>
                }
              />
              <Row label={t('withdrawals.currentBalance')} value={money(w.account.currentBalance)} />
              <Row label={t('withdrawals.totalDeposited')} value={money(w.account.totalDeposited)} />
              <Row
                label={t('withdrawals.term')}
                value={t('withdrawals.termDays', { days: w.account.termDays })}
              />
              <Row
                label={t('withdrawals.interestRate')}
                value={t('withdrawals.interestRateValue', { rate: w.account.interestRatePercent })}
                hint={t('withdrawals.interestRateHint')}
              />
              <Row
                label={t('withdrawals.maturityDate')}
                value={
                  <span className="inline-flex items-center gap-2">
                    {formatDate(w.account.maturityDate)}
                    {w.account.matured ? (
                      <Badge tone="green">{t('withdrawals.matured')}</Badge>
                    ) : (
                      <Badge tone="slate">{t('withdrawals.inTerm')}</Badge>
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
                  <CalendarClock size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('withdrawals.trail')}
                </span>
              }
              subtitle={t('withdrawals.trailSubtitle')}
            />
            <CardBody>
              <ol className="space-y-4">
                <Step
                  done
                  title={t('withdrawals.trailRequested')}
                  when={formatDateTime(w.requestedAt)}
                />
                <Step
                  done={w.status !== 'pending'}
                  failed={w.status === 'rejected' || w.status === 'cancelled'}
                  title={
                    w.status === 'rejected'
                      ? t('withdrawals.trailRejected')
                      : w.status === 'cancelled'
                        ? t('withdrawals.trailCancelled')
                        : t('withdrawals.trailApproved')
                  }
                  when={
                    w.decidedAt
                      ? formatDateTime(w.decidedAt)
                      : t('withdrawals.awaitingDecision')
                  }
                  by={w.decidedBy}
                />
                <Step
                  done={w.status === 'paid'}
                  last
                  title={t('withdrawals.trailPaid')}
                  when={w.paidAt ? formatDateTime(w.paidAt) : t('withdrawals.notPaidYet')}
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
  const t = useT();
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
        {by && <p className="text-xs text-ink-faint">{t('withdrawals.trailBy', { name: by })}</p>}
      </div>
    </li>
  );
}

/* ─────────────────────────── decisions ─────────────────────────── */

function ApproveModal({ w, onClose }: { w: WithdrawalDetail; onClose: () => void }) {
  const approve = useApproveWithdrawal(w.id, w.account.id);
  const toast = useToast();
  const t = useT();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const shortfall = w.amount.paise > w.account.currentBalance.paise;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await approve.mutateAsync({ note: note.trim() || undefined });
      toast.success(t('withdrawals.approvedToast'));
      onClose();
    } catch (e) {
      setErr((e as Error).message || t('withdrawals.approveFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('withdrawals.approveTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="approve-wd" type="submit" loading={approve.isPending}>
            <CheckCircle2 size={15} /> {t('withdrawals.approve')}
          </Button>
        </>
      }
    >
      <form id="approve-wd" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-muted">{t('withdrawals.approveSummary')}</span>
            <span className="text-lg font-bold text-ink">{money(w.netPayable)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {w.customer.name} · {w.account.accountNumber} ·{' '}
            {t('withdrawals.rowBalance', { amount: money(w.account.currentBalance) })}
          </p>
        </div>

        {shortfall && (
          <Notice tone="red" icon={<TriangleAlert size={16} />}>
            {t('withdrawals.shortfallNotice')}
          </Notice>
        )}

        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          {t('withdrawals.approveNotice', {
            reference: referenceLabel(t, w.payoutMethod).toLowerCase(),
          })}
        </Notice>

        <Field
          label={t('withdrawals.noteOptional')}
          htmlFor="ap-note"
          error={err}
          hint={t('withdrawals.noteHint')}
        >
          <Textarea
            id="ap-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('withdrawals.notePlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function RejectModal({ w, onClose }: { w: WithdrawalDetail; onClose: () => void }) {
  const reject = useRejectWithdrawal(w.id, w.account.id);
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (reason.trim().length < 3) {
      setErr(t('withdrawals.rejectReasonError'));
      return;
    }
    try {
      await reject.mutateAsync({ reason: reason.trim() });
      toast.success(t('withdrawals.rejectedToast'));
      onClose();
    } catch (e) {
      setErr((e as Error).message || t('withdrawals.rejectFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('withdrawals.rejectTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="reject-wd" type="submit" variant="danger" loading={reject.isPending}>
            <XCircle size={15} /> {t('withdrawals.rejectRequest')}
          </Button>
        </>
      }
    >
      <form id="reject-wd" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {t('withdrawals.rejectBody', {
            name: w.customer.name,
            amount: money(w.netPayable),
          })}
        </p>
        <Field label={t('withdrawals.rejectReason')} htmlFor="rj-reason" error={err}>
          <Textarea
            id="rj-reason"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('withdrawals.rejectPlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function PayModal({ w, onClose }: { w: WithdrawalDetail; onClose: () => void }) {
  const pay = usePayWithdrawal(w.id, w.account.id);
  const toast = useToast();
  const t = useT();
  const [method, setMethod] = useState<PayoutMethod>(w.payoutMethod);
  const [reference, setReference] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const closes = w.kind !== 'partial';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!reference.trim()) {
      setErr(t('withdrawals.referenceRequired', { reference: referenceLabel(t, method) }));
      return;
    }
    try {
      const res = await pay.mutateAsync({ reference: reference.trim(), payoutMethod: method });
      toast.success(
        res.accountClosed
          ? t('withdrawals.paidClosedToast')
          : t('withdrawals.paidToast', { balance: money(res.balanceAfter) }),
      );
      onClose();
    } catch (e) {
      setErr((e as Error).message || t('withdrawals.payFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('withdrawals.recordPayout')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="pay-wd" type="submit" loading={pay.isPending}>
            <HandCoins size={15} /> {t('withdrawals.recordPayout')}
          </Button>
        </>
      }
    >
      <form id="pay-wd" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-ink-muted">{t('withdrawals.handOver')}</span>
            <span className="text-xl font-bold text-ink">{money(w.netPayable)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {t('withdrawals.handOverFrom', { amount: money(w.amount) })}
            {w.interest.paise > 0 &&
              t('withdrawals.handOverInterest', { amount: money(w.interest) })}
            {w.penalty.paise > 0 && t('withdrawals.handOverPenalty', { amount: money(w.penalty) })}
          </p>
        </div>

        <Notice tone="red" icon={<TriangleAlert size={16} />}>
          {t('withdrawals.payNotice', {
            closes: closes ? t('withdrawals.payNoticeCloses') : '',
          })}
        </Notice>

        <Field label={t('withdrawals.payoutMethod')} htmlFor="pw-method">
          <Select
            id="pw-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}
          >
            <option value="bank_transfer">{t('withdrawals.payoutBank')}</option>
            <option value="cash">{t('withdrawals.payoutCash')}</option>
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
                <span className="text-ink-muted">{t('withdrawals.noBankDetails')}</span>
              )}
            </p>
          </div>
        )}

        <Field
          label={referenceLabel(t, method)}
          htmlFor="pw-ref"
          hint={referenceHint(t, method)}
          error={err}
        >
          <Input
            id="pw-ref"
            required
            maxLength={64}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={
              method === 'cash'
                ? t('withdrawals.refVoucherPlaceholder')
                : t('withdrawals.refUtrPlaceholder')
            }
          />
        </Field>
      </form>
    </Modal>
  );
}
