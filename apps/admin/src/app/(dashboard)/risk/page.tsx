'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, Clock, Hash } from 'lucide-react';
import { useRiskAlerts } from '@/lib/hooks';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  CardBody,
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
  EmptyState,
} from '@/components/ui';

export default function RiskPage() {
  const [page, setPage] = useState(1);

  const alerts = useRiskAlerts({ page, limit: 20 });

  function severityTone(severity: string) {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'amber';
      case 'medium': return 'amber';
      case 'low': return 'blue';
      default: return 'slate';
    }
  }

  function typeIcon(type: string) {
    switch (type) {
      case 'repeated_failures': return <Hash size={16} />;
      case 'high_frequency': return <Clock size={16} />;
      case 'large_transaction': return <AlertTriangle size={16} />;
      case 'otp_abuse': return <Shield size={16} />;
      default: return <AlertTriangle size={16} />;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Alerts"
        subtitle="Fraud detection and operational alerts"
      />

      {/* Summary Cards */}
      {alerts.isLoading ? (
        <LoadingBlock />
      ) : alerts.isError ? (
        <ErrorState message={(alerts.error as Error)?.message} />
      ) : alerts.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Critical"
            value={alerts.data.alerts.filter(a => a.severity === 'critical').length}
            icon={<AlertTriangle size={20} />}
            tone="red"
          />
          <SummaryCard
            title="High"
            value={alerts.data.alerts.filter(a => a.severity === 'high').length}
            icon={<AlertTriangle size={20} />}
            tone="orange"
          />
          <SummaryCard
            title="Medium"
            value={alerts.data.alerts.filter(a => a.severity === 'medium').length}
            icon={<AlertTriangle size={20} />}
            tone="yellow"
          />
          <SummaryCard
            title="Low"
            value={alerts.data.alerts.filter(a => a.severity === 'low').length}
            icon={<AlertTriangle size={20} />}
            tone="blue"
          />
        </div>
      ) : null}

      {/* Alerts Table */}
      <Card>
        <CardBody>
          {alerts.isLoading ? (
            <LoadingBlock />
          ) : alerts.isError ? (
            <ErrorState message={(alerts.error as Error)?.message} />
          ) : alerts.data && alerts.data.alerts.length ? (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Time</Th>
                      <Th>Type</Th>
                      <Th>Severity</Th>
                      <Th>Customer</Th>
                      <Th>Details</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {alerts.data.alerts.map((alert) => (
                      <Tr key={alert.id}>
                        <Td className="whitespace-nowrap text-xs">
                          {formatDateTime(alert.createdAt)}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            {typeIcon(alert.type)}
                            <span className="text-sm">{alert.type.replace(/_/g, ' ')}</span>
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={severityTone(alert.severity)}>
                            {alert.severity}
                          </Badge>
                        </Td>
                        <Td className="text-sm">{alert.entityId?.slice(0, 8) || '—'}</Td>
                        <Td className="max-w-xs truncate text-xs text-ink-muted">
                           {JSON.stringify(alert.metadata)}
                        </Td>
                        <Td>
                          <Badge tone="slate">
                            {alert.type}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </>
          ) : (
            <EmptyState
              message="No suspicious activity detected"
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone: string }) {
  const toneStyles: Record<string, string> = {
    red: 'text-red-600 bg-red-soft border-red-line',
    orange: 'text-orange-600 bg-orange-50 border-orange-200',
    yellow: 'text-yellow-600 bg-yellow-soft border-yellow-line',
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
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
