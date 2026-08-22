import {
  aadhaarLast4,
  hashAadhaar,
  isValidAadhaar,
  maskAadhaar,
  normalizeAadhaar,
  verhoeffCheckDigit,
  verhoeffValid,
} from './aadhaar';

/**
 * A handful of numbers built to be structurally valid: an 11-digit body plus the
 * Verhoeff check digit computed for it. These are NOT real Aadhaar numbers —
 * they only satisfy the public checksum, which is exactly what the validator is
 * meant to test.
 */
function makeValid(body11: string): string {
  return body11 + String(verhoeffCheckDigit(body11));
}

describe('aadhaar', () => {
  describe('normalizeAadhaar', () => {
    it('strips the spaces and hyphens cards are printed with', () => {
      expect(normalizeAadhaar('2345 6789 0123')).toBe('234567890123');
      expect(normalizeAadhaar('2345-6789-0123')).toBe('234567890123');
      expect(normalizeAadhaar(' 2345 - 6789-0123 ')).toBe('234567890123');
    });
  });

  describe('verhoeffCheckDigit / verhoeffValid', () => {
    it('produces a digit that makes the whole string check out', () => {
      for (const body of ['23456789012', '98765432109', '55555555555', '20000000000']) {
        const full = makeValid(body);
        expect(full).toHaveLength(12);
        expect(verhoeffValid(full)).toBe(true);
      }
    });

    it('rejects a number with any single digit altered', () => {
      const full = makeValid('23456789012');
      for (let i = 0; i < full.length; i++) {
        const wrongDigit = String((Number(full[i]) + 1) % 10);
        const tampered = full.slice(0, i) + wrongDigit + full.slice(i + 1);
        expect(verhoeffValid(tampered)).toBe(false);
      }
    });

    it('rejects a number with two adjacent digits transposed', () => {
      const full = makeValid('23456789012');
      for (let i = 0; i < full.length - 1; i++) {
        if (full[i] === full[i + 1]) continue; // a swap of equal digits is a no-op
        const swapped =
          full.slice(0, i) + full[i + 1] + full[i] + full.slice(i + 2);
        expect(verhoeffValid(swapped)).toBe(false);
      }
    });

    it('rejects non-numeric input rather than throwing', () => {
      expect(verhoeffValid('abcd')).toBe(false);
      expect(verhoeffValid('')).toBe(false);
    });
  });

  describe('isValidAadhaar', () => {
    it('accepts a checksum-valid 12-digit number, spaced or not', () => {
      const full = makeValid('23456789012');
      expect(isValidAadhaar(full)).toBe(true);
      expect(isValidAadhaar(`${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`)).toBe(true);
    });

    it('rejects the wrong length', () => {
      expect(isValidAadhaar('2345678901')).toBe(false); // 10
      expect(isValidAadhaar('2345678901234')).toBe(false); // 13
    });

    it('rejects numbers starting with 0 or 1 — UIDAI never issues those', () => {
      // Build bodies that ARE checksum-valid so only the leading digit can fail.
      expect(verhoeffValid(makeValid('03456789012'))).toBe(true);
      expect(isValidAadhaar(makeValid('03456789012'))).toBe(false);
      expect(verhoeffValid(makeValid('13456789012'))).toBe(true);
      expect(isValidAadhaar(makeValid('13456789012'))).toBe(false);
    });

    it('rejects a checksum-invalid number even with a good prefix', () => {
      const full = makeValid('23456789012');
      const bad = full.slice(0, 11) + String((Number(full[11]) + 5) % 10);
      expect(bad).not.toBe(full);
      expect(isValidAadhaar(bad)).toBe(false);
    });

    it('rejects letters and separators-only garbage', () => {
      expect(isValidAadhaar('abcd efgh ijkl')).toBe(false);
      expect(isValidAadhaar('------------')).toBe(false);
    });
  });

  describe('storage helpers', () => {
    const full = makeValid('23456789012');

    it('keeps only the last four digits in the clear', () => {
      expect(aadhaarLast4(full)).toBe(full.slice(-4));
      expect(aadhaarLast4(`${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`)).toBe(
        full.slice(-4),
      );
    });

    it('hashes deterministically for the same salt, and differently across salts', () => {
      expect(hashAadhaar(full, 's1')).toBe(hashAadhaar(full, 's1'));
      expect(hashAadhaar(full, 's1')).not.toBe(hashAadhaar(full, 's2'));
    });

    it('hashes the normalized form, so spacing does not create a false duplicate', () => {
      const spaced = `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`;
      expect(hashAadhaar(spaced, 's1')).toBe(hashAadhaar(full, 's1'));
    });

    it('never leaks the number: the hash is 64 hex chars and contains no digits of the input', () => {
      const h = hashAadhaar(full, 'salt');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(h).not.toContain(full);
    });

    it('masks for display without reconstructing the number', () => {
      expect(maskAadhaar('0123')).toBe('XXXX-XXXX-0123');
      expect(maskAadhaar(null)).toBeNull();
    });
  });
});
