// Deterministic env for the whole app under test. Set BEFORE anything imports
// AppConfigService, which parses process.env once at construction.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ''; // force embedded Postgres, never a real DB
process.env.OTP_DEV_ECHO = 'true'; // echo OTP codes so the test can read them
process.env.OTP_LENGTH = '6';
process.env.PAYMENTS_MODE = 'mock'; // no Razorpay keys -> mock order + signature
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AppDatabase } from '../src/db/client';
import { villages } from '../src/db/schema';
import { DATABASE, DB_BUNDLE } from '../src/db/database.constants';
import { createTestDb } from '../src/test-support/test-db';
import { AppModule } from '../src/app.module';

/**
 * Full-stack customer journey against the real Nest app + embedded Postgres:
 *   register (OTP → verify → register)
 *     → pay   (create a mock Razorpay order)
 *     → verify (server-side signature check settles the payment)
 *     → dashboard reflects the credited balance.
 *
 * The single-connection PGlite is shared by the app (via overridden DI tokens)
 * and this test's seeding, so there is exactly one DB and no cross-connection
 * surprises. Every write inside the app rides its own db.transaction(); the test
 * only reads/seeds outside any open transaction.
 */
describe('Customer journey (e2e)', () => {
  let app: INestApplication;
  let db: AppDatabase;

  const MOBILE = '9876543210';
  const DAILY_RUPEES = 100;
  const DAILY_PAISE = 10000;

  let villageId: string;
  let accessToken: string;
  let orderId: string;
  let mockPaymentId: string;
  let mockSignature: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Redirect every @Inject(DATABASE) to the in-memory PGlite...
      .overrideProvider(DATABASE)
      .useValue(db)
      // ...and the lifecycle bundle too, so the file-backed factory never runs.
      .overrideProvider(DB_BUNDLE)
      .useValue({ db, dialect: 'pglite', close: testDb.close })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts so DTO validation + the /api prefix behave as in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    // Seed the one village the customer will register into.
    const [v] = await db.insert(villages).values({ name: 'Village A', code: 'VLGA' }).returning();
    villageId = v.id;
  });

  afterAll(async () => {
    // app.close() fires DbLifecycle.onApplicationShutdown, which closes the db.
    await app?.close();
  });

  const api = () => request(app.getHttpServer());

  it('1. register: OTP request → verify → register issues a session + pigmy account', async () => {
    const requested = await api()
      .post('/api/auth/otp/request')
      .send({ mobile: MOBILE })
      .expect(200);
    expect(requested.body.isRegistered).toBe(false);
    const devCode: string = requested.body.devCode;
    expect(devCode).toMatch(/^\d{6}$/);

    const verified = await api()
      .post('/api/auth/otp/verify')
      .send({ mobile: MOBILE, code: devCode })
      .expect(200);
    expect(verified.body.registered).toBe(false);
    const registrationToken: string = verified.body.registrationToken;
    expect(registrationToken).toBeTruthy();

    const registered = await api()
      .post('/api/auth/register')
      .send({ registrationToken, name: 'Rahul Kumar', villageId, dailyAmountRupees: DAILY_RUPEES })
      .expect(201);
    expect(registered.body.accessToken).toBeTruthy();
    expect(registered.body.customer.mobile).toBe(MOBILE);
    expect(registered.body.pigmyAccount.accountNumber).toMatch(/^PIG/);

    accessToken = registered.body.accessToken;
  });

  it('2. pay: creating an order returns a mock payment id + signature', async () => {
    const res = await api()
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({}) // no amount/account -> defaults to the primary account's daily amount
      .expect(201);

    expect(res.body.mode).toBe('mock');
    expect(res.body.orderId).toBeTruthy();
    expect(res.body.amount.paise).toBe(DAILY_PAISE);
    expect(res.body.mock).toMatchObject({
      paymentId: expect.any(String),
      signature: expect.any(String),
    });

    orderId = res.body.orderId;
    mockPaymentId = res.body.mock.paymentId;
    mockSignature = res.body.mock.signature;
  });

  it('rejects a tampered signature (server-side verification is real)', async () => {
    await api()
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ orderId, paymentId: mockPaymentId, signature: 'deadbeef' })
      .expect(400);
  });

  it('3. verify: a valid signature settles the payment and credits the ledger', async () => {
    const res = await api()
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ orderId, paymentId: mockPaymentId, signature: mockSignature })
      .expect(200);

    expect(res.body.verified).toBe(true);
    expect(res.body.status).toBe('success');
    expect(res.body.newBalance.paise).toBe(DAILY_PAISE);
  });

  it('is idempotent: replaying the same verify does not double-credit', async () => {
    const res = await api()
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ orderId, paymentId: mockPaymentId, signature: mockSignature })
      .expect(200);
    expect(res.body.alreadyProcessed).toBe(true);
    expect(res.body.newBalance.paise).toBe(DAILY_PAISE); // still just one deposit
  });

  it('4. dashboard: /me/dashboard shows the credited balance', async () => {
    const res = await api()
      .get('/api/me/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.customer.mobile).toBe(MOBILE);
    expect(res.body.totalBalance.paise).toBe(DAILY_PAISE);
    expect(res.body.primaryAccount.currentBalance.paise).toBe(DAILY_PAISE);
    expect(res.body.primaryAccount.totalDeposited.paise).toBe(DAILY_PAISE);

    // The successful deposit shows up in recent activity.
    const success = res.body.recentTransactions.find((t: { status: string }) => t.status === 'success');
    expect(success).toBeDefined();
    expect(success.amount.paise).toBe(DAILY_PAISE);
  });

  it('rejects an unauthenticated dashboard request', async () => {
    await api().get('/api/me/dashboard').expect(401);
  });
});
