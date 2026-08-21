import { ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import {
  customerBankDetails,
  customerDocuments,
  customers,
  nominees,
  pigmyAccounts,
  villages,
} from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AuditService } from '../audit/audit.service';
import { PigmyService } from '../pigmy/pigmy.service';
import { CustomersService } from '../customers/customers.service';
import type { AdminPrincipal } from '../../common/auth/auth-user';

/**
 * Village isolation: an admin scoped to village A must never be able to see or
 * act on customers / pigmy accounts belonging to village B. The scope is enforced
 * centrally (village-scope.ts) and applied by every admin-facing service method.
 * A superadmin (empty assignment) is the positive control that sees everything.
 */
describe('Village isolation', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let customersSvc: CustomersService;
  let pigmy: PigmyService;

  let villageAId: string;
  let villageBId: string;
  let customerAId: string;
  let customerBId: string;
  let accountAId: string;
  let accountBId: string;

  // Admin scoped to village A only.
  let adminA: AdminPrincipal;
  // Superadmin with no village restriction.
  let superAdmin: AdminPrincipal;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const audit = new AuditService(db);
    pigmy = new PigmyService(db, audit);
    customersSvc = new CustomersService(db, audit, pigmy);

    const [va] = await db.insert(villages).values({ name: 'Village A', code: 'VLGA' }).returning();
    const [vb] = await db.insert(villages).values({ name: 'Village B', code: 'VLGB' }).returning();
    villageAId = va.id;
    villageBId = vb.id;

    const [ca] = await db
      .insert(customers)
      .values({ villageId: villageAId, name: 'Asha (A)', mobile: '9000000001' })
      .returning();
    const [cb] = await db
      .insert(customers)
      .values({ villageId: villageBId, name: 'Bhanu (B)', mobile: '9000000002' })
      .returning();
    customerAId = ca.id;
    customerBId = cb.id;

    const [aa] = await db
      .insert(pigmyAccounts)
      .values({ customerId: ca.id, accountNumber: 'PIG-AAAA-1111', dailyAmount: 10000 })
      .returning();
    const [ab] = await db
      .insert(pigmyAccounts)
      .values({ customerId: cb.id, accountNumber: 'PIG-BBBB-2222', dailyAmount: 5000 })
      .returning();
    accountAId = aa.id;
    accountBId = ab.id;

    adminA = { sub: 'admin-a', type: 'admin', role: 'admin', villages: [villageAId] };
    superAdmin = { sub: 'super', type: 'admin', role: 'superadmin', villages: [] };
  });

  afterEach(async () => close());

  // ── Customers ──────────────────────────────────────────────────────────────

  it('customer listing for admin A returns only village A customers', async () => {
    const { rows, total } = await customersSvc.adminList(adminA, { page: 1, limit: 20 } as never);
    expect(total).toBe(1);
    expect(rows.map((r) => r.id)).toEqual([customerAId]);
    expect(rows.map((r) => r.id)).not.toContain(customerBId);
  });

  it('admin A can open its own village customer 360 but NOT village B', async () => {
    await expect(customersSvc.admin360(customerAId, adminA)).resolves.toMatchObject({
      id: customerAId,
    });
    await expect(customersSvc.admin360(customerBId, adminA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('admin A cannot mutate a village B customer (KYC update is blocked)', async () => {
    await expect(
      customersSvc.updateKyc(customerBId, 'verified', adminA),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // ...and the record is untouched.
    const [cb] = await db.select().from(customers).where(eq(customers.id, customerBId));
    expect(cb.kycStatus).toBe('pending');
  });

  it('admin A cannot filter the listing into village B (explicit villageId is rejected)', async () => {
    await expect(
      customersSvc.adminList(adminA, { page: 1, limit: 20, villageId: villageBId } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── Pigmy accounts ───────────────────────────────────────────────────────────

  it('account overview for admin A returns only village A accounts', async () => {
    const { rows, total } = await pigmy.overview(adminA, 1, 20);
    expect(total).toBe(1);
    expect(rows.map((r) => r.accountNumber)).toEqual(['PIG-AAAA-1111']);
  });

  it('admin A can read its own village account but NOT a village B account', async () => {
    await expect(pigmy.getForAdmin(accountAId, adminA)).resolves.toMatchObject({
      accountNumber: 'PIG-AAAA-1111',
    });
    await expect(pigmy.getForAdmin(accountBId, adminA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admin A cannot change the status of a village B account', async () => {
    await expect(
      pigmy.setStatus(accountBId, 'inactive', adminA),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [ab] = await db.select().from(pigmyAccounts).where(eq(pigmyAccounts.id, accountBId));
    expect(ab.status).toBe('active'); // unchanged
  });

  // ── Customer sub-resources (profile / nominees / documents / bank details) ──
  // These 8 routes are dual-use (admin + customer self-service). When an admin
  // principal is passed as `scope`, every one must enforce village access; the
  // worst case is reading another village's full unmasked bank account number.

  it('admin A cannot read a village B customer bank details (unmasked account# leak)', async () => {
    await db.insert(customerBankDetails).values({
      customerId: customerBId,
      accountNumber: '1234567890123456',
      ifsc: 'HDFC0001234',
      accountHolderName: 'Bhanu (B)',
    });

    await expect(customersSvc.getBankDetails(customerBId, adminA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // ...but a superadmin (positive control) can, and self-service (no scope) can.
    await expect(customersSvc.getBankDetails(customerBId, superAdmin)).resolves.toMatchObject({
      ifsc: 'HDFC0001234',
    });
    await expect(customersSvc.getBankDetails(customerBId)).resolves.toMatchObject({
      accountNumber: '1234567890123456',
    });
  });

  it('admin A cannot list a village B customer nominees or documents', async () => {
    await db.insert(nominees).values({ customerId: customerBId, name: 'Nom B' });
    await db
      .insert(customerDocuments)
      .values({ customerId: customerBId, docType: 'aadhaar', fileUrl: 'https://x/y.png' });

    await expect(customersSvc.listNominees(customerBId, adminA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(customersSvc.listDocuments(customerBId, adminA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Self-service (no admin scope) is unaffected: the caller is always the owner.
    await expect(customersSvc.listNominees(customerBId)).resolves.toHaveLength(1);
  });

  it('admin A cannot mutate a village B customer sub-resources', async () => {
    await expect(
      customersSvc.updateProfile(
        customerBId,
        { name: 'hacked' } as never,
        { type: 'admin', id: adminA.sub },
        undefined,
        adminA,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      customersSvc.addNominee(customerBId, { name: 'x' } as never, adminA.sub, 'admin', undefined, adminA),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      customersSvc.addDocument(
        customerBId,
        { docType: 'pan', fileUrl: 'https://x/z.png' } as never,
        adminA.sub,
        'admin',
        undefined,
        adminA,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      customersSvc.upsertBankDetails(
        customerBId,
        { accountNumber: '999', ifsc: 'abcd0001', accountHolderName: 'x' } as never,
        adminA.sub,
        'admin',
        undefined,
        adminA,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // ...and the village B record is untouched.
    const [cb] = await db.select().from(customers).where(eq(customers.id, customerBId));
    expect(cb.name).toBe('Bhanu (B)');
  });

  it('admin A CAN read + mutate its own village A customer sub-resources', async () => {
    await expect(customersSvc.getBankDetails(customerAId, adminA)).resolves.toBeNull();
    await expect(customersSvc.listNominees(customerAId, adminA)).resolves.toEqual([]);
    const nom = await customersSvc.addNominee(
      customerAId,
      { name: 'Kin A' } as never,
      adminA.sub,
      'admin',
      undefined,
      adminA,
    );
    expect(nom.name).toBe('Kin A');
  });

  // ── Positive control: superadmin sees everything ─────────────────────────────

  it('a superadmin sees customers and accounts across all villages', async () => {
    const custs = await customersSvc.adminList(superAdmin, { page: 1, limit: 20 } as never);
    expect(custs.total).toBe(2);
    expect(custs.rows.map((r) => r.id).sort()).toEqual([customerAId, customerBId].sort());

    const accts = await pigmy.overview(superAdmin, 1, 20);
    expect(accts.total).toBe(2);

    await expect(pigmy.getForAdmin(accountBId, superAdmin)).resolves.toMatchObject({
      accountNumber: 'PIG-BBBB-2222',
    });
  });
});
