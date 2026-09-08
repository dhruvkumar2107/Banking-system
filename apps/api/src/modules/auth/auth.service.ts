import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { AppConfigService } from '../../config/app-config.service';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { admins, villages } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CustomersService } from '../customers/customers.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { normalizeMobile, type RegisterCustomerDto } from './auth.dto';

/**
 * In-memory rate limiter for admin login attempts.
 * Tracks failed attempts per email with lockout after MAX_ATTEMPTS.
 * In production, this should be backed by Redis for multi-instance deployments.
 */
class AdminLoginRateLimiter {
  private readonly attempts = new Map<string, { count: number; lockedUntil: number }>();
  private readonly logger = new Logger('AdminLoginRateLimiter');

  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minute window

  /** Check if an email is currently locked out. */
  isLocked(email: string): boolean {
    const record = this.attempts.get(email);
    if (!record) return false;
    if (Date.now() > record.lockedUntil) {
      this.attempts.delete(email);
      return false;
    }
    return true;
  }

  /** Record a failed login attempt. Returns true if the account is now locked. */
  recordFailure(email: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(email);

    if (!record || now > record.lockedUntil) {
      this.attempts.set(email, { count: 1, lockedUntil: 0 });
      return false;
    }

    record.count++;
    if (record.count >= this.MAX_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.logger.warn(`Admin account locked: ${email} (${record.count} failed attempts)`);
      return true;
    }
    return false;
  }

  /** Clear failed attempts on successful login. */
  clear(email: string): void {
    this.attempts.delete(email);
  }

