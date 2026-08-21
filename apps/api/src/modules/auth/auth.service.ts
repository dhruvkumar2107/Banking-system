import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { admins } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CustomersService } from '../customers/customers.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { normalizeMobile, type RegisterCustomerDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
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
    const [admin] = await this.db.select().from(admins).where(eq(admins.email, email.toLowerCase())).limit(1);
    const ok = admin && admin.isActive && (await bcrypt.compare(password, admin.passwordHash));
    if (!ok) {
      // constant-ish response; do not reveal which part failed
      throw new UnauthorizedException('Invalid credentials');
    }
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
