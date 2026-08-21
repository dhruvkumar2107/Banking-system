'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  Sun,
  Moon,
  Monitor,
  KeyRound,
  UserPlus,
  ShieldCheck,
  Pencil,
  RotateCcw,
  Palette,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  useAdmins,
  useVillages,
  useCreateAdmin,
  useUpdateAdmin,
  useResetAdminPassword,
  useChangeOwnPassword,
} from '@/lib/hooks';
import type { AdminRole, AdminUser } from '@/lib/types';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Field,
  Input,
  Select,
  Modal,
  Badge,
  StatusBadge,
  Table,
  TableWrap,
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

const ROLE_LABEL: Record<AdminRole, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  agent: 'Agent',
};

export default function SettingsPage() {
  const { hasRole } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage appearance, your account security, and team access."
      />
      <AppearanceCard />
      <AccountCard />
      {hasRole('superadmin') && <TeamCard />}
    </div>
  );
}

/* ─────────────────────────── Appearance ─────────────────────────── */

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const options: { value: string; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Palette size={16} className="text-brand-600 dark:text-brand-300" /> Appearance
          </span>
        }
        subtitle="Choose how the console looks on this device."
      />
      <CardBody>
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {options.map((o) => {
            const Icon = o.icon;
            const active = theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink-soft',
                )}
                aria-pressed={active}
              >
                <Icon size={16} />
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          “System” follows your operating system’s light or dark preference automatically.
        </p>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Account ─────────────────────────── */

function AccountCard() {
  const { user } = useAuth();
  const changePw = useChangeOwnPassword();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 8) {
      setErr('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setErr('New password and confirmation do not match.');
      return;
    }
    try {
      await changePw.mutateAsync({ currentPassword: current, newPassword: next });
      toast.success('Password updated');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setErr((e as Error).message || 'Could not update password');
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <KeyRound size={16} className="text-brand-600 dark:text-brand-300" /> Account security
          </span>
        }
        subtitle={
          user ? (
            <>
              Signed in as <span className="font-medium text-ink-soft">{user.email}</span> ·{' '}
              {ROLE_LABEL[user.role]}
            </>
          ) : (
            'Change your sign-in password.'
          )
        }
      />
      <CardBody>
        <form onSubmit={submit} className="grid max-w-xl gap-4">
          <Field label="Current password" htmlFor="cur-pw">
            <Input
              id="cur-pw"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="new-pw" hint="At least 8 characters">
              <Input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Confirm new password" htmlFor="conf-pw" error={err}>
              <Input
                id="conf-pw"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </div>
          <div>
            <Button type="submit" loading={changePw.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Team & roles ─────────────────────────── */

function TeamCard() {
  const { user } = useAuth();
  const admins = useAdmins({ page: 1, limit: 100 });
  const villages = useVillages();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const villageName = (id: string) =>
    villages.data?.find((v) => v.id === id)?.code ?? id.slice(0, 6);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <UserCog size={16} className="text-brand-600 dark:text-brand-300" /> Team &amp; roles
          </span>
        }
        subtitle="Manage admin users and their village access."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus size={15} /> New admin
          </Button>
        }
      />
      <CardBody className="p-0">
        {admins.isLoading ? (
          <LoadingBlock />
        ) : admins.isError ? (
          <ErrorState message={(admins.error as Error)?.message} />
        ) : admins.data && admins.data.data.length ? (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Villages</Th>
                  <Th>Status</Th>
                  <Th>Added</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </Thead>
              <Tbody>
                {admins.data.data.map((a) => {
                  const isSelf = a.id === user?.id;
                  const active = a.isActive ?? true;
                  return (
                    <Tr key={a.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{a.name}</span>
                          {isSelf && <Badge tone="indigo">You</Badge>}
                        </div>
                        <div className="text-xs text-ink-muted">{a.email}</div>
                      </Td>
                      <Td>
                        <Badge tone={a.role === 'agent' ? 'slate' : a.role === 'admin' ? 'blue' : 'indigo'}>
                          <ShieldCheck size={12} />
                          {ROLE_LABEL[a.role]}
                        </Badge>
                      </Td>
                      <Td>
                        {a.role === 'superadmin' ? (
                          <span className="text-xs text-ink-faint">All villages</span>
                        ) : a.assignedVillages.length ? (
                          <div className="flex flex-wrap gap-1">
                            {a.assignedVillages.slice(0, 3).map((v) => (
                              <Badge key={v} tone="slate">
                                {villageName(v)}
                              </Badge>
                            ))}
                            {a.assignedVillages.length > 3 && (
                              <Badge tone="slate">+{a.assignedVillages.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-faint">None</span>
                        )}
                      </Td>
                      <Td>
                        <StatusBadge status={active ? 'active' : 'inactive'} />
                      </Td>
                      <Td className="text-xs text-ink-muted">
                        {a.createdAt ? formatDate(a.createdAt) : '—'}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                            <Pencil size={14} /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setResetting(a)}>
                            <RotateCcw size={14} /> Password
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableWrap>
        ) : (
          <EmptyState title="No admins found" icon={<UserCog size={22} />} />
        )}
      </CardBody>

      {creating && (
        <CreateAdminModal
          villages={villages.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <EditAdminModal
          admin={editing}
          isSelf={editing.id === user?.id}
          villages={villages.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {resetting && (
        <ResetPasswordModal admin={resetting} onClose={() => setResetting(null)} />
      )}
    </Card>
  );
}

/* ─────────── village multiselect (shared by create/edit) ─────────── */

function VillagePicker({
  villages,
  selected,
  onToggle,
}: {
  villages: { id: string; name: string; code: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!villages.length) {
    return <p className="text-xs text-ink-muted">No villages available.</p>;
  }
  return (
    <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface-2 p-2">
      {villages.map((v) => {
        const on = selected.includes(v.id);
        return (
          <label
            key={v.id}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
              on ? 'bg-brand-500/10 text-ink' : 'text-ink-soft hover:bg-surface',
            )}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(v.id)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
            />
            <span className="font-medium">{v.name}</span>
            <Badge tone="slate">{v.code}</Badge>
          </label>
        );
      })}
    </div>
  );
}

const ROLES: AdminRole[] = ['superadmin', 'admin', 'agent'];

function CreateAdminModal({
  villages,
  onClose,
}: {
  villages: { id: string; name: string; code: string }[];
  onClose: () => void;
}) {
  const create = useCreateAdmin();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('agent');
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const needsVillages = role !== 'superadmin';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        assignedVillages: needsVillages ? selected : [],
      });
      toast.success('Admin created');
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Could not create admin');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add admin user"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="create-admin" type="submit" loading={create.isPending}>
            Create admin
          </Button>
        </>
      }
    >
      <form id="create-admin" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ca-name">
            <Input id="ca-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" />
          </Field>
          <Field label="Email" htmlFor="ca-email">
            <Input id="ca-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@bank.example" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Temporary password" htmlFor="ca-pw" hint="At least 8 characters">
            <Input id="ca-pw" type="text" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a starter password" />
          </Field>
          <Field label="Role" htmlFor="ca-role">
            <Select id="ca-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {needsVillages && (
          <Field
            label="Assigned villages"
            hint="Data this user can see. Leave empty for none."
            error={err}
          >
            <VillagePicker
              villages={villages}
              selected={selected}
              onToggle={(id) =>
                setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
              }
            />
          </Field>
        )}
        {!needsVillages && err && <p className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}
        {!needsVillages && (
          <p className="text-xs text-ink-muted">Super Admins have access to all villages.</p>
        )}
      </form>
    </Modal>
  );
}

function EditAdminModal({
  admin,
  isSelf,
  villages,
  onClose,
}: {
  admin: AdminUser;
  isSelf: boolean;
  villages: { id: string; name: string; code: string }[];
  onClose: () => void;
}) {
  const update = useUpdateAdmin(admin.id);
  const toast = useToast();
  const [name, setName] = useState(admin.name);
  const [role, setRole] = useState<AdminRole>(admin.role);
  const [active, setActive] = useState(admin.isActive ?? true);
  const [selected, setSelected] = useState<string[]>(admin.assignedVillages ?? []);
  const [err, setErr] = useState<string | null>(null);

  const needsVillages = role !== 'superadmin';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await update.mutateAsync({
        name: name.trim(),
        role,
        isActive: active,
        assignedVillages: needsVillages ? selected : [],
      });
      toast.success('Admin updated');
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Could not update admin');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${admin.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="edit-admin" type="submit" loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-admin" onSubmit={submit} className="space-y-4">
        <Field label="Full name" htmlFor="ea-name">
          <Input id="ea-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" htmlFor="ea-role" hint={isSelf ? 'You cannot change your own role' : undefined}>
            <Select
              id="ea-role"
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value as AdminRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Account status" hint={isSelf ? 'You cannot deactivate yourself' : undefined}>
            <label
              className={cn(
                'flex h-[42px] items-center justify-between rounded-xl border border-line px-3',
                isSelf ? 'opacity-60' : 'cursor-pointer',
              )}
            >
              <span className="text-sm text-ink-soft">{active ? 'Active' : 'Inactive'}</span>
              <input
                type="checkbox"
                checked={active}
                disabled={isSelf}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
              />
            </label>
          </Field>
        </div>
        {needsVillages && (
          <Field label="Assigned villages">
            <VillagePicker
              villages={villages}
              selected={selected}
              onToggle={(id) =>
                setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
              }
            />
          </Field>
        )}
        {err && <p className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ admin, onClose }: { admin: AdminUser; onClose: () => void }) {
  const reset = useResetAdminPassword(admin.id);
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (pw !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    try {
      await reset.mutateAsync(pw);
      toast.success(`Password reset for ${admin.name}`);
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Could not reset password');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="reset-pw" type="submit" variant="danger" loading={reset.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-pw" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Set a new password for <span className="font-medium text-ink-soft">{admin.email}</span>.
          They should change it after signing in.
        </p>
        <Field label="New password" htmlFor="rp-pw" hint="At least 8 characters">
          <Input id="rp-pw" type="text" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Confirm password" htmlFor="rp-conf" error={err}>
          <Input id="rp-conf" type="text" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
