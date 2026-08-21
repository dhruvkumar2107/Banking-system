import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { auditLogs } from '../../db/schema';
import type { ActorType } from './audit.types';

export interface AuditEntry {
  actorId?: string | null;
  actorType: ActorType;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export interface AuditFilter {
  entity?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

/**
 * Write-only audit trail. Every sensitive / balance-affecting action records a
 * row here. `record` can run inside an existing DB transaction (pass `tx`) so
 * the audit row commits atomically with the change it describes.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  async record(entry: AuditEntry, tx?: AppTransaction): Promise<void> {
    const runner = tx ?? this.db;
    try {
      await runner.insert(auditLogs).values({
        actorId: entry.actorId ?? null,
        actorType: entry.actorType,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
        ip: entry.ip ?? null,
      });
    } catch (err) {
      // Auditing must never break the primary flow, but we surface failures loudly.
      this.logger.error(`Failed to write audit log for ${entry.action}`, err as Error);
      if (!tx) return;
      throw err; // inside a tx, propagate so the whole change rolls back
    }
  }

  async list(filter: AuditFilter, page: number, limit: number) {
    const conds = [];
    if (filter.entity) conds.push(eq(auditLogs.entity, filter.entity));
    if (filter.entityId) conds.push(eq(auditLogs.entityId, filter.entityId));
    if (filter.actorId) conds.push(eq(auditLogs.actorId, filter.actorId));
    if (filter.action) conds.push(eq(auditLogs.action, filter.action));
    if (filter.from) conds.push(gte(auditLogs.createdAt, filter.from));
    if (filter.to) conds.push(lte(auditLogs.createdAt, filter.to));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(auditLogs).where(where),
    ]);
    return { rows, total };
  }
}
