'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { api } from './api';
import type {
  AdminTransaction,
  AdminUser,
  AuditLog,
  BankDetails,
  Customer360,
  CustomerDocument,
  CustomerListItem,
  DashboardSummary,
  DateWiseReport,
  LedgerEntry,
  Nominee,
  Paginated,
  PaidWithdrawal,
  PigmyAccountDetail,
  PigmyOverviewRow,
  Reconciliation,
  Scheme,
  VillageDetail,
  VillageListItem,
  VillageWiseRow,
  WithdrawalDetail,
  WithdrawalRequest,
  WithdrawalRow,
} from './types';

// ── query keys ──────────────────────────────────────────────────────────────
export const qk = {
  dashboard: ['dashboard'] as const,
  dateWise: (p: unknown) => ['reports', 'date-wise', p] as const,
  villageWise: (p: unknown) => ['reports', 'village-wise', p] as const,
  analytics: (days: number) => ['reports', 'analytics', days] as const,
  villages: ['villages'] as const,
  village: (id: string) => ['villages', id] as const,
  customers: (p: unknown) => ['customers', 'list', p] as const,
  customer: (id: string) => ['customers', id] as const,
  nominees: (id: string) => ['customers', id, 'nominees'] as const,
  documents: (id: string) => ['customers', id, 'documents'] as const,
  bank: (id: string) => ['customers', id, 'bank'] as const,
  pigmy: (p: unknown) => ['pigmy', 'list', p] as const,
  pigmyOne: (id: string) => ['pigmy', id] as const,
  ledger: (id: string, p: unknown) => ['pigmy', id, 'ledger', p] as const,
  reconcile: (id: string) => ['pigmy', id, 'reconcile'] as const,
  transactions: (p: unknown) => ['transactions', 'list', p] as const,
  pending: (p: unknown) => ['transactions', 'pending', p] as const,
  audit: (p: unknown) => ['audit', p] as const,
  admins: (p: unknown) => ['admins', 'list', p] as const,
  admin: (id: string) => ['admins', id] as const,
  withdrawals: (p: unknown) => ['withdrawals', 'list', p] as const,
  withdrawal: (id: string) => ['withdrawals', id] as const,
  withdrawalsPending: ['withdrawals', 'pending-count'] as const,
  scheme: ['withdrawals', 'scheme'] as const,
};

// ── query param shapes ────────────────────────────────────────────────────────
export interface RangeParams {
  from?: string;
  to?: string;
  villageId?: string;
}
export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  villageId?: string;
  kycStatus?: string;
}
export interface PigmyListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}
export interface TxnListParams {
  page?: number;
  limit?: number;
  status?: string;
  villageId?: string;
  from?: string;
  to?: string;
}
export interface AuditListParams {
  page?: number;
  limit?: number;
  entity?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
}
export interface AdminListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
}
export interface WithdrawalListParams {
  page?: number;
  limit?: number;
  status?: string;
  kind?: string;
  villageId?: string;
  search?: string;
}

// ── reports ──────────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<DashboardSummary>('/reports/dashboard'),
  });
}

export function useDateWise(params: RangeParams) {
  return useQuery({
    queryKey: qk.dateWise(params),
    queryFn: () => api.get<DateWiseReport>('/reports/date-wise', params as never),
  });
}

export function useVillageWise(params: RangeParams) {
  return useQuery({
    queryKey: qk.villageWise(params),
    queryFn: () => api.get<VillageWiseRow[]>('/reports/village-wise', params as never),
  });
}

export function useAnalytics(days: number) {
  return useQuery({
    queryKey: qk.analytics(days),
    queryFn: () => api.get<DateWiseReport>('/reports/analytics', { days }),
  });
}

// ── villages ─────────────────────────────────────────────────────────────────
export function useVillages() {
  return useQuery({
    queryKey: qk.villages,
    queryFn: () => api.get<VillageListItem[]>('/villages'),
  });
}

export function useVillage(id: string) {
  return useQuery({
    queryKey: qk.village(id),
    queryFn: () => api.get<VillageDetail>(`/villages/${id}`),
    enabled: !!id,
  });
}

