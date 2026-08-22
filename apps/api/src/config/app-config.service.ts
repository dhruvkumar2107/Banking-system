import { Injectable } from '@nestjs/common';

export type PaymentsMode = 'mock' | 'live';
export type SmsProvider = 'console' | 'msg91' | 'twilio';

export interface AppConfig {
  env: string;
  isProd: boolean;
  /**
   * Deliberate opt-in (DEMO_MODE=true) that lets a hosted demo run with
   * NODE_ENV=production while still using the mock payment gateway and console
   * SMS. It downgrades exactly those two production-readiness checks to
   * warnings; it never relaxes a check that would leak secrets or OTP codes.
   */
  demoMode: boolean;
  port: number;
  apiBaseUrl: string;
  db: { url: string | null; pglitePath: string };
  jwt: { accessSecret: string; refreshSecret: string; accessTtl: number; refreshTtl: number };
  otp: {
    ttl: number;
    length: number;
    maxPerHour: number;
    devEcho: boolean;
    smsProvider: string;
  };
  sms: {
    provider: SmsProvider;
    msg91: { authKey: string; senderId: string; route: string; dltTemplateId: string };
    twilio: { accountSid: string; authToken: string; from: string };
  };
  razorpay: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    mode: PaymentsMode;
  };
  security: { corsOrigins: string[]; throttleTtl: number; throttleLimit: number };
  uploads: { dir: string; maxBytes: number };
  reminders: { enabled: boolean; cron: string; missedDaysThreshold: number };
  reconcile: { enabled: boolean; cron: string; staleMinutes: number };
  seed: { email: string; password: string; onBoot: boolean };
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};
const bool = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

/**
 * Typed access to environment configuration. Parsed once at construction.
 */
@Injectable()
export class AppConfigService {
  readonly config: AppConfig;

