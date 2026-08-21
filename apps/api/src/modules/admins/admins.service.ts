import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { admins } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import type { CreateAdminDto, UpdateAdminDto, AdminListQueryDto } from './admins.dto';

const BCRYPT_ROUNDS = 10;

type AdminRow = typeof admins.$inferSelect;
/** Public admin shape — never leak the password hash. */
export type SafeAdmin = Omit<AdminRow, 'passwordHash'>;

function sanitize(row: AdminRow): SafeAdmin {
  const { passwordHash: _omit, ...rest } = row;
  return rest;
}

@Injectable()
export class AdminsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  async getByIdOrThrow(id: string): Promise<AdminRow> {
    const [row] = await this.db.select().from(admins).where(eq(admins.id, id)).limit(1);
    if (!row) throw new NotFoundException('Admin not found');
    return row;
  }

  async list(q: AdminListQueryDto) {
    const conds = [];
    if (q.search) {
      const like = `%${q.search}%`;
      conds.push(or(ilike(admins.name, like), ilike(admins.email, like)));
    }
    if (q.role) conds.push(eq(admins.role, q.role));
    if (q.isActive !== undefined) conds.push(eq(admins.isActive, q.isActive));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(admins)
        .where(where)
        .orderBy(desc(admins.createdAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ value: count() }).from(admins).where(where),
    ]);
    return { rows: rows.map(sanitize), total };
  }

  async findOne(id: string): Promise<SafeAdmin> {
    return sanitize(await this.getByIdOrThrow(id));
  }

  async create(dto: CreateAdminDto, actor: AdminPrincipal, ip?: string): Promise<SafeAdmin> {
    const email = dto.email.trim().toLowerCase();
    const [existing] = await this.db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);
    if (existing) throw new ConflictException('An admin with this email already exists');

    // A non-superadmin must be scoped to at least one village. Never default to
    // an empty list, which (fail-closed) would leave the admin able to see nothing
    // — and previously would have silently granted all-village access.
    const assignedVillages = dto.role === 'superadmin' ? [] : dto.assignedVillages ?? [];
    if (dto.role !== 'superadmin' && assignedVillages.length === 0) {
      throw new BadRequestException('A non-superadmin must be assigned at least one village');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const [row] = await this.db
      .insert(admins)
      .values({
        name: dto.name.trim(),
        email,
        passwordHash,
        role: dto.role,
        assignedVillages,
        isActive: true,
      })
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.ADMIN_CREATED,
      entity: 'admin',
      entityId: row.id,
      // never store password material in the audit trail
      after: { name: row.name, email: row.email, role: row.role, assignedVillages: row.assignedVillages },
      ip,
    });
    return sanitize(row);
  }

  async update(id: string, dto: UpdateAdminDto, actor: AdminPrincipal, ip?: string): Promise<SafeAdmin> {
    const current = await this.getByIdOrThrow(id);

    // Guard: an admin cannot deactivate or demote themselves (avoids self-lockout).
    if (id === actor.sub) {
      if (dto.isActive === false) throw new BadRequestException('You cannot deactivate your own account');
      if (dto.role && dto.role !== current.role)
        throw new BadRequestException('You cannot change your own role');
    }

    // After applying the patch, a non-superadmin must still be scoped to ≥1
    // village — block demotions or village-clears that would leave them either
    // able to see nothing or (previously) silently able to see everything.
    const effectiveRole = dto.role ?? current.role;
    const effectiveVillages = dto.assignedVillages ?? current.assignedVillages ?? [];
    if (effectiveRole !== 'superadmin' && effectiveVillages.length === 0) {
      throw new BadRequestException('A non-superadmin must be assigned at least one village');
    }

    const patch: Partial<AdminRow> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.assignedVillages !== undefined) patch.assignedVillages = dto.assignedVillages;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    if (Object.keys(patch).length === 0) return sanitize(current);
    patch.updatedAt = new Date();

    const [row] = await this.db.update(admins).set(patch).where(eq(admins.id, id)).returning();
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.ADMIN_UPDATED,
      entity: 'admin',
      entityId: id,
      before: { name: current.name, role: current.role, assignedVillages: current.assignedVillages, isActive: current.isActive },
      after: { name: row.name, role: row.role, assignedVillages: row.assignedVillages, isActive: row.isActive },
      ip,
    });
    return sanitize(row);
  }

  /** Superadmin resets another admin's password. */
  async resetPassword(id: string, newPassword: string, actor: AdminPrincipal, ip?: string): Promise<{ ok: true }> {
    await this.getByIdOrThrow(id);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.update(admins).set({ passwordHash, updatedAt: new Date() }).where(eq(admins.id, id));
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.ADMIN_UPDATED,
      entity: 'admin',
      entityId: id,
      after: { passwordReset: true },
      ip,
    });
    return { ok: true };
  }

  /** An admin changes their own password (must supply the current one). */
  async changeOwnPassword(actor: AdminPrincipal, currentPassword: string, newPassword: string, ip?: string) {
    const me = await this.getByIdOrThrow(actor.sub);
    const ok = await bcrypt.compare(currentPassword, me.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.update(admins).set({ passwordHash, updatedAt: new Date() }).where(eq(admins.id, actor.sub));
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.ADMIN_UPDATED,
      entity: 'admin',
      entityId: actor.sub,
      after: { passwordChanged: true },
      ip,
    });
    return { ok: true as const };
  }
}
