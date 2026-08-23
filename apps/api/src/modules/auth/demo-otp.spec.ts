// Baseline env for this file. Echo is OFF on purpose: these tests prove the
// fixed demo OTP comes back *because the mobile is allow-listed*, not because
// the deploy echoes every code. Set before any AppConfigService is constructed.
process.env.OTP_DEV_ECHO = 'false';
process.env.OTP_LENGTH = '6';
process.env.OTP_MAX_PER_HOUR = '50';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';

import type { AppDatabase } from '../../db/client';
import { createTestDb } from '../../test-support/test-db';
import {
  AppConfigService,
  DEMO_PHONE_MIN_PREFIX,
  matchesDemoPhone,
} from '../../config/app-config.service';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';

const DEMO_CODE = '424242';

/**
 * Run `fn` with `env` applied to process.env, then restore. AppConfigService
 * parses env once at construction, so anything that reads config has to be
 * built inside the override.
 */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Build an OtpService whose config sees the given DEMO_OTP* env. */
function buildOtp(db: AppDatabase, env: Record<string, string | undefined>): OtpService {
  return withEnv(env, () => {
    const config = new AppConfigService();
    return new OtpService(db, config, new SmsService(config));
  });
}

describe('matchesDemoPhone', () => {
  it('matches an exact 10-digit entry and nothing adjacent', () => {
    expect(matchesDemoPhone('9100000000', ['9100000000'])).toBe(true);
    expect(matchesDemoPhone('9100000001', ['9100000000'])).toBe(false);
  });

  it('matches a wildcard entry on its prefix only', () => {
    expect(matchesDemoPhone('9100000007', ['91000000*'])).toBe(true);
    expect(matchesDemoPhone('9200000007', ['91000000*'])).toBe(false);
  });

  it('never matches against an empty allow-list', () => {
    expect(matchesDemoPhone('9100000000', [])).toBe(false);
  });
});

describe('OtpService — fixed demo OTP', () => {
  let db: AppDatabase;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => close());

  const DEMO_ENV = { DEMO_OTP: DEMO_CODE, DEMO_OTP_PHONES: '9100000000,91000000*' };

  it('issues the fixed code for an exactly allow-listed mobile and echoes it back', async () => {
    const res = await buildOtp(db, DEMO_ENV).request('9100000000', 'login');
    expect(res.devCode).toBe(DEMO_CODE);
  });

  it('issues the fixed code for a mobile matched by a wildcard prefix', async () => {
    const res = await buildOtp(db, DEMO_ENV).request('9100000009', 'registration');
    expect(res.devCode).toBe(DEMO_CODE);
  });

  it('the echoed fixed code actually verifies', async () => {
    const otp = buildOtp(db, DEMO_ENV);
    await otp.request('9100000000', 'login');
    await expect(otp.verify('9100000000', DEMO_CODE)).resolves.toBeUndefined();
  });

  it('a wrong code still fails for a demo mobile — the normal verify path is unchanged', async () => {
    const otp = buildOtp(db, DEMO_ENV);
    await otp.request('9100000000', 'login');
    await expect(otp.verify('9100000000', '999999')).rejects.toThrow(/Incorrect OTP/);
  });

  it('a mobile outside the allow-list gets a random code, no echo, and rejects the fixed code', async () => {
    const otp = buildOtp(db, DEMO_ENV);
    const res = await otp.request('9876543210', 'login');
    expect(res.devCode).toBeUndefined();
    await expect(otp.verify('9876543210', DEMO_CODE)).rejects.toThrow(/Incorrect OTP/);
  });

  it('DEMO_OTP with an empty allow-list is inert — it never becomes a global code', async () => {
    const otp = buildOtp(db, { DEMO_OTP: DEMO_CODE, DEMO_OTP_PHONES: '' });
    const res = await otp.request('9100000000', 'login');
    expect(res.devCode).toBeUndefined();
    await expect(otp.verify('9100000000', DEMO_CODE)).rejects.toThrow(/Incorrect OTP/);
  });

  it('an allow-list with no DEMO_OTP leaves the random path alone', async () => {
    const otp = buildOtp(db, { DEMO_OTP: undefined, DEMO_OTP_PHONES: '9100000000' });
    const res = await otp.request('9100000000', 'login');
    expect(res.devCode).toBeUndefined();
  });
});

describe('productionReadiness — demo OTP guards', () => {
  // A production config that is otherwise clean, so only the demo-OTP rules
  // under test can contribute a fatal.
  const PROD_BASE: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    DEMO_MODE: 'true',
    JWT_ACCESS_SECRET: 'a_real_access_secret',
    JWT_REFRESH_SECRET: 'a_real_refresh_secret',
    RAZORPAY_WEBHOOK_SECRET: 'a_real_webhook_secret',
    DATABASE_URL: 'postgres://u:p@h/db',
    SEED_ON_BOOT: 'false',
    OTP_DEV_ECHO: 'false',
    OTP_LENGTH: '6',
  };

  const readiness = (env: Record<string, string | undefined>) =>
    withEnv({ ...PROD_BASE, ...env }, () => new AppConfigService().productionReadiness());

  it('under DEMO_MODE a correctly scoped demo OTP is a warning, not a boot failure', () => {
    const { fatal, warnings } = readiness({
      DEMO_OTP: DEMO_CODE,
      DEMO_OTP_PHONES: '9100000000,91000000*',
    });
    expect(fatal).toEqual([]);
    expect(warnings.join(' ')).toMatch(/fixed demo OTP is active/);
  });

  it('refuses to boot when DEMO_OTP has no allow-list', () => {
    const { fatal } = readiness({ DEMO_OTP: DEMO_CODE, DEMO_OTP_PHONES: '' });
    expect(fatal.join(' ')).toMatch(/DEMO_OTP is set but DEMO_OTP_PHONES is empty/);
  });

  it('refuses to boot on a wildcard that matches too broadly', () => {
    const tooShort = '9'.repeat(DEMO_PHONE_MIN_PREFIX - 1) + '*';
    const { fatal } = readiness({ DEMO_OTP: DEMO_CODE, DEMO_OTP_PHONES: tooShort });
    expect(fatal.join(' ')).toMatch(/bad entr/);
  });

  it('refuses to boot when DEMO_OTP length cannot match OTP_LENGTH', () => {
    const { fatal } = readiness({ DEMO_OTP: '1234', DEMO_OTP_PHONES: '9100000000' });
    expect(fatal.join(' ')).toMatch(/could never verify/);
  });

  it('without DEMO_MODE a demo OTP is fatal, however well scoped', () => {
    const { fatal } = readiness({
      DEMO_MODE: 'false',
      DEMO_OTP: DEMO_CODE,
      DEMO_OTP_PHONES: '9100000000',
    });
    expect(fatal.join(' ')).toMatch(/fixed demo OTP is active/);
  });

  it('stays silent when no demo OTP is configured at all', () => {
    const { fatal, warnings } = readiness({ DEMO_OTP: undefined, DEMO_OTP_PHONES: undefined });
    expect(fatal).toEqual([]);
    expect(warnings.join(' ')).not.toMatch(/demo OTP/);
  });
});
