import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import {
  customerBankDetails,
  customerDocuments,
  customers,
  ledgerEntries,
  nominees,
  pigmyAccounts,
  transactions,
  villages,
} from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PigmyService } from '../pigmy/pigmy.service';
import { rupeesToPaise, withRupees } from '../../common/money';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { normalizeMobile } from '../auth/auth.dto';
import type {
  AdminCreateCustomerDto,
  CreateDocumentDto,
  CreateNomineeDto,
  CustomerListQueryDto,
  UpdateCustomerProfileDto,
  UpsertBankDetailsDto,
} from './customers.dto';

export interface RegistrationInput {
  mobile: string;
  name: string;
  address?: string | null;
  villageId: string;
  dailyAmountRupees?: number;
}

const DEFAULT_DAILY_RUPEES = 100;

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
    private readonly pigmy: PigmyService,
  ) {}

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Create a customer and their first pigmy account atomically. Used by the
   * OTP registration flow (actorType 'customer') and by admin walk-in creation.
   */
  async createFromRegistration(
    input: RegistrationInput,
    opts: { actorType?: 'customer' | 'admin'; actorId?: string | null; ip?: string } = {},
  ) {
    const mobile = normalizeMobile(input.mobile);
    await this.assertVillageExists(input.villageId);
    await this.assertMobileFree(mobile);

    const actorType = opts.actorType ?? 'customer';
    const dailyPaise = rupeesToPaise(input.dailyAmountRupees ?? DEFAULT_DAILY_RUPEES);

    return this.db.transaction(async (tx: AppTransaction) => {
      const [customer] = await tx
        .insert(customers)
        .values({
          villageId: input.villageId,
          name: input.name,
          mobile,
          address: input.address ?? null,
        })
        .returning();

      const account = await this.pigmy.createAccount(
        customer.id,
        dailyPaise,
        {
          actorId: opts.actorId ?? customer.id,
          actorType,
          ip: opts.ip,
        },
        tx,
      );

      await this.audit.record(
        {
          actorId: opts.actorId ?? customer.id,
          actorType,
          action: AuditAction.CUSTOMER_REGISTERED,
          entity: 'customer',
          entityId: customer.id,
          after: { id: customer.id, mobile, villageId: input.villageId, name: input.name },
          ip: opts.ip,
        },
        tx,
      );

      return { customer, account };
    });
  }

  /** Admin/agent creating a customer directly (village-scoped). */
  async adminCreate(dto: AdminCreateCustomerDto, actor: AdminPrincipal, ip?: string) {
    assertVillageAccess(actor, dto.villageId);
    const { customer, account } = await this.createFromRegistration(
      {
        mobile: dto.mobile,
        name: dto.name,
        address: dto.address,
        villageId: dto.villageId,
        dailyAmountRupees: dto.dailyAmountRupees,
      },
      { actorType: 'admin', actorId: actor.sub, ip },
    );
    return { customer: this.serializeCustomer(customer), account };
  }

  // ── Lookups ─────────────────────────────────────────────────────────────

  async findByMobile(mobile: string) {
    const normalized = normalizeMobile(mobile);
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.mobile, normalized))
      .limit(1);
    return row ?? null;
  }

  async getByIdOrThrow(id: string) {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  private serializeCustomer(c: typeof customers.$inferSelect) {
    return {
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      address: c.address,
      photoUrl: c.photoUrl,
      kycStatus: c.kycStatus,
      villageId: c.villageId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /** Full customer profile (self-service and admin 360 share this shape). */
  async fullProfile(customerId: string) {
    const customer = await this.getByIdOrThrow(customerId);
    const [village] = await this.db
      .select()
      .from(villages)
      .where(eq(villages.id, customer.villageId))
      .limit(1);

    const [accounts, noms, docs, bank] = await Promise.all([
      this.db
        .select()
        .from(pigmyAccounts)
        .where(eq(pigmyAccounts.customerId, customerId))
        .orderBy(desc(pigmyAccounts.createdAt)),
      this.db.select().from(nominees).where(eq(nominees.customerId, customerId)),
      this.db
        .select()
        .from(customerDocuments)
        .where(eq(customerDocuments.customerId, customerId))
        .orderBy(desc(customerDocuments.uploadedAt)),
      this.db
        .select()
        .from(customerBankDetails)
        .where(eq(customerBankDetails.customerId, customerId))
        .limit(1),
    ]);

    return {
      ...this.serializeCustomer(customer),
      village: village ? { id: village.id, name: village.name, code: village.code } : null,
      pigmyAccounts: accounts.map((a) => ({
        id: a.id,
        accountNumber: a.accountNumber,
        status: a.status,
        dailyAmount: withRupees(a.dailyAmount),
        currentBalance: withRupees(a.currentBalance),
        totalDeposited: withRupees(a.totalDeposited),
        termDays: a.termDays,
        interestRatePercent: a.interestRateBps / 100,
        maturityDate: a.maturityDate,
        matured: !!a.maturedAt || (!!a.maturityDate && new Date(a.maturityDate).getTime() <= Date.now()),
        closedAt: a.closedAt,
        createdAt: a.createdAt,
      })),
      nominees: noms,
      documents: docs,
      bankDetails: bank[0] ?? null,
    };
  }

  // ── Admin listing / 360 ───────────────────────────────────────────────────

  async adminList(actor: AdminPrincipal, q: CustomerListQueryDto) {
    const conds = [villageScopeFilter(actor, customers.villageId)];
    if (q.villageId) {
      assertVillageAccess(actor, q.villageId);
      conds.push(eq(customers.villageId, q.villageId));
    }
    if (q.kycStatus) conds.push(eq(customers.kycStatus, q.kycStatus));
    if (q.search) {
      conds.push(
        or(ilike(customers.name, `%${q.search}%`), ilike(customers.mobile, `%${q.search}%`)),
      );
    }
    const where = and(...conds.filter(Boolean));

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          customer: customers,
          villageName: villages.name,
          balance: sql<number>`coalesce(sum(${pigmyAccounts.currentBalance}), 0)`,
          accounts: sql<number>`count(distinct ${pigmyAccounts.id})`,
        })
        .from(customers)
        .innerJoin(villages, eq(villages.id, customers.villageId))
        .leftJoin(pigmyAccounts, eq(pigmyAccounts.customerId, customers.id))
        .where(where)
        .groupBy(customers.id, villages.name)
        .orderBy(desc(customers.createdAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ value: count() }).from(customers).where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        ...this.serializeCustomer(r.customer),
        village: r.villageName,
        totalBalance: withRupees(Number(r.balance)),
        accountCount: Number(r.accounts),
      })),
      total,
    };
  }

  /** Admin 360° view: profile + recent transactions, village-scoped. */
  async admin360(customerId: string, actor: AdminPrincipal) {
    const customer = await this.getByIdOrThrow(customerId);
    assertVillageAccess(actor, customer.villageId);
    const profile = await this.fullProfile(customerId);

    const recentTxns = await this.db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        status: transactions.status,
        gateway: transactions.gateway,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(pigmyAccounts, eq(pigmyAccounts.id, transactions.pigmyAccountId))
      .where(eq(pigmyAccounts.customerId, customerId))
      .orderBy(desc(transactions.createdAt))
      .limit(20);

    return {
      ...profile,
      recentTransactions: recentTxns.map((t) => ({ ...t, amount: withRupees(t.amount) })),
    };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async updateProfile(
    customerId: string,
    dto: UpdateCustomerProfileDto,
    actor: { type: 'customer' | 'admin'; id: string },
    ip?: string,
    scope?: AdminPrincipal,
  ) {
    const before = await this.getByIdOrThrow(customerId);
    if (scope) assertVillageAccess(scope, before.villageId);
    // An omitted field keeps its value; an explicitly empty one clears it (that
    // is how the app removes a profile photo) and is stored as NULL, not ''.
    const blankToNull = (v: string | undefined, current: string | null) =>
      v === undefined ? current : v.trim() || null;
    const [after] = await this.db
      .update(customers)
      .set({
        name: dto.name ?? before.name,
        address: blankToNull(dto.address, before.address),
        photoUrl: blankToNull(dto.photoUrl, before.photoUrl),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))
      .returning();

    await this.audit.record({
      actorId: actor.id,
      actorType: actor.type,
      action: AuditAction.CUSTOMER_UPDATED,
      entity: 'customer',
      entityId: customerId,
      before: { name: before.name, address: before.address, photoUrl: before.photoUrl },
      after: { name: after.name, address: after.address, photoUrl: after.photoUrl },
      ip,
    });
    return this.serializeCustomer(after);
  }

  async updateKyc(
    customerId: string,
    status: 'pending' | 'verified' | 'rejected',
    actor: AdminPrincipal,
    ip?: string,
  ) {
    const before = await this.getByIdOrThrow(customerId);
    assertVillageAccess(actor, before.villageId);
    const [after] = await this.db
      .update(customers)
      .set({ kycStatus: status, updatedAt: new Date() })
      .where(eq(customers.id, customerId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.KYC_UPDATED,
      entity: 'customer',
      entityId: customerId,
      before: { kycStatus: before.kycStatus },
      after: { kycStatus: after.kycStatus },
      ip,
    });
    return this.serializeCustomer(after);
  }

  async assignVillage(customerId: string, villageId: string, actor: AdminPrincipal, ip?: string) {
    const before = await this.getByIdOrThrow(customerId);
    assertVillageAccess(actor, before.villageId); // must own the current village
    assertVillageAccess(actor, villageId); // and the target
    await this.assertVillageExists(villageId);
    const [after] = await this.db
      .update(customers)
      .set({ villageId, updatedAt: new Date() })
      .where(eq(customers.id, customerId))
      .returning();
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.CUSTOMER_UPDATED,
      entity: 'customer',
      entityId: customerId,
      before: { villageId: before.villageId },
      after: { villageId: after.villageId },
      ip,
    });
    return this.serializeCustomer(after);
  }

  // ── Nominees ────────────────────────────────────────────────────────────

  async addNominee(
    customerId: string,
    dto: CreateNomineeDto,
    actorId: string,
    actorType: 'customer' | 'admin',
    ip?: string,
    scope?: AdminPrincipal,
  ) {
    const customer = await this.getByIdOrThrow(customerId);
    if (scope) assertVillageAccess(scope, customer.villageId);
    const [row] = await this.db
      .insert(nominees)
      .values({
        customerId,
        name: dto.name,
        relation: dto.relation ?? null,
        mobile: dto.mobile ? normalizeMobile(dto.mobile) : null,
        address: dto.address ?? null,
      })
      .returning();
    await this.audit.record({
      actorId,
      actorType,
      action: AuditAction.NOMINEE_UPDATED,
      entity: 'nominee',
      entityId: row.id,
      after: row,
      ip,
    });
    return row;
  }

  async listNominees(customerId: string, scope?: AdminPrincipal) {
    if (scope) assertVillageAccess(scope, (await this.getByIdOrThrow(customerId)).villageId);
    return this.db.select().from(nominees).where(eq(nominees.customerId, customerId));
  }

  async deleteNominee(
    customerId: string,
    nomineeId: string,
    actorId: string,
    actorType: 'customer' | 'admin',
    ip?: string,
    scope?: AdminPrincipal,
  ) {
    const customer = await this.getByIdOrThrow(customerId);
    if (scope) assertVillageAccess(scope, customer.villageId);
    const [row] = await this.db
      .select()
      .from(nominees)
      .where(and(eq(nominees.id, nomineeId), eq(nominees.customerId, customerId)))
      .limit(1);
    if (!row) throw new NotFoundException('Nominee not found');
    await this.db.delete(nominees).where(eq(nominees.id, nomineeId));
    await this.audit.record({
      actorId,
      actorType,
      action: AuditAction.NOMINEE_DELETED,
      entity: 'nominee',
      entityId: nomineeId,
      before: row,
      ip,
    });
    return { deleted: true };
  }

  // ── Documents (KYC) ───────────────────────────────────────────────────────

  async addDocument(
    customerId: string,
    dto: CreateDocumentDto,
    actorId: string,
    actorType: 'customer' | 'admin',
    ip?: string,
    scope?: AdminPrincipal,
  ) {
    const customer = await this.getByIdOrThrow(customerId);
    if (scope) assertVillageAccess(scope, customer.villageId);
    const [row] = await this.db
      .insert(customerDocuments)
      .values({ customerId, docType: dto.docType, fileUrl: dto.fileUrl })
      .returning();
    await this.audit.record({
      actorId,
      actorType,
      action: AuditAction.DOCUMENT_UPLOADED,
      entity: 'customer_document',
      entityId: row.id,
      after: { docType: row.docType },
      ip,
    });
    return row;
  }

  async listDocuments(customerId: string, scope?: AdminPrincipal) {
    if (scope) assertVillageAccess(scope, (await this.getByIdOrThrow(customerId)).villageId);
    return this.db
      .select()
      .from(customerDocuments)
      .where(eq(customerDocuments.customerId, customerId))
      .orderBy(desc(customerDocuments.uploadedAt));
  }

  async verifyDocument(
    customerId: string,
    documentId: string,
    status: 'pending' | 'verified' | 'rejected',
    actor: AdminPrincipal,
    ip?: string,
  ) {
    const customer = await this.getByIdOrThrow(customerId);
    assertVillageAccess(actor, customer.villageId);
    const [doc] = await this.db
      .select()
      .from(customerDocuments)
      .where(and(eq(customerDocuments.id, documentId), eq(customerDocuments.customerId, customerId)))
      .limit(1);
    if (!doc) throw new NotFoundException('Document not found');
    const [after] = await this.db
      .update(customerDocuments)
      .set({ verifiedStatus: status })
      .where(eq(customerDocuments.id, documentId))
      .returning();
    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.DOCUMENT_VERIFIED,
      entity: 'customer_document',
      entityId: documentId,
      before: { verifiedStatus: doc.verifiedStatus },
      after: { verifiedStatus: after.verifiedStatus },
      ip,
    });
    return after;
  }

  // ── Bank details ──────────────────────────────────────────────────────────

  async upsertBankDetails(
    customerId: string,
    dto: UpsertBankDetailsDto,
    actorId: string,
    actorType: 'customer' | 'admin',
    ip?: string,
    scope?: AdminPrincipal,
  ) {
    const customer = await this.getByIdOrThrow(customerId);
    if (scope) assertVillageAccess(scope, customer.villageId);
    const [existing] = await this.db
      .select()
      .from(customerBankDetails)
      .where(eq(customerBankDetails.customerId, customerId))
      .limit(1);

    let row;
    if (existing) {
      [row] = await this.db
        .update(customerBankDetails)
        .set({
          accountNumber: dto.accountNumber,
          ifsc: dto.ifsc.toUpperCase(),
          accountHolderName: dto.accountHolderName,
          updatedAt: new Date(),
        })
        .where(eq(customerBankDetails.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(customerBankDetails)
        .values({
          customerId,
          accountNumber: dto.accountNumber,
          ifsc: dto.ifsc.toUpperCase(),
          accountHolderName: dto.accountHolderName,
        })
        .returning();
    }

    await this.audit.record({
      actorId,
      actorType,
      action: AuditAction.BANK_DETAILS_UPDATED,
      entity: 'customer_bank_details',
      entityId: row.id,
      // never log full account numbers
      after: { ifsc: row.ifsc, last4: row.accountNumber.slice(-4) },
      ip,
    });
    return row;
  }

  async getBankDetails(customerId: string, scope?: AdminPrincipal) {
    if (scope) assertVillageAccess(scope, (await this.getByIdOrThrow(customerId)).villageId);
    const [row] = await this.db
      .select()
      .from(customerBankDetails)
      .where(eq(customerBankDetails.customerId, customerId))
      .limit(1);
    return row ?? null;
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  private async assertVillageExists(villageId: string) {
    const [row] = await this.db
      .select({ id: villages.id })
      .from(villages)
      .where(eq(villages.id, villageId))
      .limit(1);
    if (!row) throw new BadRequestException('Village does not exist');
  }

  private async assertMobileFree(mobile: string) {
    const [row] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.mobile, mobile))
      .limit(1);
    if (row) throw new ConflictException('A customer with this mobile already exists');
  }
}
