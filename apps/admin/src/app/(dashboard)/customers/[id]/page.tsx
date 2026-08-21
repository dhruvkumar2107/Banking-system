'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  ShieldCheck,
  MapPin,
  Plus,
  Trash2,
  Loader2,
  PiggyBank,
  FileText,
  Landmark,
  Users as UsersIcon,
  Phone,
} from 'lucide-react';
import {
  useCustomer,
  useUpdateCustomer,
  useUpdateKyc,
  useAssignVillage,
  useAddNominee,
  useDeleteNominee,
  useAddDocument,
  useVerifyDocument,
  useUpsertBank,
  useCreatePigmyAccount,
  useVillages,
} from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { money, formatDate, formatDateTime, initials, maskAccount } from '@/lib/format';
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
  LoadingBlock,
  ErrorState,
  EmptyState,
  useToast,
} from '@/components/ui';

type ModalKind = null | 'profile' | 'kyc' | 'village' | 'account' | 'nominee' | 'document' | 'bank';

export default function Customer360Page({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole('superadmin', 'admin');

  const c = useCustomer(id);
  const villages = useVillages();

  const [modal, setModal] = useState<ModalKind>(null);
  const close = () => setModal(null);

  if (c.isLoading) return <LoadingBlock />;
  if (c.isError || !c.data) return <ErrorState message={(c.error as Error)?.message} />;
  const cust = c.data;

  return (
    <div className="space-y-6">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Back to customers
      </Link>

      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {initials(cust.name)}
            </span>
            {cust.name}
          </span>
        }
        subtitle={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Phone size={13} /> {cust.mobile}</span>
            {cust.village && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {cust.village.name}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={cust.kycStatus} />
            <Button variant="outline" size="sm" onClick={() => setModal('profile')}>
              <Pencil size={14} /> Edit
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setModal('kyc')}>
                  <ShieldCheck size={14} /> KYC
                </Button>
                <Button variant="outline" size="sm" onClick={() => setModal('village')}>
                  <MapPin size={14} /> Reassign
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Pigmy accounts */}
          <Card>
            <CardHeader
              title="Pigmy Accounts"
              action={
                <Button size="sm" onClick={() => setModal('account')}>
                  <Plus size={14} /> Open account
                </Button>
              }
            />
            <CardBody>
              {cust.pigmyAccounts.length ? (
                <div className="space-y-3">
                  {cust.pigmyAccounts.map((a) => (
                    <Link
                      key={a.id}
                      href={`/pigmy-accounts/${a.id}`}
                      className="flex items-center justify-between rounded-xl border border-line p-4 transition hover:border-brand-300 hover:shadow-card"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                          <PiggyBank size={18} />
                        </span>
                        <div>
                          <p className="font-mono text-sm font-medium text-ink">{a.accountNumber}</p>
                          <p className="text-xs text-ink-muted">Daily {money(a.dailyAmount)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-ink">{money(a.currentBalance)}</p>
                        <StatusBadge status={a.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No accounts yet" icon={<PiggyBank size={22} />} />
              )}
            </CardBody>
          </Card>

          {/* Recent transactions */}
          <Card>
            <CardHeader title="Recent Transactions" />
            <CardBody>
              {cust.recentTransactions.length ? (
                <div className="divide-y divide-line-soft">
                  {cust.recentTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-ink">{money(t.amount)}</p>
                        <p className="text-xs text-ink-muted">{formatDateTime(t.createdAt)}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No transactions yet" />
              )}
            </CardBody>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader
              title="KYC Documents"
              action={
                <Button size="sm" variant="outline" onClick={() => setModal('document')}>
                  <Plus size={14} /> Add
                </Button>
              }
            />
            <CardBody>
              {cust.documents.length ? (
                <div className="space-y-2">
                  {cust.documents.map((d) => (
                    <DocumentRow key={d.id} customerId={id} doc={d} canVerify={canManage} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No documents uploaded" icon={<FileText size={22} />} />
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="space-y-3 text-sm">
              <Row label="Address" value={cust.address || '—'} />
              <Row label="Village" value={cust.village?.name || '—'} />
              <Row label="Joined" value={formatDate(cust.createdAt)} />
              <Row label="Customer ID" value={<span className="font-mono text-xs">{cust.id}</span>} />
            </CardBody>
          </Card>

          {/* Bank details */}
          <Card>
            <CardHeader
              title="Bank Details"
              action={
                <Button size="sm" variant="outline" onClick={() => setModal('bank')}>
                  <Pencil size={14} /> {cust.bankDetails ? 'Edit' : 'Add'}
                </Button>
              }
            />
            <CardBody>
              {cust.bankDetails ? (
                <div className="space-y-3 text-sm">
                  <Row label="Holder" value={cust.bankDetails.accountHolderName} />
                  <Row label="Account" value={<span className="font-mono">{maskAccount(cust.bankDetails.accountNumber)}</span>} />
                  <Row label="IFSC" value={<span className="font-mono">{cust.bankDetails.ifsc}</span>} />
                </div>
              ) : (
                <EmptyState title="No bank details" icon={<Landmark size={22} />} />
              )}
            </CardBody>
          </Card>

          {/* Nominees */}
          <Card>
            <CardHeader
              title="Nominees"
              action={
                <Button size="sm" variant="outline" onClick={() => setModal('nominee')}>
                  <Plus size={14} /> Add
                </Button>
              }
            />
            <CardBody>
              {cust.nominees.length ? (
                <div className="space-y-2">
                  {cust.nominees.map((n) => (
                    <NomineeRow key={n.id} customerId={id} nominee={n} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No nominees" icon={<UsersIcon size={22} />} />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {modal === 'profile' && <ProfileModal customerId={id} initial={cust} onClose={close} onDone={() => { toast.success('Profile updated'); close(); }} />}
      {modal === 'kyc' && <KycModal customerId={id} current={cust.kycStatus} onClose={close} onDone={() => { toast.success('KYC updated'); close(); }} />}
      {modal === 'village' && <VillageModal customerId={id} current={cust.villageId} villages={villages.data ?? []} onClose={close} onDone={() => { toast.success('Village reassigned'); close(); }} />}
      {modal === 'account' && <AccountModal customerId={id} onClose={close} onDone={() => { toast.success('Account opened'); close(); }} />}
      {modal === 'nominee' && <NomineeModal customerId={id} onClose={close} onDone={() => { toast.success('Nominee added'); close(); }} />}
      {modal === 'document' && <DocumentModal customerId={id} onClose={close} onDone={() => { toast.success('Document added'); close(); }} />}
      {modal === 'bank' && <BankModal customerId={id} initial={cust.bankDetails} onClose={close} onDone={() => { toast.success('Bank details saved'); close(); }} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink-soft">{value}</span>
    </div>
  );
}

// ── inline rows ────────────────────────────────────────────────────────────────
function NomineeRow({ customerId, nominee }: { customerId: string; nominee: { id: string; name: string; relation: string | null; mobile: string | null } }) {
  const del = useDeleteNominee(customerId);
  const toast = useToast();
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <div>
        <p className="text-sm font-medium text-ink">{nominee.name}</p>
        <p className="text-xs text-ink-muted">
          {[nominee.relation, nominee.mobile].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <button
        className="rounded-lg p-1.5 text-ink-faint transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={del.isPending}
        onClick={async () => {
          try {
            await del.mutateAsync(nominee.id);
            toast.success('Nominee removed');
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        aria-label="Delete nominee"
      >
        {del.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
      </button>
    </div>
  );
}

function DocumentRow({ customerId, doc, canVerify }: { customerId: string; doc: { id: string; docType: string; fileUrl: string; verifiedStatus: string; uploadedAt: string }; canVerify: boolean }) {
  const verify = useVerifyDocument(customerId);
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  async function set(status: string) {
    setPendingAction(status);
    try {
      await verify.mutateAsync({ docId: doc.id, status });
      toast.success('Document updated');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingAction(null);
    }
  }
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium capitalize text-ink">{doc.docType.replace(/_/g, ' ')}</p>
        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-brand-600 hover:underline">
          View file
        </a>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={doc.verifiedStatus} />
        {canVerify && doc.verifiedStatus !== 'verified' && (
          <Button size="sm" variant="ghost" onClick={() => set('verified')} disabled={verify.isPending} loading={verify.isPending && pendingAction === 'verified'}>Verify</Button>
        )}
        {canVerify && doc.verifiedStatus !== 'rejected' && (
          <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => set('rejected')} disabled={verify.isPending} loading={verify.isPending && pendingAction === 'rejected'}>Reject</Button>
        )}
      </div>
    </div>
  );
}

// ── modals ─────────────────────────────────────────────────────────────────────
function useErr() {
  return useState<string | null>(null);
}

function ProfileModal({ customerId, initial, onClose, onDone }: { customerId: string; initial: { name: string; address: string | null; photoUrl: string | null }; onClose: () => void; onDone: () => void }) {
  const m = useUpdateCustomer(customerId);
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address ?? '');
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl ?? '');
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await m.mutateAsync({ name: name.trim(), address: address.trim() || undefined, photoUrl: photoUrl.trim() || undefined });
      onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Edit profile" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="pf" type="submit" loading={m.isPending}>Save</Button></>}>
      <form id="pf" onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Photo URL" error={err}><Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" /></Field>
      </form>
    </Modal>
  );
}

function KycModal({ customerId, current, onClose, onDone }: { customerId: string; current: string; onClose: () => void; onDone: () => void }) {
  const m = useUpdateKyc(customerId);
  const [status, setStatus] = useState(current);
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try { await m.mutateAsync(status); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Update KYC status" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="kyc" type="submit" loading={m.isPending}>Save</Button></>}>
      <form id="kyc" onSubmit={submit} className="space-y-4">
        <Field label="KYC status" error={err}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function VillageModal({ customerId, current, villages, onClose, onDone }: { customerId: string; current: string; villages: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const m = useAssignVillage(customerId);
  const [villageId, setVillageId] = useState(current);
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try { await m.mutateAsync(villageId); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Reassign village" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="vil" type="submit" loading={m.isPending}>Save</Button></>}>
      <form id="vil" onSubmit={submit} className="space-y-4">
        <Field label="Village" error={err}>
          <Select value={villageId} onChange={(e) => setVillageId(e.target.value)}>
            {villages.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function AccountModal({ customerId, onClose, onDone }: { customerId: string; onClose: () => void; onDone: () => void }) {
  const m = useCreatePigmyAccount();
  const [amount, setAmount] = useState('100');
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try { await m.mutateAsync({ customerId, dailyAmountRupees: Number(amount) || undefined }); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Open pigmy account" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="acc" type="submit" loading={m.isPending}>Open</Button></>}>
      <form id="acc" onSubmit={submit} className="space-y-4">
        <Field label="Daily amount (₹)" error={err} hint="The fixed daily micro-saving for this account.">
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function NomineeModal({ customerId, onClose, onDone }: { customerId: string; onClose: () => void; onDone: () => void }) {
  const m = useAddNominee(customerId);
  const [form, setForm] = useState({ name: '', relation: '', mobile: '', address: '' });
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile)) { setErr('Invalid mobile number'); return; }
    try {
      await m.mutateAsync({ name: form.name.trim(), relation: form.relation.trim() || undefined, mobile: form.mobile.trim() || undefined, address: form.address.trim() || undefined });
      onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Add nominee" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="nom" type="submit" loading={m.isPending}>Add</Button></>}>
      <form id="nom" onSubmit={submit} className="space-y-4">
        <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relation"><Input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Spouse" /></Field>
          <Field label="Mobile"><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
        </div>
        <Field label="Address" error={err}><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function DocumentModal({ customerId, onClose, onDone }: { customerId: string; onClose: () => void; onDone: () => void }) {
  const m = useAddDocument(customerId);
  const [docType, setDocType] = useState('aadhaar');
  const [fileUrl, setFileUrl] = useState('');
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try { await m.mutateAsync({ docType, fileUrl: fileUrl.trim() }); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Add KYC document" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="doc" type="submit" loading={m.isPending}>Add</Button></>}>
      <form id="doc" onSubmit={submit} className="space-y-4">
        <Field label="Document type">
          <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="aadhaar">Aadhaar</option>
            <option value="pan">PAN</option>
            <option value="voter_id">Voter ID</option>
            <option value="passport">Passport</option>
            <option value="driving_license">Driving License</option>
          </Select>
        </Field>
        <Field label="File URL" error={err} hint="Link to the uploaded document image/PDF.">
          <Input required value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </form>
    </Modal>
  );
}

function BankModal({ customerId, initial, onClose, onDone }: { customerId: string; initial: { accountNumber: string; ifsc: string; accountHolderName: string } | null; onClose: () => void; onDone: () => void }) {
  const m = useUpsertBank(customerId);
  const [form, setForm] = useState({ accountNumber: '', ifsc: initial?.ifsc ?? '', accountHolderName: initial?.accountHolderName ?? '' });
  const [err, setErr] = useErr();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{9,18}$/.test(form.accountNumber)) { setErr('Account number must be 9–18 digits.'); return; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc)) { setErr('Invalid IFSC code.'); return; }
    try { await m.mutateAsync(form); onDone(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title={initial ? 'Update bank details' : 'Add bank details'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="bank" type="submit" loading={m.isPending}>Save</Button></>}>
      <form id="bank" onSubmit={submit} className="space-y-4">
        <Field label="Account holder name"><Input required value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} /></Field>
        <Field label="Account number" hint={initial ? 'Re-enter to update — stored securely, never shown in full.' : undefined}>
          <Input required value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="123456789012" />
        </Field>
        <Field label="IFSC" error={err}><Input required value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" /></Field>
      </form>
    </Modal>
  );
}
