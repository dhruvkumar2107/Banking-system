/**
 * Money helpers. Internally, ALL amounts are integer paise (1 rupee = 100 paise).
 * Never use floating point for money.
 */
export const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

/** Format paise as an Indian-locale rupee string, e.g. 1250000 -> "₹12,500.00". */
export function formatPaise(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(rupees);
}

/** Attach a `Rupees` display string alongside a paise field for API responses. */
export function withRupees(paise: number): { paise: number; rupees: number; display: string } {
  return { paise, rupees: paiseToRupees(paise), display: formatPaise(paise) };
}
