import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { loanSettings, type LoanSettings } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { withRupees } from '../../common/money';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { flatToApproxReducingBps } from './loan-math';
import type { UpdateLoanSettingsDto } from './loans.dto';

/** The bank's loan product defaults, used until an admin saves a settings row. */
export const DEFAULT_LOAN_SETTINGS = {
  enabled: true,
  minAmountPaise: 100_000, // ₹1,000
  maxAmountPaise: 5_000_000, // ₹50,000
  interestRateBps: 1_200, // 12.00% p.a. flat
  minTenureMonths: 3,
  maxTenureMonths: 24,
  maxLoanToBalanceBps: 20_000, // borrow up to 2× your savings
  processingFeeBps: 100, // 1.00% of principal
  minSavingsPaise: 50_000, // ₹500 must already be saved
} as const;

export interface EffectiveLoanSettings {
  enabled: boolean;
  minAmountPaise: number;
  maxAmountPaise: number;
  interestRateBps: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  maxLoanToBalanceBps: number;
  processingFeeBps: number;
  minSavingsPaise: number;
}

/**
 * Owns the loan product parameters. Same shape as SchemeService for savings:
 * at most one meaningful row, `current()` returns the newest and falls back to
 * the built-in defaults, so a fresh database still has a usable product.
 *
 * Changing these NEVER re-prices an existing loan — the rate, tenure and fee are
 * snapshotted onto the loan row when it is approved.
 */
@Injectable()
export class LoanSettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  /** The active settings, or the built-in defaults if none has been saved. */
  async current(runner: AppDatabase | AppTransaction = this.db): Promise<EffectiveLoanSettings> {
    const [row] = await runner
      .select()
      .from(loanSettings)
      .orderBy(desc(loanSettings.updatedAt))
      .limit(1);
    if (!row) return { ...DEFAULT_LOAN_SETTINGS };
    return {
      enabled: row.enabled,
      minAmountPaise: row.minAmountPaise,
      maxAmountPaise: row.maxAmountPaise,
      interestRateBps: row.interestRateBps,
      minTenureMonths: row.minTenureMonths,
      maxTenureMonths: row.maxTenureMonths,
      maxLoanToBalanceBps: row.maxLoanToBalanceBps,
      processingFeeBps: row.processingFeeBps,
      minSavingsPaise: row.minSavingsPaise,
    };
  }

  /**
   * Settings as an API payload, with the percentages spelled out and — crucially
   * — the comparable reducing-balance rate, so the borrower isn't misled by a
   * flat headline number.
   */
  async describe() {
    const s = await this.current();
    return {
      enabled: s.enabled,
      minAmount: withRupees(s.minAmountPaise),
      maxAmount: withRupees(s.maxAmountPaise),
      interestRateBps: s.interestRateBps,
      interestRatePercent: s.interestRateBps / 100,
      interestBasis: 'flat rate on the original principal, repaid in equal monthly instalments',
      approxReducingRatePercent:
        flatToApproxReducingBps(s.interestRateBps, s.maxTenureMonths) / 100,
      minTenureMonths: s.minTenureMonths,
      maxTenureMonths: s.maxTenureMonths,
      maxLoanToBalanceBps: s.maxLoanToBalanceBps,
      maxLoanToBalanceMultiple: s.maxLoanToBalanceBps / 10_000,
      processingFeeBps: s.processingFeeBps,
      processingFeePercent: s.processingFeeBps / 100,
      minSavings: withRupees(s.minSavingsPaise),
    };
  }

  /**
   * Update the loan product (superadmin). Upserts the single row and audits the
   * before/after. Validation is deliberately strict — a bad max/min pair here
   * would make every future application either impossible or unbounded.
   */
  async update(dto: UpdateLoanSettingsDto, actor: AdminPrincipal, ip?: string) {
    const [existing] = await this.db
      .select()
      .from(loanSettings)
      .orderBy(desc(loanSettings.updatedAt))
      .limit(1);

    const next: EffectiveLoanSettings = {
      enabled: dto.enabled ?? existing?.enabled ?? DEFAULT_LOAN_SETTINGS.enabled,
      minAmountPaise:
        dto.minAmountPaise ?? existing?.minAmountPaise ?? DEFAULT_LOAN_SETTINGS.minAmountPaise,
      maxAmountPaise:
        dto.maxAmountPaise ?? existing?.maxAmountPaise ?? DEFAULT_LOAN_SETTINGS.maxAmountPaise,
      interestRateBps:
        dto.interestRateBps ?? existing?.interestRateBps ?? DEFAULT_LOAN_SETTINGS.interestRateBps,
      minTenureMonths:
        dto.minTenureMonths ?? existing?.minTenureMonths ?? DEFAULT_LOAN_SETTINGS.minTenureMonths,
      maxTenureMonths:
        dto.maxTenureMonths ?? existing?.maxTenureMonths ?? DEFAULT_LOAN_SETTINGS.maxTenureMonths,
      maxLoanToBalanceBps:
        dto.maxLoanToBalanceBps ??
        existing?.maxLoanToBalanceBps ??
        DEFAULT_LOAN_SETTINGS.maxLoanToBalanceBps,
      processingFeeBps:
        dto.processingFeeBps ?? existing?.processingFeeBps ?? DEFAULT_LOAN_SETTINGS.processingFeeBps,
      minSavingsPaise:
        dto.minSavingsPaise ?? existing?.minSavingsPaise ?? DEFAULT_LOAN_SETTINGS.minSavingsPaise,
    };

    if (next.minAmountPaise < 1) {
      throw new BadRequestException('minAmountPaise must be at least 1');
    }
    if (next.maxAmountPaise < next.minAmountPaise) {
      throw new BadRequestException('maxAmountPaise cannot be below minAmountPaise');
    }
    if (next.minTenureMonths < 1) {
      throw new BadRequestException('minTenureMonths must be at least 1');
    }
    if (next.maxTenureMonths < next.minTenureMonths) {
      throw new BadRequestException('maxTenureMonths cannot be below minTenureMonths');
    }
    // A flat schedule needs at least 1 paise per instalment to be representable.
    if (next.minAmountPaise < next.maxTenureMonths) {
      throw new BadRequestException(
        'minAmountPaise must be at least maxTenureMonths so every instalment is at least 1 paise',
      );
    }

    let saved: LoanSettings;
    if (existing) {
      [saved] = await this.db
        .update(loanSettings)
        .set({ ...next, updatedById: actor.sub, updatedAt: new Date() })
        .where(eq(loanSettings.id, existing.id))
        .returning();
    } else {
      [saved] = await this.db
        .insert(loanSettings)
        .values({ ...next, updatedById: actor.sub })
        .returning();
    }

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.LOAN_SETTINGS_UPDATED,
      entity: 'loan_settings',
      entityId: saved.id,
      before: existing
        ? {
            enabled: existing.enabled,
            minAmountPaise: existing.minAmountPaise,
            maxAmountPaise: existing.maxAmountPaise,
            interestRateBps: existing.interestRateBps,
            minTenureMonths: existing.minTenureMonths,
            maxTenureMonths: existing.maxTenureMonths,
            maxLoanToBalanceBps: existing.maxLoanToBalanceBps,
            processingFeeBps: existing.processingFeeBps,
            minSavingsPaise: existing.minSavingsPaise,
          }
        : { defaults: true, ...DEFAULT_LOAN_SETTINGS },
      after: next,
      ip,
    });

    return this.describe();
  }
}
