'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  Coins,
  HandCoins,
  Landmark,
  ListOrdered,
  PiggyBank,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import {
  useApproveLoan,
  useDefaultLoan,
  useDisburseLoan,
  useLoan,
  useRecordRepayment,
  useRejectLoan,
  useWaiveInstalment,
  villageLabel,
} from '@/lib/loans-api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { useT, type Translator } from '@/lib/i18n';
import { InstalmentStatusBadge, LoanStatusBadge } from '@/components/LoanBadges';
import type {
  DisbursementMethod,
  LoanDetail,
  LoanInstalment,
  RepaymentMethod,
} from '@/lib/loan-types';
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
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  LoadingBlock,
  ErrorState,
  EmptyState,
  useToast,
} from '@/components/ui';

type ModalKind = null | 'approve' | 'reject' | 'disburse' | 'repay' | 'default';

/**
 * The lending vocabulary, from the dictionary. Plain helpers, not components, so
 * the translator is passed in rather than pulled from a hook.
 */
const disbursementLabel = (t: Translator, method?: DisbursementMethod | null) =>
  t(method === 'cash' ? 'loans.cash' : 'loans.bankTransfer');

/** How the borrower paid an instalment. */
const repaymentMethodLabel = (t: Translator, method?: RepaymentMethod | null) => {
  if (method === 'cash') return t('loans.cash');
  if (method === 'bank_transfer') return t('loans.bankTransfer');
  if (method === 'from_savings') return t('loans.fromSavings');
  return '—';
};

/** What the admin types in to prove the money moved. */
const referenceLabelFor = (
  t: Translator,
  method?: RepaymentMethod | DisbursementMethod | null,
) => {
  if (method === 'cash') return t('withdrawals.refVoucher');
  if (method === 'from_savings') return t('loans.refOptional');
  return t('withdrawals.refUtr');
};

const referenceHintFor = (
  t: Translator,
  method?: RepaymentMethod | DisbursementMethod | null,
) => {
  if (method === 'cash') return t('loans.refVoucherHint');
  if (method === 'from_savings') return t('loans.refSavingsHint');
  return t('withdrawals.refUtrHint');
};