export function useCreateVillage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string }) => api.post('/villages', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.villages }),
  });
}

export function useUpdateVillage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; code?: string }) => api.patch(`/villages/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.villages });
      qc.invalidateQueries({ queryKey: qk.village(id) });
    },
  });
}

// ── customers ────────────────────────────────────────────────────────────────
export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: qk.customers(params),
    queryFn: () => api.get<Paginated<CustomerListItem>>('/customers', params as never),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: qk.customer(id),
    queryFn: () => api.get<Customer360>(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      mobile: string;
      villageId: string;
      address?: string;
      dailyAmountRupees?: number;
    }) => api.post('/customers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; address?: string; photoUrl?: string }) =>
      api.patch(`/customers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

export function useUpdateKyc(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => api.patch(`/customers/${id}/kyc`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customer(id) });
      qc.invalidateQueries({ queryKey: ['customers', 'list'] });
    },
  });
}

export function useAssignVillage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (villageId: string) => api.patch(`/customers/${id}/village`, { villageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

export function useAddNominee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; relation?: string; mobile?: string; address?: string }) =>
      api.post<Nominee>(`/customers/${id}/nominees`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

export function useDeleteNominee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nomineeId: string) => api.del(`/customers/${id}/nominees/${nomineeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

export function useAddDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { docType: string; fileUrl: string }) =>
      api.post<CustomerDocument>(`/customers/${id}/documents`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

export function useVerifyDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { docId: string; status: string }) =>
      api.patch(`/customers/${id}/documents/${args.docId}/verify`, { status: args.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

export function useUpsertBank(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { accountNumber: string; ifsc: string; accountHolderName: string }) =>
      api.put<BankDetails>(`/customers/${id}/bank-details`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer(id) }),
  });
}

// ── pigmy accounts ─────────────────────────────────────────────────────────────
export function usePigmyAccounts(params: PigmyListParams) {
  return useQuery({
    queryKey: qk.pigmy(params),
    queryFn: () => api.get<Paginated<PigmyOverviewRow>>('/pigmy-accounts', params as never),
    placeholderData: keepPreviousData,
  });
}

export function usePigmyAccount(id: string) {
  return useQuery({
    queryKey: qk.pigmyOne(id),
    queryFn: () => api.get<PigmyAccountDetail>(`/pigmy-accounts/${id}`),
    enabled: !!id,
  });
}

export function useLedger(id: string, params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: qk.ledger(id, params),
    queryFn: () => api.get<Paginated<LedgerEntry>>(`/pigmy-accounts/${id}/ledger`, params as never),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

export function useReconcile(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.reconcile(id),
    queryFn: () => api.get<Reconciliation>(`/pigmy-accounts/${id}/reconcile`),
    enabled: !!id && enabled,
  });
}

export function useCreatePigmyAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customerId: string; dailyAmountRupees?: number }) =>
      api.post('/pigmy-accounts', body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['pigmy'] });
      qc.invalidateQueries({ queryKey: qk.customer(v.customerId) });
    },
  });
}

export function useSetPigmyStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => api.patch(`/pigmy-accounts/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pigmy'] });
      qc.invalidateQueries({ queryKey: qk.pigmyOne(id) });
    },
  });
}

export function useSetDailyAmount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dailyAmountRupees: number) =>
      api.patch(`/pigmy-accounts/${id}/daily-amount`, { dailyAmountRupees }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pigmy'] });
      qc.invalidateQueries({ queryKey: qk.pigmyOne(id) });
    },
  });
}

// ── transactions ───────────────────────────────────────────────────────────────
export function useTransactions(params: TxnListParams) {
  return useQuery({
    queryKey: qk.transactions(params),
    queryFn: () => api.get<Paginated<AdminTransaction>>('/transactions', params as never),
    placeholderData: keepPreviousData,
  });
}

export function usePendingPayments(params: TxnListParams) {
  return useQuery({
    queryKey: qk.pending(params),
    queryFn: () => api.get<Paginated<AdminTransaction>>('/transactions/pending', params as never),
    placeholderData: keepPreviousData,
  });
}

