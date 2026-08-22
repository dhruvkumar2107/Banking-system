import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import {
  admins,
  customerDocuments,
  customers,
  nominees,
  villages,
  type Customer,
} from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { NotificationsService } from '../notifications/notifications.service';
import { assertVillageAccess, villageScopeFilter } from '../../common/village-scope';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { normalizeMobile } from '../auth/auth.dto';
import { aadhaarLast4, hashAadhaar, isValidAadhaar, maskAadhaar } from './aadhaar';
import type { BypassKycDto, KycListQueryDto, RejectKycDto, SubmitKycDto } from './kyc.dto';

/** The two stages that satisfy the gate. Everything else is blocked. */
export const KYC_PASSING_STAGES = ['verified', 'bypassed'] as const;

export type KycStageValue = Customer['kycStage'];

/** Whether a stage lets the customer transact. */
export function kycPasses(stage: KycStageValue): boolean {
  return (KYC_PASSING_STAGES as readonly string[]).includes(stage);
}

/** Human-readable next step for each stage — drives the app's KYC banner. */
const STAGE_HINT: Record<KycStageValue, string> = {
  not_started: 'Complete your KYC to start depositing, borrowing and withdrawing.',
  submitted: 'Your KYC is with our team for review. This usually takes one working day.',
  verified: 'Your KYC is verified. All services are available.',
  rejected: 'Your KYC was not accepted. Please check the reason and submit again.',
  bypassed: 'Your account was manually cleared by our staff. All services are available.',
};

/**
 * KYC engine. Verification is a hard gate: a freshly registered customer can
 * look around but cannot deposit, borrow or withdraw until an admin has either
 * verified their submission or explicitly bypassed the requirement.
 *
 * Flow:
 *   not_started ──submit──> submitted ──verify──> verified
 *                                     └─reject──> rejected ──submit──> submitted
 *   (any stage)  ──admin bypass──> bypassed
 *
 * Aadhaar is deliberately not stored in full — see `aadhaar.ts`. The submission
 * writes the photo, the Aadhaar digest, the document rows and the nominees in
 * ONE transaction, so a customer can never be left half-submitted.
 */