export default function LoanDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const t = useT();
  // Same maker-checker rule as withdrawals: an agent may review, not decide.
  const canDecide = hasRole('superadmin', 'admin');
  // Waiving an instalment and writing a loan off forgive money outright, so the
  // API puts both above branch level — @Roles('superadmin') on those two routes.
  const canForgive = hasRole('superadmin');

  const q = useLoan(id);
  const [modal, setModal] = useState<ModalKind>(null);
  const [waiving, setWaiving] = useState<LoanInstalment | null>(null);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} />;
  const l = q.data;

  const isPending = l.status === 'pending';
  const isApproved = l.status === 'approved';
  const isDisbursed = l.status === 'disbursed';
  const isTerminal =
    l.status === 'closed' ||
    l.status === 'rejected' ||
    l.status === 'cancelled' ||
    l.status === 'defaulted';

  const instalments = l.instalments ?? [];
  const paidCount = instalments.filter((i) => i.status === 'paid').length;
  const overdueCount = instalments.filter((i) => i.status === 'overdue').length;

  return (
    <div className="space-y-6">
      <Link
        href="/loans"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {t('loans.backToLoans')}
      </Link>

      <PageHeader
        title={<span className="font-mono">{l.loanNumber}</span>}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/customers/${l.customer.id}`}
              className="font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              {l.customer.name}
            </Link>
            <span>· {l.customer.mobile}</span>
            <span>· {villageLabel(l.village)}</span>
            <span>· {t('loans.appliedAt', { when: formatDateTime(l.requestedAt) })}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LoanStatusBadge status={l.status} />
            {canDecide && isPending && (
              <>
                <Button size="sm" variant="danger" onClick={() => setModal('reject')}>
                  <XCircle size={14} /> {t('loans.reject')}
                </Button>
                <Button size="sm" onClick={() => setModal('approve')}>
                  <CheckCircle2 size={14} /> {t('loans.approve')}
                </Button>
              </>
            )}
            {canDecide && isApproved && (
              <Button size="sm" onClick={() => setModal('disburse')}>
                <HandCoins size={14} /> {t('loans.disburse')}
              </Button>
            )}
            {canDecide && isDisbursed && (
              <>
                {canForgive && (
                  <Button size="sm" variant="danger" onClick={() => setModal('default')}>
                    <Ban size={14} /> {t('loans.markDefaulted')}
                  </Button>
                )}
                <Button size="sm" onClick={() => setModal('repay')}>
                  <Receipt size={14} /> {t('loans.recordRepayment')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {!canDecide && !isTerminal && (
        <Notice tone="slate" icon={<ShieldCheck size={16} />}>
          {t('loans.readOnlyNotice')}
        </Notice>
      )}

      {isPending && (
        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          {t('loans.pendingNotice')}
        </Notice>
      )}

      {isApproved && (
        <Notice tone="blue" icon={<HandCoins size={16} />}>
          {t('status.approved')}
          {l.decidedBy ? t('withdrawals.approvedBy', { name: l.decidedBy }) : ''}
          {l.decidedAt ? t('withdrawals.approvedOn', { when: formatDateTime(l.decidedAt) }) : ''}.{' '}
          {t('loans.approvedNotice', { amount: money(l.principal) })}
        </Notice>
      )}

      {isDisbursed && overdueCount > 0 && (
        <Notice tone="red" icon={<TriangleAlert size={16} />}>
          {overdueCount === 1
            ? t('loans.overdueOne')
            : t('loans.overdueMany', { count: overdueCount })}{' '}
          {t('loans.overdueFollowUp')}
        </Notice>
      )}

      {l.status === 'closed' && (
        <Notice tone="green" icon={<CheckCircle2 size={16} />}>
          {t('loans.fullyRepaidAndClosed')}
          {l.closedAt ? t('withdrawals.approvedOn', { when: formatDateTime(l.closedAt) }) : ''}.{' '}
          {t('loans.noFurtherAction')}
        </Notice>
      )}

      {l.status === 'rejected' && (
        <Notice tone="red" icon={<XCircle size={16} />}>
          {t('status.rejected')}
          {l.decidedBy ? t('withdrawals.approvedBy', { name: l.decidedBy }) : ''}
          {l.decidedAt ? t('withdrawals.approvedOn', { when: formatDateTime(l.decidedAt) }) : ''}.
          {l.rejectionReason ? t('loans.reasonGiven', { reason: l.rejectionReason }) : ''}
        </Notice>
      )}

      {l.status === 'cancelled' && (
        <Notice tone="slate" icon={<XCircle size={16} />}>
          {t('loans.cancelledNotice')}
        </Notice>
      )}

      {l.status === 'defaulted' && (
        <Notice tone="red" icon={<Ban size={16} />}>
          {t('loans.writtenOffAsDefaulted')}
          {l.closedAt ? t('withdrawals.approvedOn', { when: formatDateTime(l.closedAt) }) : ''}.
          {l.rejectionReason ? t('loans.reasonGiven', { reason: l.rejectionReason }) : ''}{' '}
          {t('loans.outstandingAtWriteOff', { amount: money(l.outstanding) })}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── the money ───────────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Coins size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                {t('loans.terms')}
              </span>
            }
            subtitle={t('loans.termsSubtitle')}
          />
          <CardBody className="space-y-1">
            <Row label={t('loans.principal')} value={money(l.principal)} />
            <Row
              label={t('loans.tenure')}
              value={t('loans.tenureMonths', { count: l.tenureMonths })}
            />
            <Row
              label={t('loans.interestRate')}
              value={t('withdrawals.interestRateValue', { rate: l.interestRatePercent })}
              hint={t('loans.flatRateHint')}
            />
            <Row
              label={t('loans.totalInterest')}
              value={`+ ${money(l.totalInterest)}`}
              tone="red"
            />
            <Row
              label={t('loans.processingFee')}
              value={money(l.processingFee)}
              hint={t('loans.processingFeeHint')}
            />
            <Row label={t('loans.monthlyInstalment')} value={money(l.emiAmount)} />

            <div className="mt-3 flex items-baseline justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium text-ink-soft">{t('loans.totalPayable')}</span>
              <span className="text-xl font-bold tracking-tight text-ink">
                {money(l.totalPayable)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium text-ink-soft">
                {t('loans.stillOutstanding')}
              </span>
              <span className="text-xl font-bold tracking-tight text-ink">
                {money(l.outstanding)}
              </span>
            </div>

            <div className="pt-4">
              <p className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {t('loans.applicationSection')}
              </p>
              <Row label={t('loans.purpose')} value={l.purpose || '—'} />
              <Row
                label={t('loans.savingsAccount')}
                value={
                  <Link
                    href={`/pigmy-accounts/${l.account.id}`}
                    className="font-mono text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {l.account.accountNumber}
                  </Link>
                }
              />
              {l.disbursedAt && (
                <Row label={t('loans.disbursedOn')} value={formatDateTime(l.disbursedAt)} />
              )}
              {l.disbursementMethod && (
                <Row
                  label={t('loans.disbursedBy')}
                  value={disbursementLabel(t, l.disbursementMethod)}
                />
              )}
              {l.reference && <Row label={t('loans.reference')} value={l.reference} mono />}
              {l.firstDueDate && (
                <Row label={t('loans.firstInstalmentDue')} value={formatDate(l.firstDueDate)} />
              )}
              {l.note && <Row label={t('common.note')} value={l.note} />}
            </div>
          </CardBody>
        </Card>

        {/* ── account + trail ─────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <PiggyBank size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('loans.backingAccount')}
                </span>
              }
              action={l.account.status ? <StatusBadge status={l.account.status} /> : null}
            />
            <CardBody className="space-y-1">
              <Row
                label={t('withdrawals.accountNumber')}
                value={
                  <Link
                    href={`/pigmy-accounts/${l.account.id}`}
                    className="font-mono text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {l.account.accountNumber}
                  </Link>
                }
              />
              <Row
                label={t('withdrawals.currentBalance')}
                value={money(l.account.currentBalance)}
              />
              {l.account.totalDeposited && (
                <Row
                  label={t('withdrawals.totalDeposited')}
                  value={money(l.account.totalDeposited)}
                />
              )}
              {l.account.dailyAmount && (
                <Row
                  label={t('accounts.dailyAmountAction')}
                  value={money(l.account.dailyAmount)}
                />
              )}
              <p className="pt-2 text-xs text-ink-faint">{t('loans.backingAccountHint')}</p>
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
              subtitle={t('loans.trailSubtitle')}
            />
            <CardBody>
              <ol className="space-y-4">
                <Step
                  done
                  title={t('loans.trailApplied')}
                  when={formatDateTime(l.requestedAt)}
                />
                <Step
                  done={l.status !== 'pending'}
                  failed={l.status === 'rejected' || l.status === 'cancelled'}
                  title={
                    l.status === 'rejected'
                      ? t('status.rejected')
                      : l.status === 'cancelled'
                        ? t('withdrawals.trailCancelled')
                        : t('withdrawals.trailApproved')
                  }
                  when={
                    l.decidedAt ? formatDateTime(l.decidedAt) : t('withdrawals.awaitingDecision')
                  }
                  by={l.decidedBy}
                />
                <Step
                  done={!!l.disbursedAt}
                  title={t('loans.trailDisbursed')}
                  when={
                    l.disbursedAt ? formatDateTime(l.disbursedAt) : t('loans.notDisbursedYet')
                  }
                />
                <Step
                  done={l.status === 'closed'}
                  failed={l.status === 'defaulted'}
                  last
                  title={
                    l.status === 'defaulted'
                      ? t('loans.writtenOffAsDefaulted')
                      : t('loans.trailFullyRepaid')
                  }
                  when={
                    l.closedAt
                      ? formatDateTime(l.closedAt)
                      : instalments.length
                        ? t('loans.instalmentsPaidOf', {
                            paid: paidCount,
                            total: instalments.length,
                          })
                        : t('loans.scheduleStartsAtDisbursal')
                  }
                />
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ── schedule ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ListOrdered size={16} className="text-brand-600 dark:text-brand-300" />{' '}
              {t('loans.instalmentSchedule')}
            </span>
          }
          subtitle={
            canDecide && !canForgive
              ? t('loans.scheduleSubtitleAdmin')
              : t('loans.scheduleSubtitle')
          }
          action={
            instalments.length ? (
              <Badge tone={overdueCount ? 'red' : 'slate'}>
                {t('loans.paidOfCount', { paid: paidCount, total: instalments.length })}
              </Badge>
            ) : null
          }
        />
        <CardBody>
          {instalments.length ? (
            <TableWrap>
              <Table className="min-w-[860px]">
                <Thead>
                  <tr>
                    <Th className="text-right">{t('loans.colNo')}</Th>
                    <Th>{t('loans.dueDate')}</Th>
                    <Th className="text-right">{t('loans.colAmountDue')}</Th>
                    <Th className="text-right">{t('loans.colAmountPaid')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th>{t('common.method')}</Th>
                    <Th>{t('loans.colPaidOn')}</Th>
                    <Th className="text-right">{t('loans.colAction')}</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {instalments.map((i) => {
                    const unpaid = i.status !== 'paid' && i.status !== 'waived';
                    return (
                      <Tr key={i.id}>
                        <Td className="text-right font-mono text-xs text-ink-muted">
                          {i.instalmentNo}
                        </Td>
                        <Td>{formatDate(i.dueDate)}</Td>
                        <Td className="text-right font-medium text-ink">{money(i.amountDue)}</Td>
                        <Td className="text-right">{money(i.amountPaid)}</Td>
                        <Td>
                          <InstalmentStatusBadge status={i.status} compact />
                        </Td>
                        <Td className="text-xs text-ink-muted">
                          {repaymentMethodLabel(t, i.method)}
                          {i.reference && (
                            <span className="block font-mono text-[11px]">{i.reference}</span>
                          )}
                        </Td>
                        <Td className="text-xs text-ink-muted">
                          {i.paidAt ? formatDate(i.paidAt) : '—'}
                        </Td>
                        <Td className="text-right">
                          {canForgive && unpaid && (
                            <Button size="sm" variant="ghost" onClick={() => setWaiving(i)}>
                              {t('loans.waive')}
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState
              title={t('loans.noScheduleYet')}
              message={t('loans.noScheduleMessage')}
              icon={<ListOrdered size={22} />}
            />
          )}
        </CardBody>
      </Card>

      {modal === 'approve' && <ApproveModal l={l} onClose={() => setModal(null)} />}
      {modal === 'reject' && <RejectModal l={l} onClose={() => setModal(null)} />}
      {modal === 'disburse' && <DisburseModal l={l} onClose={() => setModal(null)} />}
      {modal === 'repay' && <RepayModal l={l} onClose={() => setModal(null)} />}
      {modal === 'default' && <DefaultModal l={l} onClose={() => setModal(null)} />}
      {waiving && (
        <WaiveModal l={l} instalment={waiving} onClose={() => setWaiving(null)} />
      )}
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
  tone: 'amber' | 'blue' | 'slate' | 'red' | 'green';
  icon?: React.ReactNode;
}) {
  const tones = {
    amber:
      'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200',
    blue: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-200',
    slate: 'border-line bg-surface-2 text-ink-soft',
    red: 'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200',
    green:
      'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200',
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

/**
 * Every decision here moves money or forgives it, so a failure is never
 * swallowed: the message goes inline next to the form (where the admin can act
 * on it) and into a toast (so it survives the modal being dismissed).
 */
function fail(
  setErr: (msg: string) => void,
  toast: { error: (msg: string) => void },
  e: unknown,
  fallback: string,
) {
  const msg = (e as Error)?.message || fallback;
  setErr(msg);
  toast.error(msg);
}

function ApproveModal({ l, onClose }: { l: LoanDetail; onClose: () => void }) {
  const approve = useApproveLoan(l.id, l.account.id);
  const toast = useToast();
  const t = useT();
  const [ratePercent, setRatePercent] = useState(String(l.interestRatePercent ?? ''));
  const [tenure, setTenure] = useState(String(l.tenureMonths));
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const rateChanged = Number(ratePercent) !== Number(l.interestRatePercent);
  const tenureChanged = Number(tenure) !== l.tenureMonths;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const rate = Number(ratePercent);
    const months = Number(tenure);
    if (rateChanged && (!Number.isFinite(rate) || rate < 0 || rate > 50)) {
      setErr(t('loans.rateBoundsError'));
      return;
    }
    if (tenureChanged && (!Number.isInteger(months) || months < 1 || months > 120)) {
      setErr(t('loans.tenureBoundsError'));
      return;
    }
    try {
      await approve.mutateAsync({
        // Only send an override when the admin actually changed it — otherwise
        // the API applies the live product settings.
        interestRateBps: rateChanged ? Math.round(rate * 100) : undefined,
        tenureMonths: tenureChanged ? months : undefined,
        note: note.trim() || undefined,
      });
      toast.success(t('loans.approvedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('loans.approveFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('loans.approveTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="approve-loan" type="submit" loading={approve.isPending}>
            <CheckCircle2 size={15} /> {t('loans.approve')}
          </Button>
        </>
      }
    >
      <form id="approve-loan" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-muted">{t('loans.principalRequested')}</span>
            <span className="text-lg font-bold text-ink">{money(l.principal)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {l.customer.name} · {l.account.accountNumber} ·{' '}
            {t('loans.savingsBalanceOf', { amount: money(l.account.currentBalance) })}
          </p>
        </div>

        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          {t('loans.approveNotice')}
        </Notice>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('loans.annualRate')}
            htmlFor="ap-rate"
            hint={t('loans.annualRateHint')}
          >
            <Input
              id="ap-rate"
              type="number"
              step="0.01"
              min={0}
              max={50}
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
            />
          </Field>
          <Field
            label={t('loans.tenureMonthsField')}
            htmlFor="ap-tenure"
            hint={t('loans.tenureFieldHint')}
          >
            <Input
              id="ap-tenure"
              type="number"
              step="1"
              min={1}
              max={120}
              value={tenure}
              onChange={(e) => setTenure(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label={t('withdrawals.noteOptional')}
          htmlFor="ap-note"
          error={err}
          hint={t('withdrawals.noteHint')}
        >
          <Textarea
            id="ap-note"
            rows={2}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('loans.approveNotePlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function RejectModal({ l, onClose }: { l: LoanDetail; onClose: () => void }) {
  const reject = useRejectLoan(l.id, l.account.id);
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (reason.trim().length < 4) {
      setErr(t('loans.rejectReasonError'));
      return;
    }
    try {
      await reject.mutateAsync({ reason: reason.trim() });
      toast.success(t('loans.rejectedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('loans.rejectFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('loans.rejectApplicationTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="reject-loan" type="submit" variant="danger" loading={reject.isPending}>
            <XCircle size={15} /> {t('loans.rejectApplication')}
          </Button>
        </>
      }
    >
      <form id="reject-loan" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {t('loans.rejectBody', { name: l.customer.name, amount: money(l.principal) })}
        </p>
        <Field label={t('common.reason')} htmlFor="rj-reason" error={err} hint={t('loans.reason4to280')}>
          <Textarea
            id="rj-reason"
            rows={3}
            required
            maxLength={280}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('loans.rejectPlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function DisburseModal({ l, onClose }: { l: LoanDetail; onClose: () => void }) {
  const disburse = useDisburseLoan(l.id, l.account.id);
  const toast = useToast();
  const t = useT();
  const [method, setMethod] = useState<DisbursementMethod>(
    l.disbursementMethod ?? 'bank_transfer',
  );
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!reference.trim()) {
      setErr(t('loans.referenceRequired', { reference: referenceLabelFor(t, method) }));
      return;
    }
    try {
      await disburse.mutateAsync({
        reference: reference.trim(),
        disbursementMethod: method,
        note: note.trim() || undefined,
      });
      toast.success(t('loans.disbursedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('loans.disburseFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('loans.recordDisbursal')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="disburse-loan" type="submit" loading={disburse.isPending}>
            <HandCoins size={15} /> {t('loans.recordDisbursal')}
          </Button>
        </>
      }
    >
      <form id="disburse-loan" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-ink-muted">{t('withdrawals.handOver')}</span>
            <span className="text-xl font-bold text-ink">{money(l.principal)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {t('loans.disburseSummary', {
              count: l.tenureMonths,
              emi: money(l.emiAmount),
              total: money(l.totalPayable),
            })}
          </p>
        </div>

        <Notice tone="red" icon={<TriangleAlert size={16} />}>
          {t('loans.disburseNotice')}
        </Notice>

        <Field label={t('loans.disbursementMethod')} htmlFor="db-method">
          <Select
            id="db-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as DisbursementMethod)}
          >
            <option value="bank_transfer">{t('loans.bankTransfer')}</option>
            <option value="cash">{t('loans.cash')}</option>
          </Select>
        </Field>

        {method === 'bank_transfer' && l.bankAccountMasked && (
          <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 text-ink-soft">
              <Landmark size={15} className="text-ink-muted" />
              <span className="font-mono">••••{l.bankAccountMasked.slice(-4)}</span>
              {l.bankIfsc && <span className="font-mono text-ink-muted">· {l.bankIfsc}</span>}
            </p>
          </div>
        )}

        <Field
          label={referenceLabelFor(t, method)}
          htmlFor="db-ref"
          hint={referenceHintFor(t, method)}
          error={err}
        >
          <Input
            id="db-ref"
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

        <Field label={t('withdrawals.noteOptional')} htmlFor="db-note" hint={t('withdrawals.noteHint')}>
          <Textarea
            id="db-note"
            rows={2}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('loans.disburseNotePlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function RepayModal({ l, onClose }: { l: LoanDetail; onClose: () => void }) {
  const repay = useRecordRepayment(l.id, l.account.id);
  const toast = useToast();
  const t = useT();
  const [amount, setAmount] = useState(String(l.emiAmount?.rupees ?? ''));
  const [method, setMethod] = useState<RepaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const rupees = Number(amount);
  const fromSavings = method === 'from_savings';
  const shortOnSavings = fromSavings && rupees * 100 > (l.account.currentBalance?.paise ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!Number.isFinite(rupees) || rupees < 1) {
      setErr(t('loans.repayAmountError'));
      return;
    }
    try {
      await repay.mutateAsync({
        amountRupees: rupees,
        method,
        reference: reference.trim() || undefined,
      });
      toast.success(t('loans.repaidToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('loans.repayFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('loans.recordRepayment')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="repay-loan" type="submit" loading={repay.isPending}>
            <Receipt size={15} /> {t('loans.recordRepayment')}
          </Button>
        </>
      }
    >
      <form id="repay-loan" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-muted">{t('loans.stillOutstanding')}</span>
            <span className="text-lg font-bold text-ink">{money(l.outstanding)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {t('loans.repaySummary', {
              emi: money(l.emiAmount),
              balance: money(l.account.currentBalance),
            })}
          </p>
        </div>

        <p className="text-sm text-ink-muted">{t('loans.allocationNote')}</p>

        <Field label={t('loans.amountReceived')} htmlFor="rp-amount">
          <Input
            id="rp-amount"
            type="number"
            step="0.01"
            min={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label={t('common.method')} htmlFor="rp-method">
          <Select
            id="rp-method"
            value={method}
            onChange={(e) => {
              const next = e.target.value as RepaymentMethod;
              setMethod(next);
              // The ledger entry is the proof for a savings debit, so drop any
              // reference already typed rather than send it with a disabled field.
              if (next === 'from_savings') setReference('');
            }}
          >
            <option value="cash">{t('loans.cash')}</option>
            <option value="bank_transfer">{t('loans.bankTransfer')}</option>
            <option value="from_savings">{t('loans.fromSavings')}</option>
          </Select>
        </Field>

        {fromSavings && (
          <Notice tone="red" icon={<TriangleAlert size={16} />}>
            {t('loans.fromSavingsWarning', { balance: money(l.account.currentBalance) })}
          </Notice>
        )}

        {shortOnSavings && (
          <Notice tone="amber" icon={<TriangleAlert size={16} />}>
            {t('loans.savingsShortfallNotice')}
          </Notice>
        )}

        <Field
          label={referenceLabelFor(t, method)}
          htmlFor="rp-ref"
          hint={referenceHintFor(t, method)}
          error={err}
        >
          <Input
            id="rp-ref"
            maxLength={64}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={
              method === 'cash'
                ? t('loans.refReceiptPlaceholder')
                : t('withdrawals.refUtrPlaceholder')
            }
            disabled={fromSavings}
          />
        </Field>
      </form>
    </Modal>
  );
}

function DefaultModal({ l, onClose }: { l: LoanDetail; onClose: () => void }) {
  const markDefault = useDefaultLoan(l.id, l.account.id);
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (reason.trim().length < 8) {
      setErr(t('loans.defaultReasonError'));
      return;
    }
    try {
      await markDefault.mutateAsync({ reason: reason.trim() });
      toast.success(t('loans.defaultedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('loans.defaultFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('loans.markDefaultedTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="default-loan" type="submit" variant="danger" loading={markDefault.isPending}>
            <Ban size={15} /> {t('loans.writeOffAction')}
          </Button>
        </>
      }
    >
      <form id="default-loan" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-muted">{t('loans.outstandingToWriteOff')}</span>
            <span className="text-lg font-bold text-ink">{money(l.outstanding)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {l.customer.name} · {l.loanNumber}
          </p>
        </div>

        <Notice tone="red" icon={<TriangleAlert size={16} />}>
          {t('loans.defaultNotice')}
        </Notice>

        <Field label={t('common.reason')} htmlFor="df-reason" error={err} hint={t('loans.reasonMin8')}>
          <Textarea
            id="df-reason"
            rows={3}
            required
            minLength={8}
            maxLength={280}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('loans.defaultPlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function WaiveModal({
  l,
  instalment,
  onClose,
}: {
  l: LoanDetail;
  instalment: LoanInstalment;
  onClose: () => void;
}) {
  const waive = useWaiveInstalment(l.id, instalment.id, l.account.id);
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (reason.trim().length < 4) {
      setErr(t('loans.waiveReasonError'));
      return;
    }
    try {
      await waive.mutateAsync({ reason: reason.trim() });
      toast.success(t('loans.waivedToast', { n: instalment.instalmentNo }));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('loans.waiveFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('loans.waiveInstalmentNo', { n: instalment.instalmentNo })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="waive-inst" type="submit" variant="danger" loading={waive.isPending}>
            {t('loans.waiveInstalment')}
          </Button>
        </>
      }
    >
      <form id="waive-inst" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-muted">{t('loans.amountForgiven')}</span>
            <span className="text-lg font-bold text-ink">{money(instalment.amountDue)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {t('loans.dueOn', { date: formatDate(instalment.dueDate) })} · {l.customer.name}
          </p>
        </div>

        <Notice tone="amber" icon={<TriangleAlert size={16} />}>
          {t('loans.waiveNotice')}
        </Notice>

        <Field label={t('common.reason')} htmlFor="wv-reason" error={err} hint={t('loans.reason4to280')}>
          <Textarea
            id="wv-reason"
            rows={3}
            required
            maxLength={280}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('loans.waivePlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}
