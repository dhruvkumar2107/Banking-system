import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, lte } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../app.module';
import { AppConfigService } from '../config/app-config.service';
import { DATABASE, DB_BUNDLE } from './database.constants';
import type { AppDatabase, DbBundle } from './client';
import { applyMigrations } from './run-migrations';
import { admins, customers, pigmyAccounts, schemeSettings, villages } from './schema';
import { CustomersService } from '../modules/customers/customers.service';
import { PaymentsService } from '../modules/payments/payments.service';
import { addDays, DEFAULT_SCHEME } from '../modules/withdrawals/scheme.service';

const log = new Logger('Seed');

// Surface anything that would otherwise let the event loop drain silently
// (e.g. a swallowed rejection deep in the payment/ledger path).
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[seed] UNHANDLED REJECTION', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] UNCAUGHT EXCEPTION', err);
  process.exit(1);
});

const VILLAGES = [
  { name: 'Rampur', code: 'RMP' },
  { name: 'Lakshmipuram', code: 'LKP' },
  { name: 'Ganeshnagar', code: 'GNR' },
  { name: 'Shivpur', code: 'SVP' },
];

const FIRST_NAMES = ['Rahul', 'Priya', 'Amit', 'Sunita', 'Vijay', 'Anita', 'Ramesh', 'Kavita', 'Suresh', 'Meena', 'Arjun', 'Pooja'];
const LAST_NAMES = ['Kumar', 'Sharma', 'Patel', 'Reddy', 'Singh', 'Das', 'Nair', 'Yadav'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function seedSuperadmin(db: AppDatabase, email: string, password: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  const [existing] = await db.select().from(admins).where(eq(admins.email, normalized)).limit(1);
  if (existing) {
    // Reconcile the password + active flag so the documented seed credentials
    // always authenticate against the live DB (idempotent across re-seeds).
    await db.update(admins).set({ passwordHash, isActive: true }).where(eq(admins.id, existing.id));
    log.log(`Superadmin exists (${normalized}) — password reconciled to SEED_SUPERADMIN_PASSWORD`);
    return existing.id;
  }
  const [created] = await db
    .insert(admins)
    .values({
      name: 'Super Admin',
      email: normalized,
      passwordHash,
      role: 'superadmin',
      assignedVillages: [],
      isActive: true,
    })
    .returning();
  log.log(`Created superadmin ${normalized}`);
  return created.id;
}

/**
 * Persist the bank's default pigmy scheme. Accounts snapshot these terms at
 * opening, so this must run BEFORE any account is created — otherwise the first
 * accounts fall back to DEFAULT_SCHEME and could drift from the saved row.
 */
async function seedScheme(db: AppDatabase, adminId: string) {
  const [existing] = await db.select({ id: schemeSettings.id }).from(schemeSettings).limit(1);
  if (existing) {
    log.log('Scheme settings already exist — skipping scheme seed');
    return;
  }
  await db.insert(schemeSettings).values({ ...DEFAULT_SCHEME, updatedById: adminId });
  log.log(
    `Created scheme: ${DEFAULT_SCHEME.termDays}-day term, ` +
      `${DEFAULT_SCHEME.interestRateBps / 100}% p.a., ` +
      `early withdrawal ${DEFAULT_SCHEME.earlyWithdrawalAllowed ? 'allowed' : 'blocked'} ` +
      `with a ${DEFAULT_SCHEME.earlyPenaltyBps / 100}% penalty`,
  );
}

async function seedVillages(db: AppDatabase): Promise<string[]> {
  const existing = await db.select().from(villages);
  if (existing.length > 0) {
    log.log(`${existing.length} villages already exist — skipping village seed`);
    return existing.map((v) => v.id);
  }
  const ids: string[] = [];
  for (const v of VILLAGES) {
    const [row] = await db.insert(villages).values(v).returning();
    ids.push(row.id);
    log.log(`Created village ${v.name} (${v.code})`);
  }
  return ids;
}

async function seedCustomersAndDeposits(
  db: AppDatabase,
  customersSvc: CustomersService,
  paymentsSvc: PaymentsService,
  villageIds: string[],
) {
  const existing = await db.select({ id: customers.id }).from(customers);
  if (existing.length > 0) {
    log.log(`${existing.length} customers already exist — skipping customer/deposit seed`);
    return;
  }

  const TOTAL = 12;
  for (let i = 0; i < TOTAL; i++) {
    const name = `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`;
    const mobile = `9${String(100000000 + i).padStart(9, '0')}`; // 10 digits, starts 9
    const villageId = pick(villageIds, i);
    const dailyAmountRupees = pick([50, 100, 100, 200, 150], i);

    const { customer, account } = await customersSvc.createFromRegistration({
      mobile,
      name,
      villageId,
      dailyAmountRupees,
    });
    log.log(`Customer ${name} (${mobile}) → account ${account.accountNumber}`);

    // Simulate a handful of daily deposits through the real payment flow (mock
    // gateway) so balances are ledger-derived and transactions populate reports.
    const deposits = 2 + (i % 4); // 2..5 deposits
    for (let d = 0; d < deposits; d++) {
      const order = await paymentsSvc.createOrder(customer.id, {});
      if (!order.mock) {
        log.warn('Gateway not in mock mode — cannot auto-settle seed deposits; skipping');
        break;
      }
      await paymentsSvc.verifyPayment(customer.id, {
        orderId: order.orderId,
        paymentId: order.mock.paymentId,
        signature: order.mock.signature,
      });
    }
  }
}

/**
 * Backdate one account so the demo has something at maturity to withdraw from.
 *
 * Only the dates move — the balance is left alone because it is ledger-derived.
 * `maturedAt` is deliberately left NULL so the daily maturity sweep still has
 * work to do (and can be demonstrated) on a freshly seeded database.
 */
async function seedMaturedDemoAccount(db: AppDatabase) {
  const [already] = await db
    .select({ id: pigmyAccounts.id })
    .from(pigmyAccounts)
    .where(lte(pigmyAccounts.maturityDate, new Date()))
    .limit(1);
  if (already) {
    log.log('A matured account already exists — skipping maturity demo seed');
    return;
  }

  const [target] = await db
    .select()
    .from(pigmyAccounts)
    .orderBy(pigmyAccounts.createdAt)
    .limit(1);
  if (!target) return;

  const openedAt = addDays(new Date(), -(target.termDays + 5)); // matured 5 days ago
  await db
    .update(pigmyAccounts)
    .set({
      createdAt: openedAt,
      maturityDate: addDays(openedAt, target.termDays),
      updatedAt: new Date(),
    })
    .where(eq(pigmyAccounts.id, target.id));
  log.log(`Backdated ${target.accountNumber} to matured (demo maturity + interest flow)`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const bundle = app.get<DbBundle>(DB_BUNDLE);
  await applyMigrations(bundle);
  log.log(`Migrations applied (dialect=${bundle.dialect})`);

  const db = app.get<AppDatabase>(DATABASE);
  const cfg = app.get(AppConfigService).config;
  const customersSvc = app.get(CustomersService, { strict: false });
  const paymentsSvc = app.get(PaymentsService, { strict: false });

  const superadminId = await seedSuperadmin(db, cfg.seed.email, cfg.seed.password);
  await seedScheme(db, superadminId);
  const villageIds = await seedVillages(db);
  await seedCustomersAndDeposits(db, customersSvc, paymentsSvc, villageIds);
  await seedMaturedDemoAccount(db);

  log.log('Seed complete ✔');
  log.log(`  Admin login: ${cfg.seed.email} / ${cfg.seed.password}`);
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed', err);
  process.exit(1);
});
