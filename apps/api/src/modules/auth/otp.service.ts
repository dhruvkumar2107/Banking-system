import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { AppConfigService, matchesDemoPhone } from '../../config/app-config.service';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { otpCodes } from '../../db/schema';
import { SmsService } from './sms.service';

const MAX_VERIFY_ATTEMPTS = 5;

const tooMany = (msg: string) => new HttpException(msg, HttpStatus.TOO_MANY_REQUESTS);

export interface OtpRequestResult {
  sent: boolean;
  /**
   * The code, for the two cases where the caller is allowed to see it:
   * OTP_DEV_ECHO is on (never in production), or this mobile is on the
   * DEMO_OTP_PHONES allow-list — where the code is a fixed, documented demo
   * value, so returning it discloses nothing the demo docs do not already say.
   */
  devCode?: string;
  expiresInSeconds: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger('OTP');

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly config: AppConfigService,
    private readonly sms: SmsService,
  ) {}

  private generateCode(): string {
    const len = this.config.config.otp.length;
    const max = 10 ** len;
    const n = Math.floor(Math.random() * max);
    return n.toString().padStart(len, '0');
  }

  /**
   * Is this mobile on the fixed-demo-OTP allow-list? Only true when a demo code
   * and a non-empty allow-list are both configured, so a half-set env can never
   * silently widen the login path.
   */
  private isDemoMobile(mobile: string): boolean {
    const { code, phones } = this.config.config.demoOtp;
    return code.length > 0 && phones.length > 0 && matchesDemoPhone(mobile, phones);
  }

  /**
   * Rate-limited OTP issue. Returns the code when OTP_DEV_ECHO is on, or when
   * the mobile is on the DEMO_OTP_PHONES allow-list.
   */
  async request(mobile: string, purpose: 'login' | 'registration'): Promise<OtpRequestResult> {
    const { ttl, maxPerHour, devEcho } = this.config.config.otp;

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.db
      .select({ id: otpCodes.id })
      .from(otpCodes)
      .where(and(eq(otpCodes.mobile, mobile), gt(otpCodes.createdAt, since)));
    if (recent.length >= maxPerHour) {
      throw tooMany(`OTP limit reached (${maxPerHour}/hour). Try again later.`);
    }

    // A demo mobile gets the fixed code; everything after this point — hashing,
    // storage, expiry, attempt counting and verify() — is the one normal path.
    const isDemo = this.isDemoMobile(mobile);
    const code = isDemo ? this.config.config.demoOtp.code : this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await this.db.insert(otpCodes).values({ mobile, codeHash, purpose, expiresAt });

    if (isDemo) {
      this.logger.warn(`Issued the fixed demo OTP for allow-listed mobile ${mobile}`);
    }

    await this.sms.send(mobile, `Your Digital Pigmee OTP is ${code}. Valid for ${ttl / 60} min.`);

    return {
      sent: true,
      devCode: devEcho || isDemo ? code : undefined,
      expiresInSeconds: ttl,
    };
  }

  /**
   * Verify the latest active OTP for a mobile. Increments attempts and consumes
   * the code on success. Throws on invalid/expired/too-many-attempts.
   */
  async verify(mobile: string, code: string): Promise<void> {
    const { devEcho } = this.config.config.otp;

    if (devEcho && code === '123456') {
      this.logger.warn(`Dev-mode bypass: accepted universal OTP for ${mobile}`);
      return;
    }

    const [row] = await this.db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.mobile, mobile),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!row) throw new BadRequestException('No active OTP. Please request a new one.');
    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw tooMany('Too many attempts. Please request a new OTP.');
    }

    const ok = await bcrypt.compare(code, row.codeHash);
    if (!ok) {
      await this.db
        .update(otpCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(otpCodes.id, row.id));
      throw new BadRequestException('Incorrect OTP');
    }

    await this.db
      .update(otpCodes)
      .set({ consumedAt: new Date(), attempts: row.attempts + 1 })
      .where(eq(otpCodes.id, row.id));
  }
}
