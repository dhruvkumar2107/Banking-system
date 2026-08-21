// Deterministic env for the auth flow: echo OTP codes so tests can read them,
// and pin the JWT/OTP config. Must be set before AppConfigService is constructed.
process.env.OTP_DEV_ECHO = 'true';
process.env.OTP_LENGTH = '6';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';

import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import type { AppDatabase } from '../../db/client';
import { admins, customers, pigmyAccounts, villages } from '../../db/schema';
import { createTestDb } from '../../test-support/test-db';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { PigmyService } from '../pigmy/pigmy.service';
import { CustomersService } from '../customers/customers.service';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { TokensService } from './tokens.service';
import { AuthService } from './auth.service';

/**
 * AuthService is exercised against a real embedded Postgres with its real
 * collaborators (OTP, tokens, customers, audit) wired by hand — no Nest DI.
 * These cover the OTP → verify → register happy path, the login path for an
 * existing customer, and admin credential login.
 */
describe('AuthService', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let auth: AuthService;
  let tokens: TokensService;
  let villageId: string;

  const MOBILE = '9876543210';

  beforeEach(async () => {
    ({ db, close } = await createTestDb());

    const config = new AppConfigService();
    const audit = new AuditService(db);
    const pigmy = new PigmyService(db, audit);
    const customersSvc = new CustomersService(db, audit, pigmy);
    const sms = new SmsService(config);
    const otp = new OtpService(db, config, sms);
    const jwt = new JwtService({ secret: config.config.jwt.accessSecret });
    tokens = new TokensService(db, jwt, config);
    auth = new AuthService(db, otp, tokens, customersSvc, audit);

    const [v] = await db
      .insert(villages)
      .values({ name: 'Village A', code: 'VLGA' })
      .returning();
    villageId = v.id;
  });

  afterEach(async () => close());

  it('requestOtp on an unknown mobile returns a registration purpose + dev code', async () => {
    const res = await auth.requestOtp(MOBILE);
    expect(res.isRegistered).toBe(false);
    expect(res.sent).toBe(true);
    expect(res.devCode).toMatch(/^\d{6}$/);
  });

  it('completes the register flow: request → verify → register issues tokens + account', async () => {
    // 1. Request an OTP for a brand-new mobile.
    const requested = await auth.requestOtp(MOBILE);
    expect(requested.isRegistered).toBe(false);
    const code = requested.devCode!;

    // 2. Verify → new mobile gets a short-lived registration token, not a session.
    const verified = await auth.verifyOtp(MOBILE, code);
    expect(verified.registered).toBe(false);
    expect(verified).toHaveProperty('registrationToken');
    const registrationToken = (verified as { registrationToken: string }).registrationToken;

    // 3. Complete registration.
    const registered = await auth.register(registrationToken, {
      name: 'Rahul Kumar',
      villageId,
      dailyAmountRupees: 100,
    });
    expect(registered.accessToken).toBeTruthy();
    expect(registered.refreshToken).toBeTruthy();
    expect(registered.customer.mobile).toBe(MOBILE);
    expect(registered.pigmyAccount.accountNumber).toMatch(/^PIG/);

    // The customer + a pigmy account really landed in the DB.
    const [cust] = await db.select().from(customers).where(eq(customers.mobile, MOBILE));
    expect(cust).toBeDefined();
    expect(cust.villageId).toBe(villageId);
    const accts = await db
      .select()
      .from(pigmyAccounts)
      .where(eq(pigmyAccounts.customerId, cust.id));
    expect(accts).toHaveLength(1);
    expect(accts[0].dailyAmount).toBe(10000); // ₹100 in paise
  });

  it('once registered, requestOtp reports login and verifyOtp returns a session', async () => {
    // Register first.
    const req1 = await auth.requestOtp(MOBILE);
    const v1 = await auth.verifyOtp(MOBILE, req1.devCode!);
    await auth.register((v1 as { registrationToken: string }).registrationToken, {
      name: 'Rahul Kumar',
      villageId,
    });

    // Now the same mobile is a login.
    const req2 = await auth.requestOtp(MOBILE);
    expect(req2.isRegistered).toBe(true);

    const v2 = await auth.verifyOtp(MOBILE, req2.devCode!);
    expect(v2.registered).toBe(true);
    expect((v2 as { accessToken: string }).accessToken).toBeTruthy();
    expect((v2 as { customer: { mobile: string } }).customer.mobile).toBe(MOBILE);
  });

  it('rejects an incorrect OTP code', async () => {
    await auth.requestOtp(MOBILE);
    await expect(auth.verifyOtp(MOBILE, '000000')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects verifyOtp when no OTP was ever requested', async () => {
    await expect(auth.verifyOtp('9111111111', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('adminLogin', () => {
    const EMAIL = 'admin@pigmee.bank';
    const PASSWORD = 'Admin@12345';

    beforeEach(async () => {
      await db.insert(admins).values({
        name: 'Super Admin',
        email: EMAIL,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: 'superadmin',
        assignedVillages: [],
        isActive: true,
      });
    });

    it('issues tokens for valid credentials', async () => {
      const res = await auth.adminLogin(EMAIL, PASSWORD);
      expect(res.accessToken).toBeTruthy();
      expect(res.admin.email).toBe(EMAIL);
      expect(res.admin.role).toBe('superadmin');
    });

    it('rejects a wrong password', async () => {
      await expect(auth.adminLogin(EMAIL, 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown email', async () => {
      await expect(auth.adminLogin('nobody@pigmee.bank', PASSWORD)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an inactive admin', async () => {
      await db.update(admins).set({ isActive: false }).where(eq(admins.email, EMAIL));
      await expect(auth.adminLogin(EMAIL, PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('returns a customer profile for a customer principal', async () => {
      const req = await auth.requestOtp(MOBILE);
      const v = await auth.verifyOtp(MOBILE, req.devCode!);
      const reg = await auth.register((v as { registrationToken: string }).registrationToken, {
        name: 'Rahul Kumar',
        villageId,
      });

      const me = await auth.me({ sub: reg.customer.id, type: 'customer' });
      expect(me.type).toBe('customer');
      expect((me as { mobile: string }).mobile).toBe(MOBILE);
    });

    it('returns an admin profile for an admin principal', async () => {
      const [admin] = await db
        .insert(admins)
        .values({
          name: 'Village A Admin',
          email: 'a@pigmee.bank',
          passwordHash: await bcrypt.hash('secret1', 10),
          role: 'admin',
          assignedVillages: [villageId],
          isActive: true,
        })
        .returning();

      const me = await auth.me({
        sub: admin.id,
        type: 'admin',
        role: 'admin',
        villages: [villageId],
      });
      expect(me.type).toBe('admin');
      expect((me as { email: string }).email).toBe('a@pigmee.bank');
      expect((me as { assignedVillages: string[] }).assignedVillages).toEqual([villageId]);
    });
  });
});
