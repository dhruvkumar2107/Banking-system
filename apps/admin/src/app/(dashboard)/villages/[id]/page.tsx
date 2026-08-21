'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Landmark, Pencil } from 'lucide-react';
import { useCustomers, useUpdateVillage, useVillage } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { inr, formatDate, money } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Button,
  Badge,
  Modal,
  Field,
  Input,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Pagination,
  StatusBadge,
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
} from '@/components/ui';

export default function VillageDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { hasRole } = useAuth();
  const toast = useToast();
  const village = useVillage(id);
  const update = useUpdateVillage(id);

  const [page, setPage] = useState(1);
  const customers = useCustomers({ villageId: id, page, limit: 10 });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function openEdit() {
    setName(village.data?.name ?? '');
    setCode(village.data?.code ?? '');
    setErr(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (code && !/^[A-Za-z0-9_-]{2,20}$/.test(code)) {
      setErr('Code must be 2–20 letters, digits, dashes or underscores.');
      return;
    }
    try {
      await update.mutateAsync({ name: name.trim(), code: code.trim() });
      toast.success('Village updated');
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message || 'Update failed');
    }
  }

  if (village.isLoading) return <LoadingBlock />;
  if (village.isError || !village.data) return <ErrorState message={(village.error as Error)?.message} />;

  const v = village.data;

  return (
    <div className="space-y-6">
      <Link href="/villages" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Back to villages
      </Link>

      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            {v.name} <Badge tone="indigo">{v.code}</Badge>
          </span>
        }
        subtitle={`Created ${formatDate(v.createdAt)}`}
        actions={
          hasRole('superadmin') ? (
            <Button variant="outline" onClick={openEdit}>
              <Pencil size={15} /> Edit
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Customers" value={v.stats.customerCount} icon={<Users size={20} />} tone="indigo" />
        <StatCard label="Total Balance" value={inr(v.stats.totalBalance)} icon={<Landmark size={20} />} tone="green" />
      </div>

      <Card>
        <CardHeader title="Customers in this village" />
        <CardBody className="space-y-4">
          {customers.isLoading ? (
            <LoadingBlock />
          ) : customers.data && customers.data.data.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Name</Th>
                      <Th>Mobile</Th>
                      <Th>KYC</Th>
                      <Th>Accounts</Th>
                      <Th>Balance</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {customers.data.data.map((c) => (
                      <Tr key={c.id} className="cursor-pointer">
                        <Td>
                          <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                            {c.name}
                          </Link>
                        </Td>
                        <Td>{c.mobile}</Td>
                        <Td><StatusBadge status={c.kycStatus} /></Td>
                        <Td>{c.accountCount}</Td>
                        <Td className="font-semibold text-ink">{money(c.totalBalance)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
              <Pagination
                page={customers.data.page}
                pages={customers.data.pages}
                total={customers.data.total}
                limit={customers.data.limit}
                onPage={setPage}
              />
            </>
          ) : (
            <EmptyState title="No customers in this village yet" icon={<Users size={22} />} />
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit village"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="village-edit" type="submit" loading={update.isPending}>Save</Button>
          </>
        }
      >
        <form id="village-edit" onSubmit={submit} className="space-y-4">
          <Field label="Village name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Code" error={err}>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