  /** Get remaining lockout time in seconds (0 if not locked). */
  lockoutRemaining(email: string): number {
    const record = this.attempts.get(email);
    if (!record) return 0;
    const remaining = Math.max(0, record.lockedUntil - Date.now());
    return Math.ceil(remaining / 1000);
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private readonly loginRateLimiter = new AdminLoginRateLimiter();

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly config: AppConfigService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Request an OTP. Purpose is inferred: an existing customer is "login",
   * an unknown mobile is "registration". The response tells the client which
   * screen to show next without leaking more than necessary.
   */
  async requestOtp(rawMobile: string, ip?: string) {
    const mobile = normalizeMobile(rawMobile);
    const existing = await this.customers.findByMobile(mobile);
    const purpose = existing ? 'login' : 'registration';
    const result = await this.otp.request(mobile, purpose);
    await this.audit.record({
      actorType: 'customer',
      action: AuditAction.OTP_REQUESTED,
      entity: 'otp',
      entityId: mobile,
      after: { purpose },
      ip,
    });
    return { ...result, isRegistered: !!existing };
  }

  /**
   * Verify an OTP. On success:
   *  - existing customer → issue access + refresh tokens (logged in),
   *  - new mobile        → issue a short-lived registration token to complete signup.
   */
  async verifyOtp(rawMobile: string, code: string, ip?: string) {
    const mobile = normalizeMobile(rawMobile);
    await this.otp.verify(mobile, code);
    await this.audit.record({
      actorType: 'customer',
      action: AuditAction.OTP_VERIFIED,
      entity: 'otp',
      entityId: mobile,
      ip,
    });

    const customer = await this.customers.findByMobile(mobile);
    if (customer) {
      const tokens = await this.tokens.issueForCustomer(customer.id);
      return {
        registered: true,
        ...tokens,
        customer: { id: customer.id, name: customer.name, mobile: customer.mobile },
      };
    }

    if (this.config.config.otp.devEcho) {
      const [firstVillage] = await this.db.select().from(villages).limit(1);
      const villageId = firstVillage?.id ?? (await this.db.select().from(villages).limit(1))[0]?.id;
      if (villageId) {
        const { customer, account } = await this.customers.createFromRegistration(
          {
            mobile,
            name: `User ${mobile.slice(-4)}`,
            villageId,
            dailyAmountRupees: 100,
          },
          { actorType: 'customer', ip },
        );
        const tokens = await this.tokens.issueForCustomer(customer.id);
        return {
          registered: true,
          ...tokens,
          customer: { id: customer.id, name: customer.name, mobile: customer.mobile },
          pigmyAccount: { id: account.id, accountNumber: account.accountNumber },
        };
      }
    }

    return {
      registered: false,
      registrationToken: this.tokens.signRegistrationToken(mobile),
    };
  }

  /** Complete registration for a mobile that just verified an OTP. */
  async register(registrationToken: string, dto: RegisterCustomerDto, ip?: string) {
    const { mobile } = this.tokens.verifyRegistrationToken(registrationToken);
    const { customer, account } = await this.customers.createFromRegistration(
      {
        mobile,
        name: dto.name,
        address: dto.address,
        villageId: dto.villageId,
        dailyAmountRupees: dto.dailyAmountRupees,
      },
      { actorType: 'customer', ip },
    );
    const tokens = await this.tokens.issueForCustomer(customer.id);
    return {
      ...tokens,
      customer: { id: customer.id, name: customer.name, mobile: customer.mobile },
      pigmyAccount: { id: account.id, accountNumber: account.accountNumber },
    };
  }

  async adminLogin(email: string, password: string, ip?: string) {
    const normalizedEmail = email.toLowerCase();

    // Check lockout
    if (this.loginRateLimiter.isLocked(normalizedEmail)) {
      const remaining = this.loginRateLimiter.lockoutRemaining(normalizedEmail);
      await this.audit.record({
        actorType: 'admin',
        action: AuditAction.ADMIN_LOCKOUT,
        entity: 'admin',
        entityId: normalizedEmail,
        after: { reason: 'account_locked', lockoutRemainingSeconds: remaining },
        ip,
      });
      throw new UnauthorizedException(
        `Account temporarily locked due to too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minutes.`,
      );
    }

    const [admin] = await this.db.select().from(admins).where(eq(admins.email, normalizedEmail)).limit(1);
    const ok = admin && admin.isActive && (await bcrypt.compare(password, admin.passwordHash));
    if (!ok) {
      // Record failed attempt
      const nowLocked = this.loginRateLimiter.recordFailure(normalizedEmail);
      const remaining = this.loginRateLimiter.lockoutRemaining(normalizedEmail);

      await this.audit.record({
        actorType: 'admin',
        action: AuditAction.ADMIN_LOGIN_FAILED,
        entity: 'admin',
        entityId: normalizedEmail,
        after: {
          reason: 'invalid_credentials',
          locked: nowLocked,
          lockoutRemainingSeconds: remaining,
        },
        ip,
      });

      if (nowLocked) {
        throw new UnauthorizedException(
          `Account locked due to ${5} failed login attempts. Try again in ${Math.ceil(remaining / 60)} minutes.`,
        );
      }
      // constant-ish response; do not reveal which part failed
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts on successful login
    this.loginRateLimiter.clear(normalizedEmail);

    const tokens = await this.tokens.issueForAdmin({
      sub: admin.id,
      role: admin.role,
      villages: admin.assignedVillages,
    });
    await this.audit.record({
      actorId: admin.id,
      actorType: 'admin',
      action: AuditAction.ADMIN_LOGIN,
      entity: 'admin',
      entityId: admin.id,
      ip,
    });
    return {
      ...tokens,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        assignedVillages: admin.assignedVillages,
      },
    };
  }

  async refresh(refreshToken: string, ip?: string) {
    const tokens = await this.tokens.rotate(refreshToken);
    await this.audit.record({
      actorType: 'system',
      action: AuditAction.TOKEN_REFRESHED,
      entity: 'refresh_token',
      ip,
    });
    return tokens;
  }

  async logout(refreshToken: string, user: AuthUser | undefined, ip?: string) {
    await this.tokens.revoke(refreshToken);
    await this.audit.record({
      actorId: user?.sub ?? null,
      actorType: user?.type ?? 'system',
      action: AuditAction.LOGOUT,
      ip,
    });
    return { success: true };
  }

  /** Lightweight "who am I" for the authenticated principal. */
  async me(user: AuthUser) {
    if (user.type === 'customer') {
      return { type: 'customer', ...(await this.customers.fullProfile(user.sub)) };
    }
    const [admin] = await this.db.select().from(admins).where(eq(admins.id, user.sub)).limit(1);
    if (!admin) throw new UnauthorizedException('Admin not found');
    return {
      type: 'admin',
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      assignedVillages: admin.assignedVillages,
    };
  }
}