@Injectable()
export class KycService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── shared shape ───────────────────────────────────────────────────────────
  /** What the customer sees about their own KYC. Never includes the full Aadhaar. */
  private serialize(c: Customer) {
    return {
      stage: c.kycStage,
      passes: kycPasses(c.kycStage),
      hint: STAGE_HINT[c.kycStage],
      // legacy per-document verdict column, kept so existing screens don't break
      legacyStatus: c.kycStatus,
      photoUrl: c.photoUrl,
      photoIsLive: c.photoIsLive,
      photoCapturedAt: c.photoCapturedAt,
      aadhaarMasked: maskAadhaar(c.aadhaarLast4),
      submittedAt: c.kycSubmittedAt,
      verifiedAt: c.kycVerifiedAt,
      rejectionReason: c.kycRejectionReason,
      bypassedAt: c.kycBypassedAt,
      bypassReason: c.kycBypassReason,
    };
  }

  private async getCustomer(customerId: string): Promise<Customer> {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  // ── customer: read own status ──────────────────────────────────────────────
  /** My KYC status plus the nominees and documents already on file. */
  async status(customerId: string) {
    const customer = await this.getCustomer(customerId);
    const [noms, docs] = await Promise.all([
      this.db.select().from(nominees).where(eq(nominees.customerId, customerId)),
      this.db
        .select()
        .from(customerDocuments)
        .where(eq(customerDocuments.customerId, customerId))
        .orderBy(desc(customerDocuments.uploadedAt)),
    ]);
    return {
      ...this.serialize(customer),
      nominees: noms,
      documents: docs.map((d) => ({
        id: d.id,
        docType: d.docType,
        fileUrl: d.fileUrl,
        verifiedStatus: d.verifiedStatus,
        uploadedAt: d.uploadedAt,
      })),
      requirements: {
        photo: 'A clear photo of your face — take it live in the app if you can',
        aadhaar: 'A photo of your Aadhaar card plus the 12-digit number',
        nominee: 'At least one nominee (name and relationship are required)',
      },
    };
  }

  // ── customer: submit ───────────────────────────────────────────────────────
  /**
   * Submit the full KYC bundle. Idempotent-ish by design: a `rejected` or
   * `not_started` customer may (re)submit, but an already-`submitted` one cannot
   * queue-jump by resubmitting, and a `verified`/`bypassed` one has nothing to do.
   *
   * Replaces the nominee list wholesale rather than appending, so a resubmission
   * after a rejection doesn't leave the rejected nominees behind.
   */
  async submit(customerId: string, dto: SubmitKycDto, ip?: string) {
    const customer = await this.getCustomer(customerId);

    if (customer.kycStage === 'verified' || customer.kycStage === 'bypassed') {
      throw new BadRequestException('Your KYC is already complete');
    }
    if (customer.kycStage === 'submitted') {
      throw new BadRequestException(
        'Your KYC is already under review. Please wait for our team to respond.',
      );
    }
    if (!dto.nominees || dto.nominees.length === 0) {
      throw new BadRequestException('At least one nominee is required');
    }
    if (!isValidAadhaar(dto.aadhaarNumber)) {
      throw new BadRequestException(
        'That does not look like a valid Aadhaar number. Please check all 12 digits.',
      );
    }

    const hash = hashAadhaar(dto.aadhaarNumber);
    const last4 = aadhaarLast4(dto.aadhaarNumber);

    // One Aadhaar, one customer. The unique index on aadhaar_hash is the real
    // guarantee; this check exists to return a readable error instead of a 500.
    const [clash] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.aadhaarHash, hash), ne(customers.id, customerId)))
      .limit(1);
    if (clash) {
      throw new ConflictException(
        'This Aadhaar number is already registered to another account. Please contact your branch.',
      );
    }

    const now = new Date();

    const updated = await this.db.transaction(async (tx: AppTransaction) => {
      const [row] = await tx
        .update(customers)
        .set({
          kycStage: 'submitted',
          kycStatus: 'pending',
          photoUrl: dto.photoUrl,
          photoIsLive: dto.photoIsLive,
          photoCapturedAt: now,
          aadhaarLast4: last4,
          aadhaarHash: hash,
          address: dto.address?.trim() || customer.address,
          kycSubmittedAt: now,
          kycRejectionReason: null,
          updatedAt: now,
        })
        .where(eq(customers.id, customerId))
        .returning();

      // Record both uploads as documents so the admin reviewer sees them in the
      // same list as any other KYC paperwork.
      await tx.insert(customerDocuments).values([
        { customerId, docType: 'photo', fileUrl: dto.photoUrl },
        { customerId, docType: 'aadhaar', fileUrl: dto.aadhaarFileUrl },
      ]);

      // Replace the nominee list — a resubmission supersedes the previous one.
      await tx.delete(nominees).where(eq(nominees.customerId, customerId));
      await tx.insert(nominees).values(
        dto.nominees.map((n) => ({
          customerId,
          name: n.name,
          relation: n.relation,
          mobile: n.mobile ? normalizeMobile(n.mobile) : null,
          address: n.address ?? null,
        })),
      );

      await this.audit.record(
        {
          actorId: customerId,
          actorType: 'customer',
          action: AuditAction.KYC_SUBMITTED,
          entity: 'customer',
          entityId: customerId,
          before: { kycStage: customer.kycStage },
          // Deliberately logs last4 only — the audit trail must not become the
          // one place the full Aadhaar leaks.
          after: {
            kycStage: 'submitted',
            aadhaarLast4: last4,
            photoIsLive: dto.photoIsLive,
            nomineeCount: dto.nominees.length,
          },
          ip,
        },
        tx,
      );

      return row;
    });

    await this.notifications.notifyCustomer(customerId, {
      title: 'KYC submitted',
      body: 'Thanks — your documents are with our team. We usually review within one working day.',
      category: 'system',
    });

    return this.serialize(updated);
  }

  // ── admin: review queue ────────────────────────────────────────────────────
  /** Village-scoped KYC queue. Defaults to the submissions awaiting a decision. */
  async listForAdmin(actor: AdminPrincipal, q: KycListQueryDto) {
    const stage = q.stage ?? 'submitted';
    const conds = [villageScopeFilter(actor, customers.villageId), eq(customers.kycStage, stage)];
    if (q.villageId) {
      assertVillageAccess(actor, q.villageId);
      conds.push(eq(customers.villageId, q.villageId));
    }
    if (q.search) {
      conds.push(
        or(ilike(customers.name, `%${q.search}%`), ilike(customers.mobile, `%${q.search}%`)),
      );
    }
    const where = and(...conds.filter(Boolean));

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({ customer: customers, villageName: villages.name })
        .from(customers)
        .innerJoin(villages, eq(villages.id, customers.villageId))
        .where(where)
        .orderBy(desc(customers.kycSubmittedAt), desc(customers.createdAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ value: count() }).from(customers).where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        customerId: r.customer.id,
        name: r.customer.name,
        mobile: r.customer.mobile,
        village: r.villageName,
        ...this.serialize(r.customer),
      })),
      total,
    };
  }

  /** How many submissions await review (drives the sidebar badge). */
  async pendingCount(actor: AdminPrincipal) {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(customers)
      .where(
        and(
          villageScopeFilter(actor, customers.villageId),
          eq(customers.kycStage, 'submitted'),
        ),
      );
    return { pending: value };
  }

  /** Everything a reviewer needs on one screen: photo, Aadhaar, nominees, docs. */
  async detailForAdmin(customerId: string, actor: AdminPrincipal) {
    const customer = await this.getCustomer(customerId);
    assertVillageAccess(actor, customer.villageId);

    const [village] = await this.db
      .select()
      .from(villages)
      .where(eq(villages.id, customer.villageId))
      .limit(1);
    const [noms, docs, verifier, bypasser] = await Promise.all([
      this.db.select().from(nominees).where(eq(nominees.customerId, customerId)),
      this.db
        .select()
        .from(customerDocuments)
        .where(eq(customerDocuments.customerId, customerId))
        .orderBy(desc(customerDocuments.uploadedAt)),
      customer.kycVerifiedById
        ? this.db
            .select({ name: admins.name })
            .from(admins)
            .where(eq(admins.id, customer.kycVerifiedById))
            .limit(1)
        : Promise.resolve([]),
      customer.kycBypassedById
        ? this.db
            .select({ name: admins.name })
            .from(admins)
            .where(eq(admins.id, customer.kycBypassedById))
            .limit(1)
        : Promise.resolve([]),
    ]);

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        address: customer.address,
        createdAt: customer.createdAt,
      },
      village: village ? { id: village.id, name: village.name, code: village.code } : null,
      ...this.serialize(customer),
      verifiedBy: verifier[0]?.name ?? null,
      bypassedBy: bypasser[0]?.name ?? null,
      nominees: noms,
      documents: docs,
    };
  }

  // ── admin: decide ──────────────────────────────────────────────────────────
  /**
   * Verify a submission. Only a `submitted` customer can be verified — verifying
   * straight from `not_started` would mean approving documents that were never
   * uploaded, which is what `bypass` is for (and it demands a reason).
   */
  async verify(customerId: string, actor: AdminPrincipal, ip?: string) {
    const before = await this.getCustomer(customerId);
    assertVillageAccess(actor, before.villageId);
    if (before.kycStage === 'verified') {
      throw new BadRequestException('This customer is already verified');
    }
    if (before.kycStage !== 'submitted') {
      throw new BadRequestException(
        `Only a submitted KYC can be verified — this one is "${before.kycStage}". Use bypass if you have checked the documents in person.`,
      );
    }

    const now = new Date();
    const [after] = await this.db
      .update(customers)
      .set({
        kycStage: 'verified',
        kycStatus: 'verified',
        kycVerifiedAt: now,
        kycVerifiedById: actor.sub,
        kycRejectionReason: null,
        updatedAt: now,
      })
      .where(eq(customers.id, customerId))
      .returning();

    // Mark the submitted documents verified in the same breath, so the reviewer
    // doesn't have to tick each one separately.
    await this.db
      .update(customerDocuments)
      .set({ verifiedStatus: 'verified' })
      .where(
        and(
          eq(customerDocuments.customerId, customerId),
          eq(customerDocuments.verifiedStatus, 'pending'),
        ),
      );

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.KYC_VERIFIED,
      entity: 'customer',
      entityId: customerId,
      before: { kycStage: before.kycStage },
      after: { kycStage: 'verified', aadhaarLast4: after.aadhaarLast4 },
      ip,
    });

    await this.notifications.notifyCustomer(customerId, {
      title: 'KYC verified ✅',
      body: 'Your KYC is approved. You can now deposit, apply for a loan and request withdrawals.',
      category: 'system',
    });

    return this.serialize(after);
  }

  /** Reject with a reason. The customer can fix and resubmit. */
  async reject(customerId: string, dto: RejectKycDto, actor: AdminPrincipal, ip?: string) {
    const before = await this.getCustomer(customerId);
    assertVillageAccess(actor, before.villageId);
    if (before.kycStage !== 'submitted') {
      throw new BadRequestException(
        `Only a submitted KYC can be rejected — this one is "${before.kycStage}".`,
      );
    }

    const now = new Date();
    const [after] = await this.db
      .update(customers)
      .set({
        kycStage: 'rejected',
        kycStatus: 'rejected',
        kycRejectionReason: dto.reason,
        kycVerifiedAt: null,
        kycVerifiedById: null,
        updatedAt: now,
      })
      .where(eq(customers.id, customerId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.KYC_REJECTED,
      entity: 'customer',
      entityId: customerId,
      before: { kycStage: before.kycStage },
      after: { kycStage: 'rejected', reason: dto.reason },
      ip,
    });

    await this.notifications.notifyCustomer(customerId, {
      title: 'KYC needs attention',
      body: `Your KYC could not be approved. Reason: ${dto.reason}. Please submit again with the correction.`,
      category: 'system',
    });

    return this.serialize(after);
  }

  /**
   * Bypass the gate — the manual override, restricted to admin/superadmin at the
   * controller. Works from ANY stage (including `not_started`), because its whole
   * purpose is to clear a customer whose documents were checked off-system. The
   * reason is mandatory and the action is audited under its own name so a bypass
   * can never be mistaken for a real verification in the trail.
   */
  async bypass(customerId: string, dto: BypassKycDto, actor: AdminPrincipal, ip?: string) {
    const before = await this.getCustomer(customerId);
    assertVillageAccess(actor, before.villageId);
    if (before.kycStage === 'bypassed') {
      throw new BadRequestException('This customer has already been bypassed');
    }

    const now = new Date();
    const [after] = await this.db
      .update(customers)
      .set({
        kycStage: 'bypassed',
        kycBypassedAt: now,
        kycBypassedById: actor.sub,
        kycBypassReason: dto.reason,
        kycRejectionReason: null,
        updatedAt: now,
      })
      .where(eq(customers.id, customerId))
      .returning();

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.KYC_BYPASSED,
      entity: 'customer',
      entityId: customerId,
      before: { kycStage: before.kycStage, kycStatus: before.kycStatus },
      after: { kycStage: 'bypassed', reason: dto.reason },
      ip,
    });

    await this.notifications.notifyCustomer(customerId, {
      title: 'Account cleared for transactions',
      body: 'Our staff have cleared your account. You can now deposit, apply for a loan and request withdrawals.',
      category: 'system',
    });

    return this.serialize(after);
  }

  // ── gate support ───────────────────────────────────────────────────────────
  /**
   * The check the guard uses. Returns the stage so the caller can tell the
   * customer what to do next rather than just refusing.
   */
  async gateState(customerId: string): Promise<{ stage: KycStageValue; passes: boolean; hint: string }> {
    const [row] = await this.db
      .select({ stage: customers.kycStage })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!row) throw new NotFoundException('Customer not found');
    return { stage: row.stage, passes: kycPasses(row.stage), hint: STAGE_HINT[row.stage] };
  }
}
