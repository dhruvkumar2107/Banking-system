'use client';

/**
 * Fetchers + TanStack Query hooks for the loan book and the KYC review queue.
 *
 * Kept separate from `src/lib/hooks.ts` (which owns savings, withdrawals and
 * customers) but written to the same conventions: one `lqk` key factory, list
 * queries use `keepPreviousData` so paging does not flash, and every mutation
 * invalidates the queue, the single record and anything whose balance moved.
 */

import { useEffect, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api';
import { qk } from './hooks';
import type { Paginated } from './types';
import type {
  ApproveLoanBody,
  BypassKycBody,
  DefaultLoanBody,
  DisburseLoanBody,
  KycDocument,
  KycDocumentWire,
  KycListParams,
  KycQueueRow,
  KycRowWire,
  KycStage,
  KycSubmission,
  KycSubmissionWire,
  LoanDetail,
  LoanListParams,
  LoanRow,
  LoanSettings,
  RecordRepaymentBody,
  RejectKycBody,
  RejectLoanBody,
  UpdateLoanSettingsBody,
  VillageRef,
  WaiveInstalmentBody,
} from './loan-types';

// ── query keys ───────────────────────────────────────────────────────────────
export const lqk = {
  loans: (p: unknown) => ['loans', 'list', p] as const,
  loan: (id: string) => ['loans', id] as const,
  loansPending: ['loans', 'pending-count'] as const,
  loanSettings: ['loans', 'settings'] as const,
  kyc: (p: unknown) => ['kyc', 'list', p] as const,
  kycOne: (customerId: string) => ['kyc', customerId] as const,
  kycPending: ['kyc', 'pending-count'] as const,
  file: (url: string) => ['uploads', url] as const,
};

// ── shared helpers ───────────────────────────────────────────────────────────

/**
 * Render a village whichever way the API sent it — a plain name on the queue
 * routes, a `{ id, name }` object on the detail routes.
 */
export function villageLabel(v: VillageRef | undefined): string {
  if (!v) return '—';
  if (typeof v === 'string') return v;
  return v.name ?? '—';
}

// ── loans: reads ─────────────────────────────────────────────────────────────

export function useLoans(params: LoanListParams) {
  return useQuery({
    queryKey: lqk.loans(params),
    // NOTE: `overdueOnly` must be `true` or absent. The API parses it with
    // `Boolean(value)`, and `Boolean('false')` is `true` — sending the string
    // "false" would silently turn the filter on.
    queryFn: () => api.get<Paginated<LoanRow>>('/loans', params as never),
    placeholderData: keepPreviousData,
  });
}

export function useLoan(id: string) {
  return useQuery({
    queryKey: lqk.loan(id),
    queryFn: () => api.get<LoanDetail>(`/loans/${id}`),
    enabled: !!id,
  });
}

/** Drives the queue headline and the sidebar badge — polled, like withdrawals. */
export function useLoansPendingCount() {
  return useQuery({
    queryKey: lqk.loansPending,
    queryFn: () => api.get<{ pending: number }>('/loans/pending-count'),
    refetchInterval: 60_000,
  });
}

export function useLoanSettings() {
  return useQuery({
    queryKey: lqk.loanSettings,
    queryFn: () => api.get<LoanSettings>('/loans/settings'),
  });
}

/** Superadmin only — the API rejects anyone else. */
export function useUpdateLoanSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateLoanSettingsBody) => api.patch<LoanSettings>('/loans/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: lqk.loanSettings }),
  });
}

// ── loans: decisions ─────────────────────────────────────────────────────────

/**
 * Every loan decision invalidates the queue, the badge and this loan. Anything
 * that can move the savings balance also invalidates the pigmy views: a
 * `from_savings` repayment posts a DEBIT to the customer's ledger, so a stale
 * balance there would contradict the loan.
 */
