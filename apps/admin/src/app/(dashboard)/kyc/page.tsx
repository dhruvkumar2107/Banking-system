'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, IdCard, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useVillages } from '@/lib/hooks';
import { useKycPendingCount, useKycQueue } from '@/lib/loans-api';
import { KYC_STAGES, type KycStage } from '@/lib/loan-types';
import { useDebounce } from '@/lib/useDebounce';
import { relativeTime } from '@/lib/format';
import { useT, type TranslationKey } from '@/lib/i18n';
import { KycStageBadge } from '@/components/LoanBadges';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  StatCard,
  Button,
  Badge,
  Field,
  Input,
  Select,
  Pagination,
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
} from '@/components/ui';

/**
 * Stage labels for the filter. Two stages read longer than their status pill,
 * and `not_started` is hand-cased, so map rather than compose.
 */
const STAGE_KEY: Record<KycStage, TranslationKey> = {
  submitted: 'kyc.stageSubmittedLong',
  verified: 'status.verified',
  rejected: 'status.rejected',
  bypassed: 'kyc.stageBypassedLong',
  not_started: 'status.notStarted',
};

export default function KycPage() {
  const t = useT();
  // Default to the work that needs a human: submissions awaiting review.
  const [stage, setStage] = useState<string>('submitted');
  const [villageId, setVillageId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const limit = 20;

  const villages = useVillages();
  const list = useKycQueue({
    page,
    limit,
    stage,
    villageId: villageId || undefined,
    search: debounced || undefined,
  });

  // Head-line counters. `limit: 1` — we only read `.total`.
  const pending = useKycPendingCount();
  const verified = useKycQueue({ stage: 'verified', page: 1, limit: 1 });
  const bypassed = useKycQueue({ stage: 'bypassed', page: 1, limit: 1 });

  const rows = list.data?.data ?? [];

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('kyc.queueTitle')} subtitle={t('kyc.queueSubtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('kyc.statAwaitingReview')}
          value={pending.data?.pending ?? '—'}
          icon={<ShieldAlert size={20} />}
          tone="amber"
          hint={t('kyc.hintAwaitingReview')}
        />
        <StatCard
          label={t('status.verified')}
          value={verified.data?.total ?? '—'}
          icon={<ShieldCheck size={20} />}
          tone="green"
          hint={t('kyc.hintVerified')}
        />
        <StatCard
          label={t('status.bypassed')}
          value={bypassed.data?.total ?? '—'}
          icon={<BadgeCheck size={20} />}
          tone="indigo"
          hint={t('kyc.hintBypassed')}
        />
      </div>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <IdCard size={16} className="text-brand-600 dark:text-brand-300" />{' '}
              {t('kyc.submissions')}
            </span>
          }
          subtitle={t('kyc.submissionsSubtitle')}
          action={
            list.data ? (
              <Badge tone="slate">{t('withdrawals.totalCount', { count: list.data.total })}</Badge>
            ) : null
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('kyc.stage')} className="w-52">
              <Select value={stage} onChange={(e) => reset(() => setStage(e.target.value))}>
                {/* No "all" option: the API always filters by exactly one stage
                    and falls back to `submitted`, so offering one would lie. */}
                {KYC_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(STAGE_KEY[s])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.village')} className="w-52">
              <Select value={villageId} onChange={(e) => reset(() => setVillageId(e.target.value))}>
                <option value="">{t('common.allVillages')}</option>
                {villages.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.search')} className="min-w-[16rem] flex-1">
              <Input
                value={search}
                onChange={(e) => reset(() => setSearch(e.target.value))}
                placeholder={t('kyc.searchPlaceholder')}
              />
            </Field>
          </div>

          {list.isLoading ? (
            <LoadingBlock />
          ) : list.isError ? (
            <ErrorState message={(list.error as Error)?.message} />
          ) : rows.length ? (
            <TableWrap>
              <Table className="min-w-[900px]">
                <Thead>
                  <tr>
                    <Th>{t('common.customer')}</Th>
                    <Th>{t('common.mobile')}</Th>
                    <Th>{t('common.village')}</Th>
                    <Th>{t('kyc.stage')}</Th>
                    <Th>{t('kyc.submittedAt')}</Th>
                    <Th className="text-right">{t('kyc.nominees')}</Th>
                    <Th>{t('kyc.aadhaar')}</Th>
                    <Th className="text-right">{t('withdrawals.colReview')}</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {rows.map((k) => (
                    <Tr key={k.customerId}>
                      <Td>
                        <Link
                          href={`/kyc/${k.customerId}`}
                          className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                        >
                          {k.name}
                        </Link>
                      </Td>
                      <Td className="font-mono text-xs text-ink-soft">{k.mobile}</Td>
                      <Td className="text-sm text-ink-soft">{k.village}</Td>
                      <Td>
                        <KycStageBadge stage={k.kycStage} compact />
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-muted">
                        {k.kycSubmittedAt ? relativeTime(k.kycSubmittedAt) : t('kyc.notSubmitted')}
                      </Td>
                      <Td className="text-right text-sm text-ink-soft">
                        {k.nomineeCount === null ? (
                          '—'
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Users size={13} className="text-ink-faint" />
                            {k.nomineeCount}
                          </span>
                        )}
                      </Td>
                      {/* The API only ever returns the masked form. */}
                      <Td className="font-mono text-xs text-ink-muted">{k.aadhaarMasked ?? '—'}</Td>
                      <Td className="text-right">
                        <Link href={`/kyc/${k.customerId}`}>
                          <Button size="sm" variant="ghost">
                            {t('common.open')} <ArrowRight size={14} />
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState
              title={stage === 'submitted' ? t('kyc.emptyPending') : t('kyc.emptyFiltered')}
              message={stage === 'submitted' ? t('kyc.emptyPendingMessage') : undefined}
              icon={<IdCard size={22} />}
            />
          )}

          {list.data && rows.length > 0 && (
            <Pagination
              page={list.data.page}
              pages={list.data.pages}
              total={list.data.total}
              limit={list.data.limit}
              onPage={setPage}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
