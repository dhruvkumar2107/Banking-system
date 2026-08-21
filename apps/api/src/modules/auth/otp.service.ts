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
import { AppConfigService } from '../../config/app-config.service';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { otpCodes } from '../../db/schema';
import { SmsService } from './sms.service';

const MAX_VERIFY_ATTEMPTS = 5;

const tooMany = (msg: string) => new HttpException(msg, HttpStatus.TOO_MANY_REQUESTS);

export interface OtpRequestResult {
  sent: boolean;
  /** Only populated when OTP_DEV_ECHO is on (never in production). */
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

  /** Rate-limited OTP issue. Returns dev code only when echo is enabled. */
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

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await this.db.insert(otpCodes).values({ mobile, codeHash, purpose, expiresAt });

    await this.sms.send(mobile, `Your Digital Pigmee OTP is ${code}. Valid for ${ttl / 60} min.`);

    return {
      sent: true,
      devCode: devEcho ? code : undefined,
      expiresInSeconds: ttl,
    };
  }

  /**
   * Verify the latest active OTP for a mobile. Increments attempts and consumes
   * the code on success. Throws on invalid/expired/too-many-attempts.
   */
  async verify(mobile: string, code: string): Promise<void> {
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
