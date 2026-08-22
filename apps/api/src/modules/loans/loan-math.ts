/**
 * Flat-rate loan arithmetic. Everything here is a pure integer function on paise
 * — no DB, no clock, no floats — so the money maths is unit-testable in isolation
 * and can never introduce a fractional paise.
 *
 * "Flat rate" is what village co-operatives actually quote: interest is charged
 * on the ORIGINAL principal for the whole tenure, not on the reducing balance.
 * It makes the EMI trivially predictable, which is the point when the borrower is
 * doing the sum in their head:
 *
 *   totalInterest = principal × rate × months / (10 000 × 12)
 *   totalPayable  = principal + totalInterest
 *   EMI           = totalPayable / months
 *
 * (A flat rate is dearer than the same nominal rate on a reducing balance;
 * `flatToApproxReducingBps` exists so the UI can show the borrower the
 * comparable figure rather than letting the headline number mislead them.)
 */

/** Basis points per whole unit — 10 000 bps = 100%. */
export const BPS_DIVISOR = 10_000;
const MONTHS_PER_YEAR = 12;

/**
 * Total interest over the whole tenure, in paise.
 *
 * Floored, so the bank never charges a fraction of a paise and rounding can only
 * ever favour the borrower by <1 paise.
 */
export function flatInterestPaise(
  principalPaise: number,
  rateBps: number,
  tenureMonths: number,
): number {
  if (principalPaise <= 0 || rateBps <= 0 || tenureMonths <= 0) return 0;
  return Math.floor(
    (principalPaise * rateBps * tenureMonths) / (BPS_DIVISOR * MONTHS_PER_YEAR),
  );
}

/** One-off processing fee in paise, deducted from the disbursed amount. */
export function processingFeePaise(principalPaise: number, feeBps: number): number {
  if (principalPaise <= 0 || feeBps <= 0) return 0;
  return Math.floor((principalPaise * feeBps) / BPS_DIVISOR);
}

/**
 * The largest principal this balance can support, given a loan-to-balance cap in
 * basis points (20 000 bps = borrow up to 2× your savings).
 */
export function maxEligiblePaise(balancePaise: number, maxLoanToBalanceBps: number): number {
  if (balancePaise <= 0 || maxLoanToBalanceBps <= 0) return 0;
  return Math.floor((balancePaise * maxLoanToBalanceBps) / BPS_DIVISOR);
}

export interface LoanQuote {
  principal: number;
  tenureMonths: number;
  interestRateBps: number;
  totalInterest: number;
  processingFee: number;
  /** principal + interest — what the borrower repays in instalments. */
  totalPayable: number;
  /** The steady monthly instalment. The final one absorbs the rounding paise. */
  emiAmount: number;
  /** Cash actually handed over: principal less the processing fee. */
  netDisbursed: number;
}

/**
 * Price a loan. Pure — the caller supplies the terms, so this same function
 * powers both the customer's "what would this cost?" preview and the figures
 * snapshotted onto the loan at approval.
 */
export function quoteLoan(
  principalPaise: number,
  rateBps: number,
  tenureMonths: number,
  processingFeeBps: number,
): LoanQuote {
  const totalInterest = flatInterestPaise(principalPaise, rateBps, tenureMonths);
  const processingFee = processingFeePaise(principalPaise, processingFeeBps);
  const totalPayable = principalPaise + totalInterest;
  const emiAmount = tenureMonths > 0 ? Math.floor(totalPayable / tenureMonths) : 0;
  return {
    principal: principalPaise,
    tenureMonths,
    interestRateBps: rateBps,
    totalInterest,
    processingFee,
    totalPayable,
    emiAmount,
    netDisbursed: Math.max(0, principalPaise - processingFee),
  };
}

