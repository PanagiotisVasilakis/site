/**
 * Greek AFM (Tax ID) validation
 * Rules:
 * - Exactly 9 numeric digits
 * - Checksum: sum_{i=1..8}(d[i] * 2^{9-i}) % 11 => expected; if expected === 10 then 0
 * - The 9th digit must equal expected
 */

/** Compute expected AFM check digit (0-9) for the given eight-digit prefix. */
export function computeAfmCheckDigit(eightDigits: string): number {
  if (!/^\d{8}$/.test(eightDigits)) {
    throw new Error('computeAfmCheckDigit expects exactly 8 digits');
  }
  const digits = eightDigits.split('').map((c) => Number(c));
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const weight = 2 ** (8 - i); // 2^8 down to 2^1
    sum += digits[i] * weight;
  }
  const remainder = sum % 11;
  return remainder === 10 ? 0 : remainder;
}

/** Validate full 9-digit AFM string. */
export function isValidAFM(input: string): boolean {
  if (typeof input !== 'string') return false;
  const afm = input.trim();
  if (!/^\d{9}$/.test(afm)) return false;
  const expected = computeAfmCheckDigit(afm.slice(0, 8));
  return Number(afm[8]) === expected;
}

/** Normalize AFM by trimming whitespace; returns null if not 9 digits numeric after trim. */
export function normalizeAFM(input: string): string | null {
  const v = (input ?? '').trim();
  return /^\d{9}$/.test(v) ? v : null;
}
