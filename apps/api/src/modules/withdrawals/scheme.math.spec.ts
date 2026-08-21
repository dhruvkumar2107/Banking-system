import {
  addDays,
  BPS_DIVISOR,
  daysBetween,
  DEFAULT_SCHEME,
  penaltyPaise,
  simpleInterestPaise,
} from './scheme.service';

/**
 * The interest arithmetic is money-critical and pure, so it is tested on its own
 * — no database, no clock. Every assertion is in paise (integers): if any of
 * these start returning fractions, the ledger's integer contract is broken.
 */
describe('scheme math', () => {
  describe('simpleInterestPaise', () => {
    it('computes a full year at the default rate', () => {
      // ₹10,000 = 1_000_000 paise for 365 days @ 4.00% p.a. → ₹400
      expect(simpleInterestPaise(1_000_000, 400, 365)).toBe(40_000);
    });

    it('is proportional to the days held', () => {
      const year = simpleInterestPaise(1_000_000, 400, 365);
      const half = simpleInterestPaise(1_000_000, 400, 182);
      // 182/365 of a year, floored
      expect(half).toBe(Math.floor((1_000_000 * 400 * 182) / (BPS_DIVISOR * 365)));
      expect(half).toBeLessThan(year);
    });

    it('always returns whole paise, floored in the bank’s favour', () => {
      // A deliberately awkward principal that cannot divide evenly.
      const i = simpleInterestPaise(12_345, 437, 91);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBe(Math.floor((12_345 * 437 * 91) / (BPS_DIVISOR * 365)));
    });

    it('returns 0 for non-positive principal, rate or days', () => {
      expect(simpleInterestPaise(0, 400, 365)).toBe(0);
      expect(simpleInterestPaise(-1_000, 400, 365)).toBe(0);
      expect(simpleInterestPaise(1_000_000, 0, 365)).toBe(0);
      expect(simpleInterestPaise(1_000_000, 400, 0)).toBe(0);
      expect(simpleInterestPaise(1_000_000, 400, -5)).toBe(0);
    });

    it('never returns more than the principal at sane scheme limits', () => {
      // 50% p.a. (the SchemeService ceiling) for one term.
      expect(simpleInterestPaise(1_000_000, 5_000, 365)).toBe(500_000);
    });
  });

  describe('penaltyPaise', () => {
    it('charges the default 1% of the withdrawn principal', () => {
      expect(penaltyPaise(1_000_000, 100)).toBe(10_000); // ₹100 on ₹10,000
    });

    it('is 0 when the scheme has no penalty', () => {
      expect(penaltyPaise(1_000_000, 0)).toBe(0);
    });

    it('floors to whole paise', () => {
      const p = penaltyPaise(999, 100); // 9.99 paise
      expect(p).toBe(9);
      expect(Number.isInteger(p)).toBe(true);
    });

    it('returns 0 for a non-positive principal', () => {
      expect(penaltyPaise(0, 100)).toBe(0);
      expect(penaltyPaise(-500, 100)).toBe(0);
    });
  });

  describe('daysBetween', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');

    it('counts whole elapsed days', () => {
      expect(daysBetween(base, new Date('2026-01-11T00:00:00.000Z'))).toBe(10);
    });

    it('floors a partial day rather than rounding up', () => {
      expect(daysBetween(base, new Date('2026-01-02T23:59:00.000Z'))).toBe(1);
    });

    it('never goes negative when the dates are reversed', () => {
      expect(daysBetween(new Date('2026-02-01T00:00:00.000Z'), base)).toBe(0);
      expect(daysBetween(base, base)).toBe(0);
    });
  });

  describe('addDays', () => {
    it('projects the maturity date one term out', () => {
      const opened = new Date('2026-01-01T10:00:00.000Z');
      const maturity = addDays(opened, DEFAULT_SCHEME.termDays);
      expect(daysBetween(opened, maturity)).toBe(365);
    });

    it('does not mutate the input date', () => {
      const opened = new Date('2026-01-01T00:00:00.000Z');
      const snapshot = opened.getTime();
      addDays(opened, 30);
      expect(opened.getTime()).toBe(snapshot);
    });

    it('supports backdating with a negative offset', () => {
      const now = new Date('2026-03-01T00:00:00.000Z');
      expect(daysBetween(addDays(now, -10), now)).toBe(10);
    });
  });

  describe('DEFAULT_SCHEME', () => {
    it('matches the Indian pigmy defaults documented for the bank', () => {
      expect(DEFAULT_SCHEME).toEqual({
        termDays: 365,
        interestRateBps: 400, // 4.00% p.a.
        earlyWithdrawalAllowed: true,
        earlyPenaltyBps: 100, // 1.00%
        minBalancePaise: 0,
      });
    });
  });
});