function useLoanDecision<TBody, TRes = LoanDetail>(
  id: string,
  path: string,
  accountId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.post<TRes>(`/loans/${id}/${path}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: lqk.loan(id) });
      qc.invalidateQueries({ queryKey: ['pigmy'] });
      if (accountId) qc.invalidateQueries({ queryKey: qk.pigmyOne(accountId) });
    },
  });
}

export function useApproveLoan(id: string, accountId?: string) {
  return useLoanDecision<ApproveLoanBody>(id, 'approve', accountId);
}

export function useRejectLoan(id: string, accountId?: string) {
  return useLoanDecision<RejectLoanBody>(id, 'reject', accountId);
}

export function useDisburseLoan(id: string, accountId?: string) {
  return useLoanDecision<DisburseLoanBody>(id, 'disburse', accountId);
}

export function useRecordRepayment(id: string, accountId?: string) {
  return useLoanDecision<RecordRepaymentBody>(id, 'repayments', accountId);
}

export function useDefaultLoan(id: string, accountId?: string) {
  return useLoanDecision<DefaultLoanBody>(id, 'default', accountId);
}

/** Forgive one instalment. Same invalidation set — the outstanding total moves. */
export function useWaiveInstalment(id: string, instalmentId: string, accountId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WaiveInstalmentBody) =>
      api.post<LoanDetail>(`/loans/${id}/instalments/${instalmentId}/waive`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: lqk.loan(id) });
      qc.invalidateQueries({ queryKey: ['pigmy'] });
      if (accountId) qc.invalidateQueries({ queryKey: qk.pigmyOne(accountId) });
    },
  });
}

// ── KYC: normalisers ─────────────────────────────────────────────────────────

/** Flatten either field spelling into the one shape the pages consume. */
export function normalizeKycRow(w: KycRowWire): KycQueueRow {
  return {
    customerId: w.customerId ?? w.id ?? '',
    name: w.name ?? '—',
    mobile: w.mobile ?? '—',
    village: villageLabel(w.village),
    kycStage: (w.kycStage ?? w.stage ?? 'not_started') as KycStage,
    kycSubmittedAt: w.kycSubmittedAt ?? w.submittedAt ?? null,
    kycVerifiedAt: w.kycVerifiedAt ?? w.verifiedAt ?? null,
    aadhaarMasked: w.aadhaarMasked ?? null,
    photoUrl: w.photoUrl ?? null,
    nomineeCount: w.nomineeCount ?? null,
  };
}

function normalizeDocument(d: KycDocumentWire): KycDocument {
  return {
    id: d.id,
    kind: d.kind ?? d.docType ?? 'document',
    fileUrl: d.fileUrl,
    status: d.status ?? d.verifiedStatus ?? 'pending',
    uploadedAt: d.uploadedAt,
  };
}

export function normalizeKycSubmission(w: KycSubmissionWire): KycSubmission {
  const row = normalizeKycRow(w);
  const nominees = w.nominees ?? [];
  return {
    ...row,
    customerId: w.customerId ?? w.customer?.id ?? w.id ?? '',
    name: w.name ?? w.customer?.name ?? '—',
    mobile: w.mobile ?? w.customer?.mobile ?? '—',
    kycRejectionReason: w.kycRejectionReason ?? w.rejectionReason ?? null,
    photoIsLive: w.photoIsLive === true,
    address: w.address ?? w.customer?.address ?? null,
    nomineeCount: w.nomineeCount ?? nominees.length,
    nominees,
    documents: (w.documents ?? []).map(normalizeDocument),
    bypassedAt: w.bypassedAt ?? null,
    bypassReason: w.bypassReason ?? null,
    verifiedBy: w.verifiedBy ?? null,
    bypassedBy: w.bypassedBy ?? null,
  };
}

// ── KYC: reads ───────────────────────────────────────────────────────────────

export function useKycQueue(params: KycListParams) {
  return useQuery({
    queryKey: lqk.kyc(params),
    queryFn: async () => {
      const res = await api.get<Paginated<KycRowWire>>('/kyc', params as never);
      return { ...res, data: (res.data ?? []).map(normalizeKycRow) };
    },
    placeholderData: keepPreviousData,
  });
}

export function useKycSubmission(customerId: string) {
  return useQuery({
    queryKey: lqk.kycOne(customerId),
    queryFn: async () =>
      normalizeKycSubmission(await api.get<KycSubmissionWire>(`/kyc/${customerId}`)),
    enabled: !!customerId,
  });
}

export function useKycPendingCount() {
  return useQuery({
    queryKey: lqk.kycPending,
    queryFn: () => api.get<{ pending: number }>('/kyc/pending-count'),
    refetchInterval: 60_000,
  });
}

// ── KYC: decisions (admin + superadmin only) ─────────────────────────────────

/**
 * A KYC decision changes the gate that governs deposits, loans and withdrawals,
 * so it invalidates the queue, this submission and the customer views that
 * display the stage.
 */
function useKycDecision<TBody>(customerId: string, path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: TBody) => api.post<KycSubmissionWire>(`/kyc/${customerId}/${path}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc'] });
      qc.invalidateQueries({ queryKey: lqk.kycOne(customerId) });
      qc.invalidateQueries({ queryKey: qk.customer(customerId) });
      qc.invalidateQueries({ queryKey: ['customers', 'list'] });
    },
  });
}

