'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Building2, ArrowRight } from 'lucide-react';
import { useCreateVillage, useVillages } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Modal,
  Field,
  Input,
  Badge,
  LoadingBlock,
  ErrorState,
  EmptyState,
  useToast,
} from '@/components/ui';

export default function VillagesPage() {
  const { hasRole } = useAuth();
  const villages = useVillages();
  const create = useCreateVillage();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(code)) {
      setErr('Code must be 2–20 letters, digits, dashes or underscores.');
      return;
    }
    try {
      await create.mutateAsync({ name: name.trim(), code: code.trim() });
      toast.success('Village created');
      setOpen(false);
      setName('');
      setCode('');
    } catch (e) {
      setErr((e as Error).message || 'Could not create village');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Village Management"
        subtitle="Collection zones grouping customers and accounts."
        actions={
          hasRole('superadmin') ? (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> New Village
            </Button>
          ) : null
        }
      />

      {villages.isLoading ? (
        <LoadingBlock />
      ) : villages.isError ? (
        <ErrorState message={(villages.error as Error)?.message} />
      ) : villages.data && villages.data.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {villages.data.map((v) => (
            <Link key={v.id} href={`/villages/${v.id}`}>
              <Card className="h-full p-5 transition hover:border-brand-300 hover:shadow-pop">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Building2 size={20} />
                  </div>
                  <Badge tone="indigo">{v.code}</Badge>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{v.name}</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {v.customerCount} {v.customerCount === 1 ? 'customer' : 'customers'}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
                  <span className="text-xs text-ink-faint">Created {formatDate(v.createdAt)}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                    View <ArrowRight size={13} />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              title="No villages yet"
              message="Create your first village to start onboarding customers."
              icon={<Building2 size={22} />}
              action={
                hasRole('superadmin') ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus size={16} /> New Village
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create village"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="village-form" type="submit" loading={create.isPending}>Create</Button>
          </>
        }
      >
        <form id="village-form" onSubmit={submit} className="space-y-4">
          <Field label="Village name" htmlFor="v-name">
            <Input id="v-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rampur" />
          </Field>
          <Field label="Code" htmlFor="v-code" hint="Short unique identifier, e.g. RMP" error={err}>
            <Input id="v-code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="RMP" />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
