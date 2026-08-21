'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Users } from 'lucide-react';
import { useCreateCustomer, useCustomers, useVillages } from '@/lib/hooks';
import { useDebounce } from '@/lib/useDebounce';
import { money, formatDate, initials } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Input,
  Select,
  Field,
  Modal,
  StatusBadge,
  Pagination,
  LoadingBlock,
  EmptyState,
  ErrorState,
  TableWrap,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
} from '@/components/ui';

export default function CustomersPage() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [villageId, setVillageId] = useState('');
  const [kycStatus, setKycStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);

  const villages = useVillages();
  const customers = useCustomers({
    search: debounced || undefined,
    villageId: villageId || undefined,
    kycStatus: kycStatus || undefined,
    page,
    limit: 15,
  });
  const create = useCreateCustomer();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', villageId: '', address: '', dailyAmountRupees: '100' });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, val: string) {
    setForm((f) => ({ ...f, [k]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^[6-9]\d{9}$/.test(form.mobile)) {
      setErr('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!form.villageId) {
      setErr('Please select a village.');
      return;
    }
    try {
      const created = (await create.mutateAsync({
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        villageId: form.villageId,
        address: form.address.trim() || undefined,
        dailyAmountRupees: Number(form.dailyAmountRupees) || undefined,
      })) as { id?: string };
      toast.success('Customer registered');
      setOpen(false);
      setForm({ name: '', mobile: '', villageId: '', address: '', dailyAmountRupees: '100' });
      if (created?.id) router.push(`/customers/${created.id}`);
    } catch (e) {
      setErr((e as Error).message || 'Could not register customer');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Management"
        subtitle="Search, onboard, and manage micro-savings customers."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New Customer
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Search" className="min-w-[220px] flex-1">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <Input
                  className="pl-9"
                  placeholder="Name or mobile…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
            </Field>
            <Field label="Village" className="w-52">
              <Select value={villageId} onChange={(e) => { setVillageId(e.target.value); setPage(1); }}>
                <option value="">All villages</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="KYC" className="w-40">
              <Select value={kycStatus} onChange={(e) => { setKycStatus(e.target.value); setPage(1); }}>
                <option value="">All KYC</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </Select>
            </Field>
          </div>

          {customers.isError ? (
            <ErrorState message="Could not load customers." />
          ) : customers.isLoading ? (
            <LoadingBlock />
          ) : customers.data && customers.data.data.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Customer</Th>
                      <Th>Mobile</Th>
                      <Th>Village</Th>
                      <Th>KYC</Th>
                      <Th>Accounts</Th>
                      <Th>Balance</Th>
                      <Th>Joined</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {customers.data.data.map((c) => (
                      <Tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="cursor-pointer">
                        <Td>
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                              {initials(c.name)}
                            </span>
                            <span className="font-medium text-ink">{c.name}</span>
                          </div>
                        </Td>
                        <Td>{c.mobile}</Td>
                        <Td>{c.village}</Td>
                        <Td><StatusBadge status={c.kycStatus} /></Td>
                        <Td>{c.accountCount}</Td>
                        <Td className="font-semibold text-ink">{money(c.totalBalance)}</Td>
                        <Td className="text-xs">{formatDate(c.createdAt)}</Td>
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
            <EmptyState title="No customers found" icon={<Users size={22} />} message="Try adjusting filters or onboard a new customer." />
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Register customer"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="customer-form" type="submit" loading={create.isPending}>Register</Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={submit} className="space-y-4">
          <Field label="Full name">
            <Input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Rahul Kumar" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile">
              <Input required value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="9876543210" />
            </Field>
            <Field label="Daily amount (₹)">
              <Input type="number" min={1} value={form.dailyAmountRupees} onChange={(e) => set('dailyAmountRupees', e.target.value)} />
            </Field>
          </div>
          <Field label="Village">
            <Select required value={form.villageId} onChange={(e) => set('villageId', e.target.value)}>
              <option value="">Select village…</option>
              {villages.data?.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Address (optional)" error={err}>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="House 12, Main Road" />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