/** Download a receipt PDF and trigger a browser save. */
export async function downloadReceipt(id: string) {
  const blob = await api.blob(`/transactions/${id}/receipt`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── audit logs ─────────────────────────────────────────────────────────────────
export function useAuditLogs(params: AuditListParams) {
  return useQuery({
    queryKey: qk.audit(params),
    queryFn: () => api.get<Paginated<AuditLog>>('/audit-logs', params as never),
    placeholderData: keepPreviousData,
  });
}

// ── notifications ──────────────────────────────────────────────────────────────
export function useBroadcast() {
  return useMutation({
    mutationFn: (body: { title: string; body: string; villageId?: string }) =>
      api.post('/admin/notifications/broadcast', body),
  });
}

// ── admins ─────────────────────────────────────────────────────────────────────
export function useAdmins(params: AdminListParams) {
  return useQuery({
    queryKey: qk.admins(params),
    queryFn: () => api.get<Paginated<AdminUser>>('/admins', params as never),
    placeholderData: keepPreviousData,
  });
}

export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      password: string;
      role: string;
      assignedVillages?: string[];
    }) => api.post('/admins', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] }),
  });
}

export function useUpdateAdmin(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      role?: string;
      assignedVillages?: string[];
      isActive?: boolean;
    }) => api.patch(`/admins/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] }),
  });
}

export function useResetAdminPassword(id: string) {
  return useMutation({
    mutationFn: (newPassword: string) => api.patch(`/admins/${id}/password`, { newPassword }),
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.patch('/admins/me/password', body),
  });
}

// ── withdrawals (maker-checker) ───────────────────────────────────────────────
export function useWithdrawals(params: WithdrawalListParams) {
  return useQuery({
    queryKey: qk.withdrawals(params),
    queryFn: () => api.get<Paginated<WithdrawalRow>>('/withdrawals', params as never),
    placeholderData: keepPreviousData,
  });
}

export function useWithdrawal(id: string) {
  return useQuery({
    queryKey: qk.withdrawal(id),
    queryFn: () => api.get<WithdrawalDetail>(`/withdrawals/${id}`),
    enabled: !!id,
  });
}

/** Drives the sidebar badge — polled so a new request shows up without a reload. */
export function useWithdrawalsPendingCount() {
  return useQuery({
    queryKey: qk.withdrawalsPending,
    queryFn: () => api.get<{ pending: number }>('/withdrawals/pending-count'),
    refetchInterval: 60_000,
  });
}

/**
 * Every decision invalidates the queue, the badge, and the affected account —
 * a payout changes the balance, so the pigmy views must not serve a stale one.
 */
function useWithdrawalDecision<TBody, TRes = WithdrawalRequest>(
  id: string,
  path: string,
  accountId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.post<TRes>(`/withdrawals/${id}/${path}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: qk.withdrawal(id) });
      qc.invalidateQueries({ queryKey: ['pigmy'] });
      if (accountId) qc.invalidateQueries({ queryKey: qk.pigmyOne(accountId) });
    },
  });
}

export function useApproveWithdrawal(id: string, accountId?: string) {
  return useWithdrawalDecision<{ note?: string }>(id, 'approve', accountId);
}

export function useRejectWithdrawal(id: string, accountId?: string) {
  return useWithdrawalDecision<{ reason: string }>(id, 'reject', accountId);
}

export function usePayWithdrawal(id: string, accountId?: string) {
  return useWithdrawalDecision<{ reference: string; payoutMethod?: string }, PaidWithdrawal>(
    id,
    'pay',
    accountId,
  );
}

// ── scheme settings ───────────────────────────────────────────────────────────
export function useScheme() {
  return useQuery({
    queryKey: qk.scheme,
    queryFn: () => api.get<Scheme>('/withdrawals/scheme'),
  });
}

export function useUpdateScheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      termDays?: number;
      interestRateBps?: number;
      earlyWithdrawalAllowed?: boolean;
      earlyPenaltyBps?: number;
      minBalancePaise?: number;
    }) => api.patch<Scheme>('/withdrawals/scheme', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scheme }),
  });
}