  constructor() {
    const env = process.env.NODE_ENV ?? 'development';
    const url = (process.env.DATABASE_URL ?? '').trim();

    const keyId = process.env.RAZORPAY_KEY_ID ?? '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
    // Force mock mode unless real keys are present.
    const requestedMode = (process.env.PAYMENTS_MODE ?? 'mock') as PaymentsMode;
    const mode: PaymentsMode = keyId && keySecret && requestedMode === 'live' ? 'live' : 'mock';

    const smsProvider = (process.env.SMS_PROVIDER ?? 'console').toLowerCase() as SmsProvider;

    this.config = {
      env,
      isProd: env === 'production',
      demoMode: bool(process.env.DEMO_MODE, false),
      port: num(process.env.PORT, 4000),
      apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${num(process.env.PORT, 4000)}`,
      db: {
        url: url.length > 0 ? url : null,
        pglitePath: process.env.PGLITE_PATH ?? '.data/pigmee',
      },
      jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me',
        refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me',
        accessTtl: num(process.env.JWT_ACCESS_TTL, 900),
        refreshTtl: num(process.env.JWT_REFRESH_TTL, 1209600),
      },
      otp: {
        ttl: num(process.env.OTP_TTL, 300),
        length: num(process.env.OTP_LENGTH, 6),
        maxPerHour: num(process.env.OTP_MAX_PER_HOUR, 5),
        devEcho: bool(process.env.OTP_DEV_ECHO, env !== 'production'),
        smsProvider,
      },
      sms: {
        provider: smsProvider,
        msg91: {
          authKey: process.env.MSG91_AUTH_KEY ?? '',
          senderId: process.env.MSG91_SENDER_ID ?? 'PIGMEE',
          route: process.env.MSG91_ROUTE ?? '4',
          dltTemplateId: process.env.MSG91_DLT_TEMPLATE_ID ?? '',
        },
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
          authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
          from: process.env.TWILIO_FROM ?? '',
        },
      },
      razorpay: {
        keyId,
        keySecret,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? 'dev_webhook_secret_change_me',
        mode,
      },
      security: {
        corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        throttleTtl: num(process.env.THROTTLE_TTL, 60),
        throttleLimit: num(process.env.THROTTLE_LIMIT, 120),
      },
      uploads: {
        // Relative by default, like PGLITE_PATH — resolved against the process
        // CWD, which is apps/api locally and /repo/apps/api in the container.
        dir: process.env.UPLOAD_DIR ?? 'storage/uploads',
        maxBytes: num(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
      },
      reminders: {
        enabled: bool(process.env.REMINDERS_ENABLED, true),
        cron: process.env.REMINDERS_CRON ?? '0 18 * * *',
        missedDaysThreshold: num(process.env.MISSED_PIGMY_DAYS, 3),
      },
      reconcile: {
        enabled: bool(process.env.RECONCILE_ENABLED, true),
        cron: process.env.RECONCILE_CRON ?? '*/15 * * * *',
        staleMinutes: num(process.env.RECONCILE_STALE_MINUTES, 10),
      },
      seed: {
        email: process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@pigmee.bank',
        password: process.env.SEED_SUPERADMIN_PASSWORD ?? 'Admin@12345',
        // Managed hosts on free tiers give you no shell, so there is no way to
        // run `npm run seed` after a deploy. Opt in to seed on first boot.
        onBoot: bool(process.env.SEED_ON_BOOT, false),
      },
    };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Classify production-readiness problems into two buckets:
   *   - `fatal`    — the API must refuse to boot (dev secrets, OTP echo, no DB).
   *   - `warnings` — tolerated because DEMO_MODE=true was set deliberately.
   *
   * Called at bootstrap so a misconfigured prod deploy fails fast instead of
   * silently self-signing mock payments or leaking OTP codes. A hosted demo can
   * still run under NODE_ENV=production — keeping strict CORS and OTP secrecy —
   * by setting DEMO_MODE=true, which relaxes only the mock-gateway and
   * console-SMS checks.
   */
  productionReadiness(): { fatal: string[]; warnings: string[] } {
    const c = this.config;
    if (!c.isProd) return { fatal: [], warnings: [] };

    const fatal: string[] = [];
    const warnings: string[] = [];
    // Mock money and console SMS are the only two things a demo may keep.
    const demoable = (msg: string): void => {
      (c.demoMode ? warnings : fatal).push(msg);
    };

    // Payments must be live with real, non-default secrets.
    if (c.razorpay.mode !== 'live') {
      demoable('Payments are in MOCK mode — set PAYMENTS_MODE=live with RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET.');
    }
    // Only reachable once a live gateway can actually call the webhook.
    if (!c.razorpay.webhookSecret || c.razorpay.webhookSecret === 'dev_webhook_secret_change_me') {
      demoable('RAZORPAY_WEBHOOK_SECRET is unset or still the dev default.');
    }

    // Never ship dev-default JWT secrets — no demo exemption.
    if (c.jwt.accessSecret === 'dev_access_secret_change_me') {
      fatal.push('JWT_ACCESS_SECRET is still the dev default.');
    }
    if (c.jwt.refreshSecret === 'dev_refresh_secret_change_me') {
      fatal.push('JWT_REFRESH_SECRET is still the dev default.');
    }

    // Echoing OTPs hands any caller a login — never allowed in production.
    if (c.otp.devEcho) {
      fatal.push('OTP_DEV_ECHO is on — OTP codes would be returned in API responses.');
    }

    // A demo may log OTPs to the server console, but picking a real provider and
    // leaving it half-configured is a misconfiguration either way.
    if (c.sms.provider === 'console') {
      demoable('SMS_PROVIDER=console — wire msg91 or twilio so OTPs are actually delivered.');
    }
    if (c.sms.provider === 'msg91' && !c.sms.msg91.authKey) {
      fatal.push('SMS_PROVIDER=msg91 but MSG91_AUTH_KEY is unset.');
    }
    if (c.sms.provider === 'twilio' && (!c.sms.twilio.accountSid || !c.sms.twilio.authToken || !c.sms.twilio.from)) {
      fatal.push('SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM are incomplete.');
    }

    // A managed database must back production: the embedded PGlite file lives on
    // the container filesystem and is wiped by every redeploy.
    if (!c.db.url) {
      fatal.push('DATABASE_URL is unset — production should use a managed Postgres, not embedded PGlite.');
    }

    // Seeding on boot puts these credentials behind a public URL, so the
    // documented demo password must not survive into a real deploy.
    if (c.seed.onBoot && c.seed.password === 'Admin@12345') {
      fatal.push('SEED_ON_BOOT is on with the default SEED_SUPERADMIN_PASSWORD — set a strong one.');
    }

    return { fatal, warnings };
  }
}
