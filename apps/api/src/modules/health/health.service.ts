import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { transactions, customers, pigmyAccounts, auditLogs } from '../../db/schema';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message: string;
  latencyMs: number;
  lastChecked: Date;
}

export interface SystemHealth {
  overall: HealthStatus;
  components: ComponentHealth[];
  uptime: number;
  version: string;
  environment: string;
  timestamp: Date;
}

/**
 * System health center. Provides operational visibility into the platform's
 * health status. This is a READ-ONLY module that queries the database
 * and system state without modifying anything.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger('Health');
  private readonly startTime = Date.now();

  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  /**
   * Check database connectivity and performance.
   */
  async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      const latencyMs = Date.now() - start;
      return {
        name: 'database',
        status: latencyMs < 1000 ? 'healthy' : 'degraded',
        message: latencyMs < 1000
          ? 'Database responding normally'
          : `Database responding slowly (${latencyMs}ms)`,
        latencyMs,
        lastChecked: new Date(),
      };
    } catch (err) {
      return {
        name: 'database',
        status: 'down',
        message: `Database connection failed: ${(err as Error).message}`,
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check recent transaction activity for signs of system issues.
   */
  async checkTransactionHealth(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const last5Min = new Date(Date.now() - 5 * 60 * 1000);
      const [[{ value: recentSuccess }], [{ value: recentFailed }]] = await Promise.all([
        this.db.execute(sql`
          SELECT count(*) as value FROM transactions
          WHERE status = 'success' AND created_at > ${last5Min}
        `),
        this.db.execute(sql`
          SELECT count(*) as value FROM transactions
          WHERE status = 'failed' AND created_at > ${last5Min}
        `),
      ]);

      const successCount = Number(recentSuccess);
      const failCount = Number(recentFailed);
      const failRate = successCount + failCount > 0
        ? failCount / (successCount + failCount)
        : 0;

      const status: HealthStatus = failRate > 0.5 ? 'degraded' : 'healthy';
      const latencyMs = Date.now() - start;

      return {
        name: 'transactions',
        status,
        message: failRate > 0.5
          ? `High failure rate: ${(failRate * 100).toFixed(1)}% in last 5 minutes`
          : `${successCount} successful, ${failCount} failed in last 5 minutes`,
        latencyMs,
        lastChecked: new Date(),
      };
    } catch (err) {
      return {
        name: 'transactions',
        status: 'unknown',
        message: `Could not check transaction health: ${(err as Error).message}`,
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Get system statistics for the admin dashboard.
   */
  async systemStats(): Promise<{
    totalCustomers: number;
    totalAccounts: number;
    totalTransactions: number;
    activeAccounts: number;
    pendingTransactions: number;
    failedTransactions24h: number;
    auditEvents24h: number;
    uptime: number;
  }> {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      [customersRow],
      [accountsRow],
      [txnsRow],
      [activeRow],
      [pendingRow],
      [failed24hRow],
      [auditRow],
    ] = await Promise.all([
      this.db.execute(sql`SELECT count(*) as value FROM customers`),
      this.db.execute(sql`SELECT count(*) as value FROM pigmy_accounts`),
      this.db.execute(sql`SELECT count(*) as value FROM transactions`),
      this.db.execute(sql`SELECT count(*) as value FROM pigmy_accounts WHERE status = 'active'`),
      this.db.execute(sql`SELECT count(*) as value FROM transactions WHERE status = 'pending'`),
      this.db.execute(sql`SELECT count(*) as value FROM transactions WHERE status = 'failed' AND created_at > ${last24h}`),
      this.db.execute(sql`SELECT count(*) as value FROM audit_logs WHERE created_at > ${last24h}`),
    ]);

    return {
      totalCustomers: Number((customersRow as any).value),
      totalAccounts: Number((accountsRow as any).value),
      totalTransactions: Number((txnsRow as any).value),
      activeAccounts: Number((activeRow as any).value),
      pendingTransactions: Number((pendingRow as any).value),
      failedTransactions24h: Number((failed24hRow as any).value),
      auditEvents24h: Number((auditRow as any).value),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Full system health check.
   */
  async check(): Promise<SystemHealth> {
    const [dbHealth, txnHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkTransactionHealth(),
    ]);

    const components = [dbHealth, txnHealth];
    const statuses = components.map((c) => c.status);
    const overall: HealthStatus =
      statuses.includes('down') ? 'down' :
      statuses.includes('degraded') ? 'degraded' :
      statuses.every((s) => s === 'healthy') ? 'healthy' : 'unknown';

    return {
      overall,
      components,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date(),
    };
  }
}
