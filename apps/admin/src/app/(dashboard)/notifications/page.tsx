'use client';

import { useState } from 'react';
import { Megaphone, Send, ShieldAlert } from 'lucide-react';
import { useBroadcast, useVillages } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
  Select,
  Button,
  EmptyState,
  useToast,
} from '@/components/ui';

export default function NotificationsPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const villages = useVillages();
  const broadcast = useBroadcast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [villageId, setVillageId] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!hasRole('superadmin', 'admin')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" />
        <EmptyState
          title="Not authorised"
          message="Only administrators can broadcast notifications."
          icon={<ShieldAlert size={22} />}
        />
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (title.trim().length < 2) { setErr('Title must be at least 2 characters.'); return; }
    if (body.trim().length < 2) { setErr('Message must be at least 2 characters.'); return; }
    try {
      const res = await broadcast.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        villageId: villageId || undefined,
      });
      const sent = (res as { sent?: number } | undefined)?.sent ?? 0;
      toast.success(`Broadcast sent to ${sent} customer(s).`);
      setTitle('');
      setBody('');
      setVillageId('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Broadcast an announcement to customers in the app."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="New broadcast" subtitle="Delivered as an in-app notification to each targeted customer." />
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Title" error={err}>
                <Input
                  placeholder="e.g. Branch holiday notice"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Message" hint={`${body.length}/1000 characters`}>
                <Textarea
                  placeholder="Write the announcement customers will see…"
                  value={body}
                  maxLength={1000}
                  rows={5}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
              <Field label="Target" hint="Leave as all villages to reach every customer you manage.">
                <Select value={villageId} onChange={(e) => setVillageId(e.target.value)}>
                  <option value="">All villages</option>
                  {villages.data?.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end">
                <Button type="submit" loading={broadcast.isPending}>
                  <Send size={15} /> Send broadcast
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Preview" />
          <CardBody>
            <div className="rounded-xl border border-ink-line bg-surface-2 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                  <Megaphone size={17} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{title || 'Notification title'}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-muted">
                    {body || 'Your message will appear here as the customer will see it.'}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              {villageId
                ? `Targeting ${villages.data?.find((v) => v.id === villageId)?.name ?? 'selected village'} only.`
                : 'Targeting all villages you have access to.'}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
