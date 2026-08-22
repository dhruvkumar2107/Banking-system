import {
  addMonths,
  allocatePayment,
  BPS_DIVISOR,
  flatInterestPaise,
  flatToApproxReducingBps,
  instalmentDueDate,
  maxEligiblePaise,
  outstandingFrom,
  processingFeePaise,
  quoteLoan,
  splitInstalments,
  type InstalmentState,
} from './loan-math';

/** ₹1 = 100 paise; these helpers keep the tests readable. */
const R = (rupees: number) => rupees * 100;

describe('loan-math', () => {
  describe('flatInterestPaise', () => {
    it('charges the flat rate on the original principal for the whole tenure', () => {
      // ₹10,000 at 12% p.a. flat for 12 months = ₹1,200
      expect(flatInterestPaise(R(10_000), 1_200, 12)).toBe(R(1_200));
      // half the tenure, half the interest
      expect(flatInterestPaise(R(10_000), 1_200, 6)).toBe(R(600));
      // double the tenure, double the interest (flat does NOT reduce)
      expect(flatInterestPaise(R(10_000), 1_200, 24)).toBe(R(2_400));
    });

    it('is linear in principal', () => {
      const one = flatInterestPaise(R(1_000), 1_200, 12);
      const ten = flatInterestPaise(R(10_000), 1_200, 12);
      expect(ten).toBe(one * 10);
    });

    it('returns 0 for non-positive inputs rather than a negative charge', () => {
      expect(flatInterestPaise(0, 1_200, 12)).toBe(0);
      expect(flatInterestPaise(R(1_000), 0, 12)).toBe(0);
      expect(flatInterestPaise(R(1_000), 1_200, 0)).toBe(0);
      expect(flatInterestPaise(-R(1_000), 1_200, 12)).toBe(0);
      expect(flatInterestPaise(R(1_000), -100, 12)).toBe(0);
    });

    it('floors, so the bank never charges a fractional paise', () => {
      // 7 paise at 1 bp for 1 month = 7*1*1/120000 → 0.0000583 → floors to 0
      expect(flatInterestPaise(7, 1, 1)).toBe(0);
      // A case with a genuine fraction: 100001 paise, 1200 bps, 1 month
      //   = 100001 * 1200 / 120000 = 1000.01 → 1000
      expect(flatInterestPaise(100_001, 1_200, 1)).toBe(1_000);
    });

    it('never returns a non-integer', () => {
      for (const p of [1, 999, 100_001, 7_777_777]) {
        for (const m of [1, 3, 7, 24]) {
          const i = flatInterestPaise(p, 1_237, m);
          expect(Number.isInteger(i)).toBe(true);
        }
      }
    });
  });

  describe('processingFeePaise', () => {
    it('takes the fee as a percentage of principal', () => {
      // 1% of ₹10,000 = ₹100
      expect(processingFeePaise(R(10_000), 100)).toBe(R(100));
      expect(processingFeePaise(R(50_000), 100)).toBe(R(500));
    });

    it('is zero when the fee is switched off', () => {
      expect(processingFeePaise(R(10_000), 0)).toBe(0);
    });

    it('floors', () => {
      // 1 bp of 12345 paise = 1.2345 → 1
      expect(processingFeePaise(12_345, 1)).toBe(1);
    });
  });

  describe('maxEligiblePaise', () => {
    it('caps borrowing at a multiple of savings', () => {
      // 20 000 bps = 2×
      expect(maxEligiblePaise(R(5_000), 20_000)).toBe(R(10_000));
      // 5 000 bps = 0.5×
      expect(maxEligiblePaise(R(5_000), 5_000)).toBe(R(2_500));
    });

    it('gives an empty account no borrowing power', () => {
      expect(maxEligiblePaise(0, 20_000)).toBe(0);
      expect(maxEligiblePaise(-100, 20_000)).toBe(0);
    });
  });

  describe('quoteLoan', () => {
    it('prices a clean 12-month loan the way the borrower would', () => {
      const q = quoteLoan(R(12_000), 1_200, 12, 100);
      expect(q.totalInterest).toBe(R(1_440)); // 12% of 12,000
      expect(q.totalPayable).toBe(R(13_440));
      expect(q.emiAmount).toBe(R(1_120)); // 13,440 / 12
      expect(q.processingFee).toBe(R(120)); // 1% of 12,000
      expect(q.netDisbursed).toBe(R(11_880)); // principal less the fee
    });

    it('keeps totalPayable = principal + interest exactly', () => {
      for (const p of [R(1_000), R(7_531), R(50_000), 123_457]) {
        for (const m of [3, 7, 12, 24]) {
          const q = quoteLoan(p, 1_437, m, 137);
          expect(q.totalPayable).toBe(q.principal + q.totalInterest);
        }
      }
    });

    it('never disburses more than the principal', () => {
      const q = quoteLoan(R(1_000), 1_200, 6, 5_000); // an absurd 50% fee
      expect(q.netDisbursed).toBe(R(500));
      expect(q.netDisbursed).toBeLessThanOrEqual(q.principal);
    });

    it('returns integers throughout', () => {
      const q = quoteLoan(123_457, 1_237, 7, 137);
      for (const v of [q.totalInterest, q.processingFee, q.totalPayable, q.emiAmount, q.netDisbursed]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    });
  });

  describe('splitInstalments', () => {
    it('produces exactly `tenureMonths` instalments', () => {
      expect(splitInstalments(R(13_440), 12)).toHaveLength(12);
      expect(splitInstalments(R(1_000), 3)).toHaveLength(3);
    });

    it('sums to totalPayable EXACTLY — the invariant the ledger depends on', () => {
      // Deliberately awkward numbers: primes, and totals that do not divide evenly.
      const cases: Array<[number, number]> = [
        [R(13_440), 12],
        [100_001, 7],
        [99_999, 24],
        [1_000_003, 13],
        [R(1_000), 3],
        [R(50_000) + 1, 24],
        [7, 7],
      ];
      for (const [total, months] of cases) {
        const parts = splitInstalments(total, months);
        expect(parts).toHaveLength(months);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    });

    it('makes every instalment except the last identical', () => {
      const parts = splitInstalments(100_001, 7);
      const allButLast = parts.slice(0, -1);
      expect(new Set(allButLast).size).toBe(1);
    });

    it('puts the rounding remainder on the FINAL instalment', () => {
      // 100 001 / 7 = 14285.857… → base 14285, remainder 6
      const parts = splitInstalments(100_001, 7);
      expect(parts[0]).toBe(14_285);
      expect(parts[6]).toBe(14_285 + 6);
      expect(parts[6]).toBeGreaterThan(parts[0]);
    });

    it('leaves every instalment positive', () => {
      for (const [total, months] of [[7, 7], [R(1_000), 24], [100_001, 13]] as Array<[number, number]>) {
        for (const amt of splitInstalments(total, months)) {
          expect(amt).toBeGreaterThan(0);
        }
      }
    });

    it('rejects a schedule it cannot build honestly', () => {
      expect(() => splitInstalments(R(1_000), 0)).toThrow(/at least 1/);
      expect(() => splitInstalments(R(1_000), -3)).toThrow(/at least 1/);
      // 6 paise cannot make 7 instalments of ≥1 paise
      expect(() => splitInstalments(6, 7)).toThrow(/1 paise per instalment/);
    });
  });

  describe('addMonths / instalmentDueDate', () => {
    it('advances whole months', () => {
      expect(addMonths(new Date('2026-01-15T00:00:00Z'), 1).getMonth()).toBe(1); // Feb
      expect(addMonths(new Date('2026-01-15T00:00:00Z'), 12).getFullYear()).toBe(2027);
    });

    it('clamps the day instead of rolling into the next month', () => {
      // 31 Jan + 1 month must be 28 Feb 2026 (not 3 March)
      const d = addMonths(new Date(2026, 0, 31), 1);
      expect(d.getMonth()).toBe(1); // February
      expect(d.getDate()).toBe(28);
    });

    it('lands on 29 Feb in a leap year', () => {
      const d = addMonths(new Date(2028, 0, 31), 1); // 2028 is a leap year
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(29);
    });

    it('handles 31 → 30-day months', () => {
      const d = addMonths(new Date(2026, 4, 31), 1); // 31 May + 1 → 30 Jun
      expect(d.getMonth()).toBe(5);
      expect(d.getDate()).toBe(30);
    });

    it('does not mutate its input', () => {
      const original = new Date(2026, 0, 31);
      const copy = new Date(original);
      addMonths(original, 5);
      expect(original.getTime()).toBe(copy.getTime());
    });

    it('numbers due dates from 1, one month apart', () => {
      const disbursed = new Date(2026, 0, 10);
      expect(instalmentDueDate(disbursed, 1).getMonth()).toBe(1); // Feb
      expect(instalmentDueDate(disbursed, 12).getFullYear()).toBe(2027);
      expect(instalmentDueDate(disbursed, 1).getDate()).toBe(10);
    });
  });

  describe('flatToApproxReducingBps', () => {
    it('roughly doubles a flat rate over a long tenure', () => {
      // 12% flat over 24 months ≈ 23% reducing
      const r = flatToApproxReducingBps(1_200, 24);
      expect(r).toBeGreaterThan(2_200);
      expect(r).toBeLessThan(2_400);
    });

    it('is a no-op for a single instalment', () => {
      expect(flatToApproxReducingBps(1_200, 1)).toBe(1_200);
    });

    it('is monotonic in tenure', () => {
      const three = flatToApproxReducingBps(1_200, 3);
      const twelve = flatToApproxReducingBps(1_200, 12);
      const twentyFour = flatToApproxReducingBps(1_200, 24);
      expect(three).toBeLessThan(twelve);
      expect(twelve).toBeLessThan(twentyFour);
    });
  });

  describe('allocatePayment', () => {
    const schedule = (...rows: Array<[number, number, number]>): InstalmentState[] =>
      rows.map(([no, due, paid]) => ({ id: `i${no}`, instalmentNo: no, amountDue: due, amountPaid: paid }));

    it('clears the oldest arrears first', () => {
      const insts = schedule([1, 1_000, 0], [2, 1_000, 0], [3, 1_000, 0]);
      const { allocations, unapplied } = allocatePayment(insts, 1_500);
      expect(unapplied).toBe(0);
      expect(allocations).toHaveLength(2);
      expect(allocations[0]).toMatchObject({ instalmentNo: 1, applied: 1_000, settled: true });
      expect(allocations[1]).toMatchObject({ instalmentNo: 2, applied: 500, settled: false });
    });

    it('applies to the schedule order regardless of the input order', () => {
      const insts = schedule([3, 1_000, 0], [1, 1_000, 0], [2, 1_000, 0]);
      const { allocations } = allocatePayment(insts, 1_000);
      expect(allocations[0].instalmentNo).toBe(1);
    });

    it('skips instalments that are already settled', () => {
      const insts = schedule([1, 1_000, 1_000], [2, 1_000, 0]);
      const { allocations } = allocatePayment(insts, 500);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].instalmentNo).toBe(2);
    });

    it('resumes a part-paid instalment rather than double-charging it', () => {
      const insts = schedule([1, 1_000, 400], [2, 1_000, 0]);
      const { allocations } = allocatePayment(insts, 600);
      expect(allocations).toHaveLength(1);
      expect(allocations[0]).toMatchObject({
        instalmentNo: 1,
        applied: 600,
        amountPaidAfter: 1_000,
        settled: true,
      });
    });

    it('reports money the schedule cannot absorb instead of swallowing it', () => {
      const insts = schedule([1, 1_000, 0], [2, 1_000, 0]);
      const { allocations, unapplied } = allocatePayment(insts, 2_500);
      expect(allocations).toHaveLength(2);
      expect(unapplied).toBe(500);
    });

    it('applies exactly the payment amount, never more', () => {
      const insts = schedule([1, 1_000, 0], [2, 1_000, 0], [3, 1_000, 0]);
      for (const payment of [1, 999, 1_000, 1_001, 2_999, 3_000]) {
        const { allocations, unapplied } = allocatePayment(insts, payment);
        const applied = allocations.reduce((s, a) => s + a.applied, 0);
        expect(applied + unapplied).toBe(payment);
        expect(applied).toBeLessThanOrEqual(payment);
      }
    });

    it('does nothing for a non-positive payment', () => {
      const insts = schedule([1, 1_000, 0]);
      expect(allocatePayment(insts, 0).allocations).toHaveLength(0);
      expect(allocatePayment(insts, -500).allocations).toHaveLength(0);
    });

    it('does not mutate the instalments it is given', () => {
      const insts = schedule([1, 1_000, 0]);
      allocatePayment(insts, 1_000);
      expect(insts[0].amountPaid).toBe(0);
    });
  });

  describe('outstandingFrom', () => {
    it('sums what is still owed', () => {
      expect(
        outstandingFrom([
          { amountDue: 1_000, amountPaid: 1_000 },
          { amountDue: 1_000, amountPaid: 400 },
          { amountDue: 1_000, amountPaid: 0 },
        ]),
      ).toBe(1_600);
    });

    it('is 0 for a fully repaid loan', () => {
      expect(outstandingFrom([{ amountDue: 500, amountPaid: 500 }])).toBe(0);
    });

    it('never goes negative on an overpaid instalment', () => {
      expect(outstandingFrom([{ amountDue: 500, amountPaid: 900 }])).toBe(0);
    });

    it('is 0 for an empty schedule', () => {
      expect(outstandingFrom([])).toBe(0);
    });
  });

  describe('end-to-end invariant: quote → schedule → full repayment closes at exactly zero', () => {
    it('holds across a spread of awkward principals and tenures', () => {
      const principals = [R(1_000), R(1_337), R(7_531), R(12_000), R(50_000), 123_457];
      const tenures = [3, 5, 7, 12, 18, 24];
      const rates = [0, 900, 1_200, 1_437, 2_400];

      for (const p of principals) {
        for (const m of tenures) {
          for (const rate of rates) {
            const q = quoteLoan(p, rate, m, 100);
            const parts = splitInstalments(q.totalPayable, m);

            // The schedule must reconstitute the payable amount to the paise.
            expect(parts.reduce((a, b) => a + b, 0)).toBe(q.totalPayable);

            // Paying every instalment in full must land the balance on exactly 0.
            let insts: InstalmentState[] = parts.map((due, i) => ({
              id: `i${i + 1}`,
              instalmentNo: i + 1,
              amountDue: due,
              amountPaid: 0,
            }));
            const { allocations, unapplied } = allocatePayment(insts, q.totalPayable);
            expect(unapplied).toBe(0);

            const byId = new Map(allocations.map((a) => [a.id, a]));
            insts = insts.map((i) => ({ ...i, amountPaid: byId.get(i.id)?.amountPaidAfter ?? i.amountPaid }));
            expect(outstandingFrom(insts)).toBe(0);
            expect(insts.every((i) => i.amountPaid === i.amountDue)).toBe(true);
          }
        }
      }
    });

    it('also closes at zero when paid EMI by EMI rather than in one lump', () => {
      const q = quoteLoan(R(7_531), 1_437, 7, 100);
      const parts = splitInstalments(q.totalPayable, 7);
      let insts: InstalmentState[] = parts.map((due, i) => ({
        id: `i${i + 1}`,
        instalmentNo: i + 1,
        amountDue: due,
        amountPaid: 0,
      }));

      for (const part of parts) {
        const { allocations, unapplied } = allocatePayment(insts, part);
        expect(unapplied).toBe(0);
        const byId = new Map(allocations.map((a) => [a.id, a]));
        insts = insts.map((i) => ({ ...i, amountPaid: byId.get(i.id)?.amountPaidAfter ?? i.amountPaid }));
      }
      expect(outstandingFrom(insts)).toBe(0);
    });
  });

  it('exposes BPS_DIVISOR as 10 000 so rates read as basis points everywhere', () => {
    expect(BPS_DIVISOR).toBe(10_000);
  });
});
