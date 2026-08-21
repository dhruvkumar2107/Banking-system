import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DATABASE } from '../../db/database.constants';
import type { AppDatabase, AppTransaction } from '../../db/client';
import { schemeSettings, type SchemeSettings } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import type { UpdateSchemeDto } from './withdrawals.dto';

/** Basis points per whole unit — 10 000 bps = 100%. */
export const BPS_DIVISOR = 10_000;
const DAYS_PER_YEAR = 365;

/** The bank's defaults, used until an admin saves a scheme row. */
export const DEFAULT_SCHEME = {
  termDays: 365,
  interestRateBps: 400, // 4.00% p.a.
  earlyWithdrawalAllowed: true,
  earlyPenaltyBps: 100, // 1.00% of the withdrawn principal
  minBalancePaise: 0,
} as const;

export interface EffectiveScheme {
  termDays: number;
  interestRateBps: number;
  earlyWithdrawalAllowed: boolean;
  earlyPenaltyBps: number;
  minBalancePaise: number;
}

/**
 * Simple interest on a principal held for a number of days, in paise.
 *
 *   interest = principal × rate × days / (10 000 × 365)
 *
 * Integer-only: the division is floored so the bank never credits a fraction of
 * a paise, and rounding can only ever favour the bank by <1 paise. Pure function
 * — no DB, no clock — so the arithmetic is unit-testable in isolation.
 */
export function simpleInterestPaise(
  principalPaise: number,
  rateBps: number,
  days: number,
): number {
  if (principalPaise <= 0 || rateBps <= 0 || days <= 0) return 0;
  return Math.floor((principalPaise * rateBps * days) / (BPS_DIVISOR * DAYS_PER_YEAR));
}

/** Penalty in paise for withdrawing `principalPaise` before maturity. */
export function penaltyPaise(principalPaise: number, penaltyBps: number): number {
  if (principalPaise <= 0 || penaltyBps <= 0) return 0;
  return Math.floor((principalPaise * penaltyBps) / BPS_DIVISOR);
}

/** Whole days elapsed between two instants (floored, never negative). */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Add `days` to a date, returning a new Date. */
export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Owns the bank's scheme parameters (term, interest rate, early-withdrawal
 * rules) and the interest arithmetic derived from them.
 *
 * There is at most one meaningful settings row; `current()` returns the newest
 * one and falls back to DEFAULT_SCHEME when the table is empty, so the system
 * always has a usable scheme even on a fresh database.
 */
@Injectable()
export class SchemeService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly audit: AuditService,
  ) {}

  /** The active scheme, or the built-in defaults if none has been saved. */
  async current(runner: AppDatabase | AppTransaction = this.db): Promise<EffectiveScheme> {
    const [row] = await runner
      .select()
      .from(schemeSettings)
      .orderBy(desc(schemeSettings.updatedAt))
      .limit(1);
    if (!row) return { ...DEFAULT_SCHEME };
    return {
      termDays: row.termDays,
      interestRateBps: row.interestRateBps,
      earlyWithdrawalAllowed: row.earlyWithdrawalAllowed,
      earlyPenaltyBps: row.earlyPenaltyBps,
      minBalancePaise: row.minBalancePaise,
    };
  }

  /** Scheme as an API payload, including a human-readable rate. */
  async describe() {
    const s = await this.current();
    return {
      termDays: s.termDays,
      interestRateBps: s.interestRateBps,
      interestRatePercent: s.interestRateBps / 100,
      earlyWithdrawalAllowed: s.earlyWithdrawalAllowed,
      earlyPenaltyBps: s.earlyPenaltyBps,
      earlyPenaltyPercent: s.earlyPenaltyBps / 100,
      minBalance: s.minBalancePaise,
      interestBasis: 'simple interest on the balance held, credited at maturity',
    };
  }

  /**
   * Update the scheme (superadmin). Upserts the single settings row and audits
   * the before/after. Only affects accounts opened AFTER this change — existing
   * accounts keep the terms snapshotted at their opening.
   */
  async update(dto: UpdateSchemeDto, actor: AdminPrincipal, ip?: string) {
    if (dto.termDays !== undefined && dto.termDays < 1) {
      throw new BadRequestException('termDays must be at least 1');
    }
    if (dto.interestRateBps !== undefined && (dto.interestRateBps < 0 || dto.interestRateBps > 5_000)) {
      throw new BadRequestException('interestRateBps must be between 0 and 5000 (0–50% p.a.)');
    }
    if (dto.earlyPenaltyBps !== undefined && (dto.earlyPenaltyBps < 0 || dto.earlyPenaltyBps > 5_000)) {
      throw new BadRequestException('earlyPenaltyBps must be between 0 and 5000 (0–50%)');
    }

    const [existing] = await this.db
      .select()
      .from(schemeSettings)
      .orderBy(desc(schemeSettings.updatedAt))
      .limit(1);

    const next = {
      termDays: dto.termDays ?? existing?.termDays ?? DEFAULT_SCHEME.termDays,
      interestRateBps:
        dto.interestRateBps ?? existing?.interestRateBps ?? DEFAULT_SCHEME.interestRateBps,
      earlyWithdrawalAllowed:
        dto.earlyWithdrawalAllowed ??
        existing?.earlyWithdrawalAllowed ??
        DEFAULT_SCHEME.earlyWithdrawalAllowed,
      earlyPenaltyBps:
        dto.earlyPenaltyBps ?? existing?.earlyPenaltyBps ?? DEFAULT_SCHEME.earlyPenaltyBps,
      minBalancePaise:
        dto.minBalancePaise ?? existing?.minBalancePaise ?? DEFAULT_SCHEME.minBalancePaise,
    };

    let saved: SchemeSettings;
    if (existing) {
      [saved] = await this.db
        .update(schemeSettings)
        .set({ ...next, updatedById: actor.sub, updatedAt: new Date() })
        .where(eq(schemeSettings.id, existing.id))
        .returning();
    } else {
      [saved] = await this.db
        .insert(schemeSettings)
        .values({ ...next, updatedById: actor.sub })
        .returning();
    }

    await this.audit.record({
      actorId: actor.sub,
      actorType: 'admin',
      action: AuditAction.SCHEME_UPDATED,
      entity: 'scheme_settings',
      entityId: saved.id,
      before: existing
        ? {
            termDays: existing.termDays,
            interestRateBps: existing.interestRateBps,
            earlyWithdrawalAllowed: existing.earlyWithdrawalAllowed,
            earlyPenaltyBps: existing.earlyPenaltyBps,
            minBalancePaise: existing.minBalancePaise,
          }
        : { defaults: true, ...DEFAULT_SCHEME },
      after: next,
      ip,
    });

    return this.describe();
  }
}
