'use client';

import { useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, Search } from 'lucide-react';
import { useReconciliationSummary, useReconciliationScan } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  LoadingBlock,
  ErrorState,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableWrap,
} from '@/components/ui';

export default function ReconciliationPage() {
  const t = useT();
  const [scanResult, setScanResult] = useState<{ matched: number; mismatched: number; missing: number } | null>(null);
  const [scanning, setScanning] = useState(false);

  const summary = useReconciliationSummary();
  const reconciliationScan = useReconciliationScan();

  async function handleScan() {
    setScanning(true);
    try {
      const result = await reconciliationScan.mutateAsync();
      setScanResult(result);
    } catch {
      // Error handled by mutation
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation"
        subtitle="Monitor payment vs ledger discrepancies and financial integrity"
        action={
          <Button onClick={handleScan} disabled={scanning} icon={<RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />}>
            {scanning ? 'Scanning...' : 'Run Reconciliation Scan'}
          </Button>
        }
      />

      {/* Summary Cards */}
      {summary.isLoading ? (
        <LoadingBlock />
      ) : summary.isError ? (
        <ErrorState message={(summary.error as Error)?.message} />
      ) : summary.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Matched Entries"
            value={summary.data.matchedEntries}
            icon={<CheckCircle size={20} />}
            tone="green"
          />
          <SummaryCard
            title="Missing Entries"
            value={summary.data.missingEntries}
            icon={<AlertTriangle size={20} />}
            tone="red"
          />
          <SummaryCard
            title="Stale Pending"
            value={summary.data.stalePending}
            icon={<Clock size={20} />}
            tone="yellow"
          />
          <SummaryCard
            title="Last Reconciled"
            value={summary.data.lastReconciled ? new Date(summary.data.lastReconciled).toLocaleDateString() : 'Never'}
            icon={<Search size={20} />}
            tone="slate"
          />
        </div>
      ) : null}

      {/* Scan Results */}
      {scanResult && (
        <Card>
          <CardBody>
            <h3 className="mb-4 text-lg font-medium text-ink">Latest Scan Results</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-green-line bg-green-soft p-4">
                <p className="text-sm text-green-600">Matched</p>
                <p className="text-2xl font-bold text-green-700">{scanResult.matched}</p>
              </div>
              <div className="rounded-lg border border-red-line bg-red-soft p-4">
                <p className="text-sm text-red-600">Mismatched</p>
                <p className="text-2xl font-bold text-red-700">{scanResult.mismatched}</p>
              </div>
              <div className="rounded-lg border border-yellow-line bg-yellow-soft p-4">
                <p className="text-sm text-yellow-600">Missing</p>
                <p className="text-2xl font-bold text-yellow-700">{scanResult.missing}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Stale Pending Transactions */}
      <Card>
        <CardBody>
          <h3 className="mb-4 text-lg font-medium text-ink">Stale Pending Transactions</h3>
          <p className="mb-4 text-sm text-ink-muted">
            Payments older than 24 hours that are still in pending status — may indicate lost webhooks.
          </p>
          <EmptyState message="Run a scan to detect stale pending transactions." />
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon, tone }: { title: string; value: number | string; icon: React.ReactNode; tone: string }) {
  const toneStyles: Record<string, string> = {
    green: 'text-green-600 bg-green-soft border-green-line',
    red: 'text-red-600 bg-red-soft border-red-line',
    yellow: 'text-yellow-600 bg-yellow-soft border-yellow-line',
    slate: 'text-slate-600 bg-slate-100 border-slate-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${toneStyles[tone] || toneStyles.slate}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-ink-line bg-surface-2 p-8 text-center">
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}
