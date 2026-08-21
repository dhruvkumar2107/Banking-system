import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { customers, notifications } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { villageScopeFilter, assertVillageAccess } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import type { BroadcastDto } from './notifications.dto';

export type NotificationCategory = 'system' | 'transaction' | 'broadcast';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  /** Create a notification for one customer. Tx-aware so it can ride along a payment. */
  async notifyCustomer(
    customerId: string,
    input: { title: string; body: string; category?: NotificationCategory },
    tx?: AppTransaction,
  ) {
    const runner = tx ?? this.db;
    const [row] = await runner
      .insert(notifications)
      .values({
        customerId,
        title: input.title,
        body: input.body,
        category: input.category ?? 'system',
      })
      .returning();
    return row;
  }

  async listForCustomer(customerId: string, page: number, limit: number, unreadOnly?: boolean) {
    const conds = [eq(notifications.customerId, customerId)];
    if (unreadOnly) conds.push(isNull(notifications.readAt));
    const where = and(...conds);

    const [rows, [{ value: total }], [{ value: unread }]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(notifications).where(where),
      this.db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.customerId, customerId), isNull(notifications.readAt))),
    ]);
    return { rows, total, unread };
  }

  async unreadCount(customerId: string) {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.customerId, customerId), isNull(notifications.readAt)));
    return { unread: value };
  }

  async markRead(customerId: string, notificationId: string) {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.customerId, customerId)))
      .limit(1);
    if (!row) throw new NotFoundException('Notification not found');
    if (!row.readAt) {
      await this.db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, notificationId));
    }
    return { success: true };
  }

  async markAllRead(customerId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.customerId, customerId), isNull(notifications.readAt)));
    return { success: true };
  }

  /**
   * Broadcast a notification to every customer the admin can see (optionally
   * limited to one village). One row per customer so each can mark it read.
   */
  async broadcast(dto: BroadcastDto, actor: AdminPrincipal, ip?: string) {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (dto.villageId) {
      assertVillageAccess(actor, dto.villageId);
      conds.push(eq(customers.villageId, dto.villageId));
    }
    const targets = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(...conds.filter(Boolean)));

    if (targets.length > 0) {
      await this.db.insert(notifications).values(
        targets.map((t) => ({
          customerId: t.id,
          title: dto.title,
          body: dto.body,
          category: 'broadcast' as const,
          createdByAdminId: actor.sub,
        })),
      );
    }

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.BROADCAST_SENT,
      entity: 'notification',
      after: { title: dto.title, recipients: targets.length, villageId: dto.villageId ?? null },
      ip,
    });
    return { sent: targets.length };
  }
}