export function useVerifyKyc(customerId: string) {
  return useKycDecision<void>(customerId, 'verify');
}

export function useRejectKyc(customerId: string) {
  return useKycDecision<RejectKycBody>(customerId, 'reject');
}

export function useBypassKyc(customerId: string) {
  return useKycDecision<BypassKycBody>(customerId, 'bypass');
}

// ── authenticated files (KYC photos + documents) ─────────────────────────────

/**
 * KYC scans are PII, so the API serves them from `GET /api/uploads/:customerId/:file`
 * behind the same bearer token as everything else — never as a static path. A
 * plain `<img src>` therefore 401s. `api.blob()` already handles the token and
 * the refresh dance, so we fetch the bytes and hand the page an object URL.
 */
export function isAuthedUpload(url?: string | null): boolean {
  if (!url) return false;
  return !/^(https?:|data:|blob:)/i.test(url);
}

/**
 * Rewrite a stored file url into a path the api client can fetch. The API stores
 * `/api/uploads/…` while the client's base URL already ends in `/api`, so the
 * duplicated prefix has to come off.
 */
export function toUploadPath(url: string): string {
  return url.replace(/^\/?api\//, '/');
}

interface AuthedFile {
  /** Object URL safe to use as an `<img src>` / link href, once loaded. */
  src: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Fetch one authenticated file and expose it as an object URL. Absolute
 * http(s) urls (legacy records typed in by hand) are passed straight through.
 */
export function useAuthedFile(url?: string | null): AuthedFile {
  const needsAuth = isAuthedUpload(url);

  const q = useQuery({
    queryKey: lqk.file(url ?? ''),
    queryFn: () => api.blob(toUploadPath(url as string)),
    enabled: !!url && needsAuth,
    staleTime: 5 * 60_000,
  });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) {
      setObjectUrl(null);
      return;
    }
    const next = URL.createObjectURL(q.data);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [q.data]);

  if (!url) return { src: null, isLoading: false, isError: false, error: null };
  if (!needsAuth) return { src: url, isLoading: false, isError: false, error: null };

  return {
    src: objectUrl,
    // Bytes are in but the object URL is created in an effect one tick later —
    // keep reporting "loading" so the caller never renders an empty frame.
    isLoading: q.isLoading || (!!q.data && !objectUrl),
    isError: q.isError,
    error: (q.error as Error) ?? null,
  };
}

/** Open an authenticated file in a new tab (works for images and PDFs alike). */
export async function openAuthedFile(url: string): Promise<void> {
  if (!isAuthedUpload(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const blob = await api.blob(toUploadPath(url));
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  // The new tab holds its own reference to the blob; release ours once it has
  // had a chance to load.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
