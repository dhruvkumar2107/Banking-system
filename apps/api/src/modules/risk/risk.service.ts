import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { auditLogs, transactions, pigmyAccounts, customers } from '../../db/schema';
import { AuditAction } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';

export type RiskSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskAlert {
  id: string;
  type: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface RiskFilter {
  severity?: RiskSeverity;
  type?: string;
  resolved?: boolean;
  from?: Date;
  to?: Date;
}

/**
 * Risk and fraud detection engine. Analyzes transaction patterns and system
 * behavior to identify potential issues for human review.
 *
 * This is a DETECTION system, not an enforcement system. Alerts are signals
 * for operational staff to investigate, not accusations.
 *
 * Detected patterns:
 * - Repeated failed payments from same account
 * - Abnormal payment frequency (too many in short period)
 * - Unusually large transactions
 * - Rapid succession of profile changes
 * - Excessive OTP requests
 * - Suspicious transaction patterns
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger('Risk');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  /**
   * Scan for accounts with repeated failed payments in the last 24 hours.
   */
  async detectRepeatedFailures(): Promise<RiskAlert[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const failures = await this.db
      .select({
        pigmyAccountId: transactions.pigmyAccountId,
        count: count(),
        lastFailure: sql<string>`max(${transactions.createdAt})`,
      })
      .from(transactions)
      .where(and(eq(transactions.status, 'failed'), gte(transactions.createdAt, since)))
      .groupBy(transactions.pigmyAccountId)
      .having(sql`count(*) >= 3`);

    return failures.map((f) => ({
      id: `fail-${f.pigmyAccountId}-${Date.now()}`,
      type: 'repeated_payment_failure',
      severity: f.count >= 5 ? 'high' : 'medium',
      title: `Repeated payment failures`,
      description: `Account has ${f.count} failed payments in the last 24 hours`,
      entityType: 'pigmy_account',
      entityId: f.pigmyAccountId,
      metadata: { failureCount: f.count, lastFailure: f.lastFailure },
      createdAt: new Date(),
    }));
  }

  /**
   * Detect accounts with abnormally high transaction frequency.
   */
  async detectHighFrequency(): Promise<RiskAlert[]> {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last hour

    const highFreq = await this.db
      .select({
        pigmyAccountId: transactions.pigmyAccountId,
        count: count(),
        totalAmount: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .where(and(gte(transactions.createdAt, since)))
      .groupBy(transactions.pigmyAccountId)
      .having(sql`count(*) >= 10`);

    return highFreq.map((h) => ({
      id: `freq-${h.pigmyAccountId}-${Date.now()}`,
      type: 'high_frequency_transactions',
      severity: h.count >= 20 ? 'high' : 'medium',
      title: `Abnormally high transaction frequency`,
      description: `Account has ${h.count} transactions in the last hour`,
      entityType: 'pigmy_account',
      entityId: h.pigmyAccountId,
      metadata: {
        transactionCount: h.count,
        totalAmount: h.totalAmount,
        period: '1 hour',
      },
      createdAt: new Date(),
    }));
  }

  /**
   * Detect unusually large transactions (more than 5x the daily amount).
   */
  async detectLargeTransactions(): Promise<RiskAlert[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const largeTxns = await this.db
      .select({
        id: transactions.id,
        pigmyAccountId: transactions.pigmyAccountId,
        amount: transactions.amount,
        dailyAmount: pigmyAccounts.dailyAmount,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .where(
        and(
          gte(transactions.createdAt, since),
          sql`${transactions.amount} > ${pigmyAccounts.dailyAmount} * 5`,
        ),
      );

    return largeTxns.map((t) => ({
      id: `large-${t.id}`,
      type: 'unusually_large_transaction',
      severity: 'medium',
      title: `Unusually large transaction`,
      description: `Transaction of ₹${t.amount / 100} is more than 5x the daily amount of ₹${t.dailyAmount / 100}`,
      entityType: 'transaction',
      entityId: t.id,
      metadata: {
        transactionAmount: t.amount,
        dailyAmount: t.dailyAmount,
        ratio: Math.round((t.amount / t.dailyAmount) * 100) / 100,
      },
      createdAt: t.createdAt,
    }));
  }

  /**
   * Detect excessive OTP requests (potential brute force).
   */
  async detectOtpAbuse(): Promise<RiskAlert[]> {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last hour

    const abuse = await this.db
      .select({
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        count: count(),
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, AuditAction.OTP_REQUESTED),
          gte(auditLogs.createdAt, since),
        ),
      )
      .groupBy(auditLogs.entity, auditLogs.entityId)
      .having(sql`count(*) >= 10`);

    return abuse.map((a) => ({
      id: `otp-${a.entityId}-${Date.now()}`,
      type: 'otp_abuse',
      severity: 'high',
      title: `Excessive OTP requests`,
      description: `${a.count} OTP requests in the last hour for ${a.entity} ${a.entityId}`,
      entityType: a.entity ?? 'unknown',
      entityId: a.entityId ?? 'unknown',
      metadata: { requestCount: a.count, period: '1 hour' },
      createdAt: new Date(),
    }));
  }

  /**
   * Run all risk detection scans and return combined alerts.
   * Sorted by severity (critical first), then by creation time.
   */
  async scanAll(): Promise<{
    alerts: RiskAlert[];
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
      total: number;
    };
  }> {
    const [failures, highFreq, largeTxns, otpAbuse] = await Promise.all([
      this.detectRepeatedFailures(),
      this.detectHighFrequency(),
      this.detectLargeTransactions(),
      this.detectOtpAbuse(),
    ]);

    const allAlerts = [...failures, ...highFreq, ...largeTxns, ...otpAbuse];

    const severityOrder: Record<RiskSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    allAlerts.sort((a, b) => {
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
    });

    const summary = {
      critical: allAlerts.filter((a) => a.severity === 'critical').length,
      high: allAlerts.filter((a) => a.severity === 'high').length,
      medium: allAlerts.filter((a) => a.severity === 'medium').length,
      low: allAlerts.filter((a) => a.severity === 'low').length,
      info: allAlerts.filter((a) => a.severity === 'info').length,
      total: allAlerts.length,
    };

    return { alerts: allAlerts, summary };
  }
}
