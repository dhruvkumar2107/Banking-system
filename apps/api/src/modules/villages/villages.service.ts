import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, count, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { customers, pigmyAccounts, villages } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { CreateVillageDto, UpdateVillageDto } from './villages.dto';

@Injectable()
export class VillagesService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVillageDto, actor: AdminPrincipal, ip?: string) {
    const existing = await this.db
      .select({ id: villages.id })
      .from(villages)
      .where(eq(villages.code, dto.code))
      .limit(1);
    if (existing.length) throw new ConflictException(`Village code ${dto.code} already exists`);

    const [row] = await this.db.insert(villages).values(dto).returning();
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.VILLAGE_CREATED,
      entity: 'village',
      entityId: row.id,
      after: row,
      ip,
    });
    return row;
  }

  /** List villages visible to the admin, with customer counts. */
  async findAll(actor: AdminPrincipal) {
    const scope = villageScopeFilter(actor, villages.id);
    return this.db
      .select({
        id: villages.id,
        name: villages.name,
        code: villages.code,
        createdAt: villages.createdAt,
        customerCount: count(customers.id),
      })
      .from(villages)
      .leftJoin(customers, eq(customers.villageId, villages.id))
      .where(scope)
      .groupBy(villages.id)
      .orderBy(asc(villages.name));
  }

  async findOne(id: string, actor: AdminPrincipal) {
    assertVillageAccess(actor, id);
    const [row] = await this.db.select().from(villages).where(eq(villages.id, id)).limit(1);
    if (!row) throw new NotFoundException('Village not found');

    const [stats] = await this.db
      .select({
        customerCount: count(customers.id),
        totalBalance: sql<number>`coalesce(sum(${pigmyAccounts.currentBalance}), 0)`,
      })
      .from(customers)
      .leftJoin(pigmyAccounts, eq(pigmyAccounts.customerId, customers.id))
      .where(eq(customers.villageId, id));

    return { ...row, stats };
  }

  async update(id: string, dto: UpdateVillageDto, actor: AdminPrincipal, ip?: string) {
    assertVillageAccess(actor, id);
    const [before] = await this.db.select().from(villages).where(eq(villages.id, id)).limit(1);
    if (!before) throw new NotFoundException('Village not found');

    const [after] = await this.db
      .update(villages)
      .set({ name: dto.name ?? before.name })
      .where(eq(villages.id, id))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.VILLAGE_UPDATED,
      entity: 'village',
      entityId: id,
      before,
      after,
      ip,
    });
    return after;
  }

  /**
   * Public, unauthenticated village list for the customer registration screen.
   * Returns only non-sensitive fields (id, name, code) for every village.
   */
  async listPublic() {
    return this.db
      .select({ id: villages.id, name: villages.name, code: villages.code })
      .from(villages)
      .orderBy(asc(villages.name));
  }

  /** Used by other modules to validate a village id exists. */
  async ensureExists(id: string) {
    const [row] = await this.db.select({ id: villages.id }).from(villages).where(eq(villages.id, id)).limit(1);
    if (!row) throw new NotFoundException('Village not found');
    return row;
  }
}