/**
 * Split `totalPayable` into exactly `tenureMonths` instalments that sum to it.
 *
 * Every instalment is the floored EMI except the LAST, which absorbs the
 * remainder paise. That is the standard Indian lending convention — the borrower
 * sees one round figure on the schedule and a slightly different final payment —
 * and, more importantly, it makes `sum(amounts) === totalPayable` an invariant.
 * Distributing the remainder any other way risks a residual balance that leaves
 * a fully-repaid loan permanently open.
 */
export function splitInstalments(totalPayable: number, tenureMonths: number): number[] {
  if (tenureMonths <= 0) throw new Error('tenureMonths must be at least 1');
  if (totalPayable < tenureMonths) {
    throw new Error('totalPayable must be at least 1 paise per instalment');
  }
  const base = Math.floor(totalPayable / tenureMonths);
  const amounts = new Array<number>(tenureMonths).fill(base);
  amounts[tenureMonths - 1] = totalPayable - base * (tenureMonths - 1);
  return amounts;
}

/**
 * Add whole months to a date, clamping the day so 31 Jan + 1 month lands on
 * 28/29 Feb rather than rolling into March (which is what a naive setMonth does).
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTarget));
  return d;
}

/** Due date of instalment `n` (1-based), counting whole months from disbursal. */
export function instalmentDueDate(disbursedAt: Date, instalmentNo: number): Date {
  return addMonths(disbursedAt, instalmentNo);
}

/**
 * The approximate reducing-balance rate equivalent to a given flat rate — the
 * honest comparison figure to show a borrower, since a flat rate roughly doubles
 * once expressed the way banks quote term loans.
 *
 *   reducing ≈ flat × 2n / (n + 1)     for n instalments
 */
export function flatToApproxReducingBps(flatRateBps: number, tenureMonths: number): number {
  if (flatRateBps <= 0 || tenureMonths <= 1) return flatRateBps;
  return Math.round((flatRateBps * 2 * tenureMonths) / (tenureMonths + 1));
}

/**
 * Allocate a payment across instalments oldest-first, which is how a counter
 * clerk actually applies cash: clear the earliest arrears, then the current
 * month, and leave any excess as a part-payment against the next one.
 *
 * Pure: takes the current state and returns the allocation, so the service can
 * validate the whole thing before writing a single row.
 */
export interface InstalmentState {
  id: string;
  instalmentNo: number;
  amountDue: number;
  amountPaid: number;
}

export interface Allocation {
  id: string;
  instalmentNo: number;
  /** Paise applied to this instalment by this payment. */
  applied: number;
  /** Cumulative paid after applying. */
  amountPaidAfter: number;
  /** True when this payment settles the instalment in full. */
  settled: boolean;
}

export function allocatePayment(
  instalments: InstalmentState[],
  paymentPaise: number,
): { allocations: Allocation[]; unapplied: number } {
  if (paymentPaise <= 0) return { allocations: [], unapplied: 0 };
  let left = paymentPaise;
  const allocations: Allocation[] = [];

  const ordered = [...instalments].sort((a, b) => a.instalmentNo - b.instalmentNo);
  for (const inst of ordered) {
    if (left <= 0) break;
    const owing = inst.amountDue - inst.amountPaid;
    if (owing <= 0) continue;
    const applied = Math.min(owing, left);
    left -= applied;
    allocations.push({
      id: inst.id,
      instalmentNo: inst.instalmentNo,
      applied,
      amountPaidAfter: inst.amountPaid + applied,
      settled: inst.amountPaid + applied >= inst.amountDue,
    });
  }

  // `unapplied` is money the schedule cannot absorb — i.e. an overpayment past
  // the final instalment. The caller rejects it rather than silently keeping it.
  return { allocations, unapplied: left };
}

/** Total still owed across a schedule. Never negative. */
export function outstandingFrom(instalments: Pick<InstalmentState, 'amountDue' | 'amountPaid'>[]): number {
  return Math.max(
    0,
    instalments.reduce((sum, i) => sum + (i.amountDue - i.amountPaid), 0),
  );
}
