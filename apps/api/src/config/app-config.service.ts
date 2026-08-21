import { Injectable } from '@nestjs/common';

export type PaymentsMode = 'mock' | 'live';
export type SmsProvider = 'console' | 'msg91' | 'twilio';

export interface AppConfig {
  env: string;
  isProd: boolean;
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
  seed: { email: string; password: string };
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
      },
    };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Returns a list of production-readiness problems. Empty => safe to run in
   * production. Called at bootstrap so a misconfigured prod deploy fails fast
   * instead of silently self-signing mock payments or leaking OTP codes.
   */
  productionReadinessIssues(): string[] {
    const c = this.config;
    if (!c.isProd) return [];
    const issues: string[] = [];

    // Payments must be live with real, non-default secrets.
    if (c.razorpay.mode !== 'live') {
      issues.push('Payments are in MOCK mode — set PAYMENTS_MODE=live with RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET.');
    }
    if (!c.razorpay.webhookSecret || c.razorpay.webhookSecret === 'dev_webhook_secret_change_me') {
      issues.push('RAZORPAY_WEBHOOK_SECRET is unset or still the dev default.');
    }

    // Never ship dev-default JWT secrets.
    if (c.jwt.accessSecret === 'dev_access_secret_change_me') {
      issues.push('JWT_ACCESS_SECRET is still the dev default.');
    }
    if (c.jwt.refreshSecret === 'dev_refresh_secret_change_me') {
      issues.push('JWT_REFRESH_SECRET is still the dev default.');
    }

    // OTP must be delivered by a real provider and never echoed back to clients.
    if (c.otp.devEcho) {
      issues.push('OTP_DEV_ECHO is on — OTP codes would be returned in API responses.');
    }
    if (c.sms.provider === 'console') {
      issues.push('SMS_PROVIDER=console — wire msg91 or twilio so OTPs are actually delivered.');
    }
    if (c.sms.provider === 'msg91' && !c.sms.msg91.authKey) {
      issues.push('SMS_PROVIDER=msg91 but MSG91_AUTH_KEY is unset.');
    }
    if (c.sms.provider === 'twilio' && (!c.sms.twilio.accountSid || !c.sms.twilio.authToken || !c.sms.twilio.from)) {
      issues.push('SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM are incomplete.');
    }

    // A managed database should back production, not the embedded PGlite file.
    if (!c.db.url) {
      issues.push('DATABASE_URL is unset — production should use a managed Postgres, not embedded PGlite.');
    }

    return issues;
  }
}
