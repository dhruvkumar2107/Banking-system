'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, Clock, User, Hash } from 'lucide-react';
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
  Pagination,
  Button,
  EmptyState,
} from '@/components/ui';

export default function RiskPage() {
  const t = useT();
  const [page, setPage] = useState(1);

  const alerts = useRiskAlerts({ page, limit: 20 });

  function severityTone(severity: string) {
    switch (severity) {
      case 'critical': return 'red' as const;
      case 'high': return 'orange' as const;
      case 'medium': return 'yellow' as const;
      case 'low': return 'blue' as const;
      default: return 'slate' as const;
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
            value={alerts.data.data.filter(a => a.severity === 'critical').length}
            icon={<AlertTriangle size={20} />}
            tone="red"
          />
          <SummaryCard
            title="High"
            value={alerts.data.data.filter(a => a.severity === 'high').length}
            icon={<AlertTriangle size={20} />}
            tone="orange"
          />
          <SummaryCard
            title="Medium"
            value={alerts.data.data.filter(a => a.severity === 'medium').length}
            icon={<AlertTriangle size={20} />}
            tone="yellow"
          />
          <SummaryCard
            title="Low"
            value={alerts.data.data.filter(a => a.severity === 'low').length}
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
          ) : alerts.data && alerts.data.data.length ? (
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
                    {alerts.data.data.map((alert) => (
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
                        <Td className="text-sm">{alert.customerId?.slice(0, 8) || '—'}</Td>
                        <Td className="max-w-xs truncate text-xs text-ink-muted">
                          {JSON.stringify(alert.details)}
                        </Td>
                        <Td>
                          <Badge tone={alert.resolved ? 'green' : 'yellow'}>
                            {alert.resolved ? 'Resolved' : 'Active'}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
              <Pagination
                page={alerts.data.page}
                pages={alerts.data.pages}
                total={alerts.data.total}
                limit={alerts.data.limit}
                onPage={setPage}
              />
            </>
          ) : (
            <EmptyState
              title="No risk alerts"
              description="No suspicious activity detected"
              icon={<Shield size={22} />}
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
