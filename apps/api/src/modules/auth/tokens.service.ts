import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { admins, refreshTokens } from '../../db/schema';
import type { AccessTokenPayload, AdminPrincipal } from '../../common/auth/auth-user';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class TokensService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  private signAccess(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, { expiresIn: this.config.config.jwt.accessTtl });
  }

  private async createRefreshToken(
    subjectId: string,
    subjectType: 'customer' | 'admin',
  ): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.config.jwt.refreshTtl * 1000);
    await this.db.insert(refreshTokens).values({
      subjectId,
      subjectType,
      tokenHash: sha256(raw),
      expiresAt,
    });
    return raw;
  }

  private async pair(payload: AccessTokenPayload): Promise<TokenPair> {
    const refreshToken = await this.createRefreshToken(payload.sub, payload.type);
    return {
      accessToken: this.signAccess(payload),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.config.jwt.accessTtl,
    };
  }

  issueForCustomer(customerId: string): Promise<TokenPair> {
    return this.pair({ sub: customerId, type: 'customer' });
  }

  issueForAdmin(admin: Pick<AdminPrincipal, 'sub' | 'role' | 'villages'>): Promise<TokenPair> {
    return this.pair({
      sub: admin.sub,
      type: 'admin',
      role: admin.role,
      villages: admin.villages,
    });
  }

  /** Short-lived token that authorizes completing registration for a verified mobile. */
  signRegistrationToken(mobile: string): string {
    return this.jwt.sign(
      { typ: 'registration', mobile },
      { expiresIn: this.config.config.otp.ttl },
    );
  }

  verifyRegistrationToken(token: string): { mobile: string } {
    try {
      const payload = this.jwt.verify<{ typ?: string; mobile?: string }>(token);
      if (payload.typ !== 'registration' || !payload.mobile) {
        throw new Error('bad token type');
      }
      return { mobile: payload.mobile };
    } catch {
      throw new UnauthorizedException('Invalid or expired registration token');
    }
  }

  /** Rotate a refresh token: revoke the old one and issue a fresh pair. */
  async rotate(rawRefresh: string): Promise<TokenPair> {
    const hash = sha256(rawRefresh);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, hash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) throw new UnauthorizedException('Invalid or expired refresh token');

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    if (row.subjectType === 'admin') {
      const [admin] = await this.db.select().from(admins).where(eq(admins.id, row.subjectId));
      if (!admin || !admin.isActive) throw new UnauthorizedException('Admin no longer active');
      return this.issueForAdmin({
        sub: admin.id,
        role: admin.role,
        villages: admin.assignedVillages,
      });
    }
    return this.issueForCustomer(row.subjectId);
  }

  async revoke(rawRefresh: string): Promise<void> {
    const hash = sha256(rawRefresh);
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)));
  }
}
