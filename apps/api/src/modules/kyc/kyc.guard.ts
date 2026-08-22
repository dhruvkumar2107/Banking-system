import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase } from '../../db/client';
import { customers } from '../../db/schema';
import type { AuthUser } from '../../common/auth/auth-user';
import { kycPasses } from './kyc.service';

export const REQUIRES_KYC_KEY = 'requiresKyc';

/**
 * Mark a route as requiring completed KYC. Applied to every money-moving
 * customer route: deposits, loan applications and withdrawal requests.
 *
 * Read-only routes are deliberately left open so a customer whose KYC is pending
 * can still see their dashboard, their KYC status and what they need to fix.
 */
export const RequiresKyc = () => SetMetadata(REQUIRES_KYC_KEY, true);

/**
 * Enforces @RequiresKyc(). Registered globally in AppModule after RolesGuard, so
 * req.user is populated by the time it runs.
 *
 * Only customer principals are gated. An admin acting on a customer's behalf at
 * the branch counter is not blocked — an admin has already seen the person and
 * their papers, and blocking them would make the bypass feature unusable.
 *
 * The 403 body carries a machine-readable `code` and the current `stage` so the
 * app can route the customer straight into the KYC flow instead of showing a
 * dead-end error.
 */
@Injectable()
export class KycVerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: AppDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRES_KYC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    // Not a customer (admin, or an unauthenticated @Public route): not our gate.
    if (!user || user.type !== 'customer') return true;

    const [row] = await this.db
      .select({ stage: customers.kycStage })
      .from(customers)
      .where(eq(customers.id, user.sub))
      .limit(1);

    // Fail closed: a token for a customer that no longer exists gets nothing.
    if (!row) {
      throw new ForbiddenException({
        error: 'KycRequired',
        code: 'KYC_REQUIRED',
        stage: 'not_started',
        message: 'Complete your KYC to use this service.',
      });
    }

    if (kycPasses(row.stage)) return true;

    throw new ForbiddenException({
      error: 'KycRequired',
      code: 'KYC_REQUIRED',
      stage: row.stage,
      message:
        row.stage === 'submitted'
          ? 'Your KYC is still under review. You can transact as soon as it is approved.'
          : row.stage === 'rejected'
            ? 'Your KYC was not accepted. Please submit it again before transacting.'
            : 'Complete your KYC — photo, Aadhaar and nominee — before transacting.',
    });
  }
}
