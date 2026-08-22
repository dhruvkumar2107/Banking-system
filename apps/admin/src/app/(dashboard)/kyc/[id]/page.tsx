'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  ExternalLink,
  FileImage,
  IdCard,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Users,
  XCircle,
} from 'lucide-react';
import {
  openAuthedFile,
  useAuthedFile,
  useBypassKyc,
  useKycSubmission,
  useRejectKyc,
  useVerifyKyc,
} from '@/lib/loans-api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useT, type TKey, type Translator } from '@/lib/i18n';
import { KycStageBadge } from '@/components/LoanBadges';
import type { KycSubmission } from '@/lib/loan-types';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Modal,
  Field,
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

type ModalKind = null | 'verify' | 'reject' | 'bypass';

export default function KycDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const t = useT();
  // The API gates verify / reject / bypass on @Roles('superadmin','admin').
  // An agent may read this queue but must not decide on it.
  const canDecide = hasRole('superadmin', 'admin');

  const q = useKycSubmission(id);
  const [modal, setModal] = useState<ModalKind>(null);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} />;
  const k = q.data;

  const isSubmitted = k.kycStage === 'submitted';
  const isSettled = k.kycStage === 'verified' || k.kycStage === 'bypassed';
  const canBypass = !isSettled;

  const aadhaarDoc = k.documents.find((d) => /aadhaar/i.test(d.kind));
  const otherDocs = k.documents.filter((d) => d !== aadhaarDoc);

  return (
    <div className="space-y-6">
      <Link
        href="/kyc"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {t('kyc.backToQueue')}
      </Link>

      <PageHeader
        title={k.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{k.mobile}</span>
            <span>· {k.village}</span>
            {k.kycSubmittedAt && (
              <span>· {t('kyc.submittedWhen', { date: formatDateTime(k.kycSubmittedAt) })}</span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <KycStageBadge stage={k.kycStage} />
            {canDecide && isSubmitted && (
              <>
                <Button size="sm" variant="danger" onClick={() => setModal('reject')}>
                  <XCircle size={14} /> {t('kyc.reject')}
                </Button>
                <Button size="sm" onClick={() => setModal('verify')}>
                  <ShieldCheck size={14} /> {t('kyc.verify')}
                </Button>
              </>
            )}
            {canDecide && canBypass && (
              <Button size="sm" variant="outline" onClick={() => setModal('bypass')}>
                <BadgeCheck size={14} /> {t('kyc.bypass')}
              </Button>
            )}
          </div>
        }
      />

      {!canDecide && (
        <Notice tone="slate" icon={<ShieldCheck size={16} />}>
          {t('kyc.readOnlyNotice', {
            admin: t('role.admin'),
            superAdmin: t('role.superadmin'),
          })}
        </Notice>
      )}

      {isSubmitted && (
        <Notice tone="amber" icon={<ShieldAlert size={16} />}>
          {t('kyc.reviewNotice')}
        </Notice>
      )}

      {k.kycStage === 'verified' && (
        <Notice tone="green" icon={<ShieldCheck size={16} />}>
          {t('status.verified')}
          {k.verifiedBy ? t('withdrawals.approvedBy', { name: k.verifiedBy }) : ''}
          {k.kycVerifiedAt
            ? t('withdrawals.approvedOn', { when: formatDateTime(k.kycVerifiedAt) })
            : ''}
          . {t('kyc.verifiedNotice')}
        </Notice>
      )}

      {k.kycStage === 'bypassed' && (
        <Notice tone="blue" icon={<BadgeCheck size={16} />}>
          {t('kyc.bypassedHeading')}
          {k.bypassedBy ? t('withdrawals.approvedBy', { name: k.bypassedBy }) : ''}
          {k.bypassedAt ? t('withdrawals.approvedOn', { when: formatDateTime(k.bypassedAt) }) : ''}
          {' — '}
          {t('kyc.bypassedNotice')}
          {k.bypassReason ? ` ${t('kyc.reasonGiven', { reason: k.bypassReason })}` : ''}
        </Notice>
      )}

      {k.kycStage === 'rejected' && (
        <Notice tone="red" icon={<XCircle size={16} />}>
          {t('status.rejected')}. {t('kyc.rejectedReasonLabel')}{' '}
          <strong>{k.kycRejectionReason || t('kyc.noReasonRecorded')}</strong>.{' '}
          {t('kyc.rejectedNotice')}
        </Notice>
      )}

      {k.kycStage === 'not_started' && (
        <Notice tone="slate" icon={<IdCard size={16} />}>
          {t('kyc.notStartedNotice')}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── what was submitted ──────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Camera size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('kyc.submittedPhoto')}
                </span>
              }
              action={
                k.photoUrl ? (
                  k.photoIsLive ? (
                    <Badge tone="green">
                      <Camera size={12} /> {t('kyc.livePhoto')}
                    </Badge>
                  ) : (
                    <Badge tone="amber">{t('kyc.uploadedFromGallery')}</Badge>
                  )
                ) : null
              }
            />
            <CardBody>
              {k.photoUrl ? (
                <>
                  <AuthedImage url={k.photoUrl} alt={t('kyc.photoAlt')} />
                  <p className="pt-3 text-xs text-ink-faint">
                    {k.photoIsLive ? t('kyc.livePhotoHint') : t('kyc.galleryPhotoHint')}
                  </p>
                </>
              ) : (
                <EmptyState
                  title={t('kyc.noPhoto')}
                  message={t('kyc.noPhotoHint')}
                  icon={<Camera size={22} />}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <FileImage size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('kyc.documents')}
                </span>
              }
              subtitle={t('kyc.documentsSubtitle')}
            />
            <CardBody className="space-y-5">
              {aadhaarDoc && (
                <DocumentBlock
                  kind={t('kyc.docAadhaarCard')}
                  fileUrl={aadhaarDoc.fileUrl}
                  status={aadhaarDoc.status}
                  uploadedAt={aadhaarDoc.uploadedAt}
                />
              )}
              {otherDocs.map((d) => (
                <DocumentBlock
                  key={d.id}
                  kind={docKindLabel(t, d.kind)}
                  fileUrl={d.fileUrl}
                  status={d.status}
                  uploadedAt={d.uploadedAt}
                />
              ))}
              {!k.documents.length && (
                <EmptyState
                  title={t('customers.noDocuments')}
                  message={t('kyc.noDocumentsHint')}
                  icon={<FileImage size={22} />}
                />
              )}
            </CardBody>
          </Card>
        </div>

        {/* ── what it should match ────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <IdCard size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('kyc.customerDetails')}
                </span>
              }
              subtitle={t('kyc.customerDetailsSubtitle')}
            />
            <CardBody className="space-y-1">
              <Row label={t('common.fullName')} value={k.name} />
              <Row
                label={t('common.mobile')}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={13} className="text-ink-faint" />
                    <span className="font-mono">{k.mobile}</span>
                  </span>
                }
              />
              <Row label={t('common.village')} value={k.village} />
              {/* Only the masked form exists in the API — a full Aadhaar number is
                  never sent to the admin panel and must never be collected here. */}
              <Row
                label={t('kyc.aadhaarNumber')}
                value={k.aadhaarMasked ?? '—'}
                mono
                hint={t('kyc.aadhaarMaskedHint')}
              />
              <Row
                label={t('common.address')}
                value={
                  <span className="inline-flex items-start gap-1.5 text-right">
                    <MapPin size={13} className="mt-0.5 shrink-0 text-ink-faint" />
                    <span>{k.address || '—'}</span>
                  </span>
                }
              />
              {k.kycSubmittedAt && (
                <Row label={t('kyc.submittedAt')} value={formatDateTime(k.kycSubmittedAt)} />
              )}
              <div className="pt-3">
                <Link
                  href={`/customers/${k.customerId}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  {t('kyc.openCustomerProfile')} <ExternalLink size={13} />
                </Link>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Users size={16} className="text-brand-600 dark:text-brand-300" />{' '}
                  {t('kyc.nominees')}
                </span>
              }
              subtitle={t('kyc.nomineesSubtitle')}
              action={<Badge tone="slate">{k.nominees.length}</Badge>}
            />
            <CardBody>
              {k.nominees.length ? (
                <TableWrap>
                  <Table className="min-w-[420px]">
                    <Thead>
                      <tr>
                        <Th>{t('common.name')}</Th>
                        <Th>{t('kyc.nomineeRelation')}</Th>
                        <Th>{t('common.mobile')}</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {k.nominees.map((n) => (
                        <Tr key={n.id}>
                          <Td className="font-medium text-ink">{n.name}</Td>
                          <Td className="text-sm text-ink-soft">{n.relation || '—'}</Td>
                          <Td className="font-mono text-xs text-ink-soft">{n.mobile || '—'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>
              ) : (
                <EmptyState
                  title={t('kyc.noNomineeAdded')}
                  message={t('kyc.noNomineeHint')}
                  icon={<Users size={22} />}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {modal === 'verify' && <VerifyModal k={k} onClose={() => setModal(null)} />}
      {modal === 'reject' && <RejectModal k={k} onClose={() => setModal(null)} />}
      {modal === 'bypass' && <BypassModal k={k} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ─────────────────────────── authenticated files ─────────────────────────── */

function looksLikeImage(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|heic|bmp)(\?|$)/i.test(url);
}

/**
 * The document vocabulary, from the dictionary. Plain helpers, not components,
 * so the translator is passed in rather than pulled from a hook.
 */
const DOC_KIND_KEYS: Record<string, TKey | undefined> = {
  aadhaar: 'kyc.docAadhaarCard',
  aadhaar_front: 'kyc.docAadhaarFront',
  aadhaar_back: 'kyc.docAadhaarBack',
  pan: 'kyc.docPanCard',
  voter_id: 'docType.voter_id',
  photo: 'kyc.docPhotograph',
  signature: 'kyc.docSignature',
  document: 'kyc.docDocument',
};

function docKindLabel(t: Translator, kind: string): string {
  const key = DOC_KIND_KEYS[kind];
  return key ? t(key) : kind.replace(/_/g, ' ');
}

/** Per-document review state. An unexpected value from the API passes through. */
const DOC_STATUS_KEYS: Record<string, TKey | undefined> = {
  pending: 'status.pending',
  verified: 'status.verified',
  rejected: 'status.rejected',
};

function docStatusLabel(t: Translator, status: string): string {
  const key = DOC_STATUS_KEYS[status];
  return key ? t(key) : status;
}

/**
 * Renders an upload inline. The bytes come through `api.blob()` because the
 * uploads route is access-controlled — a plain `<img src="/api/uploads/…">`
 * carries no bearer token and 401s.
 */
function AuthedImage({ url, alt }: { url: string; alt: string }) {
  const file = useAuthedFile(url);
  const t = useT();

  if (file.isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-xl bg-surface-2" />;
  }

  if (file.isError || !file.src) {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-surface-2 px-4 py-5 text-center">
        <p className="text-sm text-ink-muted">
          {file.error?.message || t('kyc.fileLoadFailed')}
        </p>
        <OpenFileButton url={url} label={t('kyc.tryOpenInNewTab')} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.src}
        alt={alt}
        className="max-h-96 w-full rounded-xl border border-line bg-surface-2 object-contain"
      />
      <OpenFileButton url={url} label={t('kyc.openFullSize')} />
    </div>
  );
}

function OpenFileButton({ url, label }: { url: string; label: string }) {
  const toast = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      await openAuthedFile(url);
    } catch (e) {
      toast.error((e as Error).message || t('kyc.openFileFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={open} loading={busy}>
      <ExternalLink size={14} /> {label}
    </Button>
  );
}

function DocumentBlock({
  kind,
  fileUrl,
  status,
  uploadedAt,
}: {
  kind: string;
  fileUrl: string;
  status: string;
  uploadedAt: string;
}) {
  const t = useT();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{kind}</p>
          <p className="text-xs text-ink-faint">
            {t('kyc.uploadedOn', { date: formatDateTime(uploadedAt) })}
          </p>
        </div>
        <Badge
          tone={status === 'verified' ? 'green' : status === 'rejected' ? 'red' : 'amber'}
        >
          {docStatusLabel(t, status)}
        </Badge>
      </div>
      {looksLikeImage(fileUrl) ? (
        <AuthedImage url={fileUrl} alt={kind} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <p className="text-sm text-ink-muted">{t('kyc.notAnImage')}</p>
          <OpenFileButton url={fileUrl} label={t('kyc.openDocument')} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── small pieces ─────────────────────────── */

function Row({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-sm font-medium text-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
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

/* ─────────────────────────── decisions ─────────────────────────── */

/**
 * A KYC decision changes what the customer is allowed to do, so a failure is
 * never swallowed: inline next to the form, and in a toast so it survives the
 * modal being dismissed.
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

function VerifyModal({ k, onClose }: { k: KycSubmission; onClose: () => void }) {
  const verify = useVerifyKyc(k.customerId);
  const toast = useToast();
  const t = useT();
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    try {
      await verify.mutateAsync(undefined);
      toast.success(t('kyc.verifiedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('kyc.verifyFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('kyc.verifyTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={verify.isPending}>
            <ShieldCheck size={15} /> {t('kyc.verify')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{t('kyc.verifyBody', { name: k.name })}</p>
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <p className="text-ink-soft">{k.mobile}</p>
          <p className="font-mono text-xs text-ink-muted">{k.aadhaarMasked ?? '—'}</p>
        </div>
        <Notice tone="blue" icon={<ShieldCheck size={16} />}>
          {t('kyc.verifyNotice')}
        </Notice>
        {err && (
          <Notice tone="red" icon={<TriangleAlert size={16} />}>
            {err}
          </Notice>
        )}
      </div>
    </Modal>
  );
}

function RejectModal({ k, onClose }: { k: KycSubmission; onClose: () => void }) {
  const reject = useRejectKyc(k.customerId);
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (reason.trim().length < 4) {
      setErr(t('kyc.rejectReasonError'));
      return;
    }
    try {
      await reject.mutateAsync({ reason: reason.trim() });
      toast.success(t('kyc.rejectedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('kyc.rejectFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('kyc.rejectTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="reject-kyc" type="submit" variant="danger" loading={reject.isPending}>
            <XCircle size={15} /> {t('kyc.reject')}
          </Button>
        </>
      }
    >
      <form id="reject-kyc" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">{t('kyc.rejectBody', { name: k.name })}</p>
        <Field
          label={t('common.reason')}
          htmlFor="rk-reason"
          error={err}
          hint={t('kyc.rejectReasonHint')}
        >
          <Textarea
            id="rk-reason"
            rows={3}
            required
            maxLength={280}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('kyc.rejectPlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function BypassModal({ k, onClose }: { k: KycSubmission; onClose: () => void }) {
  const bypass = useBypassKyc(k.customerId);
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const tooShort = reason.trim().length > 0 && reason.trim().length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    // The API enforces 8 characters; catch it here so the admin is not bounced
    // by a validation error after committing to an override.
    if (reason.trim().length < 8) {
      setErr(t('kyc.bypassReasonError'));
      return;
    }
    try {
      await bypass.mutateAsync({ reason: reason.trim() });
      toast.success(t('kyc.bypassedToast'));
      onClose();
    } catch (e) {
      fail(setErr, toast, e, t('kyc.bypassFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('kyc.bypassTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="bypass-kyc" type="submit" variant="danger" loading={bypass.isPending}>
            <BadgeCheck size={15} /> {t('kyc.bypassTitle')}
          </Button>
        </>
      }
    >
      <form id="bypass-kyc" onSubmit={submit} className="space-y-4">
        <Notice tone="red" icon={<TriangleAlert size={16} />}>
          {t('kyc.bypassDanger', { name: k.name })}
        </Notice>

        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <p className="font-medium text-ink">{k.name}</p>
          <p className="text-ink-soft">
            {k.mobile} · {k.village}
          </p>
          <p className="font-mono text-xs text-ink-muted">
            {k.aadhaarMasked ?? t('kyc.noAadhaarOnFile')}
          </p>
        </div>

        <Field
          label={t('kyc.bypassReasonLabel')}
          htmlFor="bp-reason"
          error={err ?? (tooShort ? t('settings.min8') : undefined)}
          hint={t('kyc.bypassReasonHint')}
        >
          <Textarea
            id="bp-reason"
            rows={3}
            required
            minLength={8}
            maxLength={280}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('kyc.bypassPlaceholder')}
          />
        </Field>
      </form>
    </Modal>
  );
}
