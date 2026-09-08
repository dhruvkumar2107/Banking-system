/**
 * Money helpers. Internally, ALL amounts are integer paise (1 rupee = 100 paise).
 * Never use floating point for money.
 *
 * This module is the single source of truth for monetary operations.
 * Every monetary calculation MUST go through these helpers.
 */
export const PAISE_PER_RUPEE = 100;

// ── Conversion ──────────────────────────────────────────────────────────────

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Check if a value is a valid positive integer paise amount. */
export function isValidPaise(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
}

/** Check if a value is a valid non-negative integer paise amount. */
export function isNonNegativePaise(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 0;
}

/** Assert that a paise amount is positive. Throws if not. */
export function assertPositivePaise(amount: number, label = 'Amount'): asserts amount is number {
  if (!isValidPaise(amount)) {
    throw new Error(`${label} must be a positive integer in paise, got ${amount}`);
  }
}

// ── Arithmetic (all deterministic, no floats) ───────────────────────────────

/** Add two paise amounts. */
export function addPaise(a: number, b: number): number {
  return a + b;
}

/** Subtract two paise amounts. Returns 0 if result would be negative. */
export function subtractPaise(a: number, b: number): number {
  return Math.max(0, a - b);
}

/** Compare two paise amounts: -1 if a < b, 0 if equal, 1 if a > b. */
export function comparePaise(a: number, b: number): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Check if two paise amounts are equal. */
export function equalsPaise(a: number, b: number): boolean {
  return a === b;
}

/** Calculate percentage of an amount in paise. Result is rounded to nearest paise. */
export function percentOfPaise(amountPaise: number, basisPoints: number): number {
  return Math.round((amountPaise * basisPoints) / 10_000);
}

/** Calculate basis points (1 bp = 0.01%) from a ratio. */
export function toBasisPoints(ratio: number): number {
  return Math.round(ratio * 10_000);
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** Minimum allowed transaction amount: ₹1 = 100 paise. */
export const MIN_TRANSACTION_PAISE = 100;

/** Maximum allowed transaction amount: ₹10,00,000 = 10,00,00,000 paise. */
export const MAX_TRANSACTION_PAISE = 100_000_000;

/** Minimum daily deposit amount: ₹1 = 100 paise. */
export const MIN_DAILY_DEPOSIT_PAISE = 100;

/** Maximum daily deposit amount: ₹1,00,000 = 10,00,000 paise. */
export const MAX_DAILY_DEPOSIT_PAISE = 10_000_000;

/** Check if a transaction amount is within allowed bounds. */
export function isTransactionAmountValid(paise: number): boolean {
  return paise >= MIN_TRANSACTION_PAISE && paise <= MAX_TRANSACTION_PAISE;
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Format paise as an Indian-locale rupee string, e.g. 1250000 -> "₹12,500.00". */
export function formatPaise(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(rupees);
}

/** Format paise without decimals: 1250000 -> "₹12,500". */
export function formatPaiseCompact(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** Format paise as short Indian notation: 125000000 -> "₹12.5L", 12500000000 -> "₹125Cr". */
export function formatPaiseShort(paise: number): string {
  const absRupees = Math.abs(paise / PAISE_PER_RUPEE);
  const sign = paise < 0 ? '-' : '';
  if (absRupees >= 10_00_000) {
    return `${sign}₹${(absRupees / 10_00_000).toFixed(1)}Cr`;
  }
  if (absRupees >= 1000) {
    return `${sign}₹${(absRupees / 1000).toFixed(1)}L`;
  }
  return `${sign}₹${absRupees.toFixed(0)}`;
}

// ── API response helpers ────────────────────────────────────────────────────

/** Attach a `Rupees` display string alongside a paise field for API responses. */
export function withRupees(paise: number): { paise: number; rupees: number; display: string } {
  return { paise, rupees: paiseToRupees(paise), display: formatPaise(paise) };
}

/** Attach a `Rupees` display string with compact formatting for API responses. */
export function withRupeesCompact(paise: number): { paise: number; rupees: number; display: string; short: string } {
  return { paise, rupees: paiseToRupees(paise), display: formatPaise(paise), short: formatPaiseShort(paise) };
}

// ── Rounding ────────────────────────────────────────────────────────────────

/**
 * Round to nearest paise from a floating-point rupee amount.
 * Use only when converting external inputs (e.g., GST calculations).
 */
export function roundToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** Calculate a fee amount in basis points. Returns the fee in paise. */
export function calculateFee(amountPaise: number, feeBps: number): number {
  return percentOfPaise(amountPaise, feeBps);
}

/** Calculate interest using simple flat-rate formula in paise. */
export function calculateFlatInterest(
  principalPaise: number,
  annualRateBps: number,
  tenureMonths: number,
): number {
  return Math.round((principalPaise * annualRateBps * tenureMonths) / (10_000 * 12));
}
