import { createHash } from 'node:crypto';

/**
 * Aadhaar handling. Two rules govern this file:
 *
 *  1. The full 12-digit number is NEVER persisted. We keep only the last four
 *     digits (for a human to eyeball against the card) and a salted SHA-256 hash
 *     (so a duplicate submission can be detected without the number being
 *     recoverable from the database or a backup).
 *  2. The number is validated locally with the Verhoeff checksum that UIDAI
 *     builds into every Aadhaar. That catches typos and obviously fake numbers
 *     offline — it is NOT proof of identity, which is what admin verification of
 *     the uploaded scan is for.
 *
 * Every function here is pure (bar the env read in `hashAadhaar`) so the
 * arithmetic is unit-testable without Nest or a database.
 */

/** Verhoeff dihedral group D5 multiplication table. */
const D5 = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;

/** Verhoeff permutation table. */
const PERM = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** Verhoeff inverse table. */
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

/** Strip spaces and hyphens — cards print the number in groups of four. */
export function normalizeAadhaar(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * True when `digits` carries a valid Verhoeff check digit (the last digit).
 * Works on any length; Aadhaar-specific length/leading-digit rules are applied
 * by `isValidAadhaar`.
 */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  // Walk right-to-left; position 0 is the check digit itself.
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = D5[c][PERM[i % 8][Number(reversed[i])]];
  }
  return c === 0;
}

/**
 * Full Aadhaar validation: 12 digits, cannot start with 0 or 1 (UIDAI never
 * issues those), and the Verhoeff check digit must match.
 */
export function isValidAadhaar(raw: string): boolean {
  const n = normalizeAadhaar(raw);
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  return verhoeffValid(n);
}

/** Compute the Verhoeff check digit for an 11-digit body. Used by tests/seeds. */
export function verhoeffCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error('body must be digits');
  let c = 0;
  const reversed = body.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = D5[c][PERM[(i + 1) % 8][Number(reversed[i])]];
  }
  return INV[c];
}

/** The last four digits — the only part of the number we store in the clear. */
export function aadhaarLast4(raw: string): string {
  return normalizeAadhaar(raw).slice(-4);
}

/**
 * Salted SHA-256 of the full number, used only to spot the same Aadhaar being
 * submitted twice. The salt comes from AADHAAR_HASH_SALT so the hashes are
 * useless outside this deployment; a bare SHA-256 of a 12-digit number would be
 * trivially brute-forced (10^12 candidates is minutes on a GPU).
 */
export function hashAadhaar(raw: string, salt = process.env.AADHAAR_HASH_SALT ?? ''): string {
  return createHash('sha256').update(`${salt}:${normalizeAadhaar(raw)}`).digest('hex');
}

/** Display form for the UI: `XXXX-XXXX-1234`. Never reconstructs the number. */
export function maskAadhaar(last4: string | null): string | null {
  if (!last4) return null;
  return `XXXX-XXXX-${last4}`;
}
