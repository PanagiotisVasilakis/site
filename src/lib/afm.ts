/**
 * Greek AFM (Tax ID) validation
 * Rules:
 * - Exactly 9 numeric digits
 */

/** Validate full 9-digit AFM string. */
export function isValidAFM(input: string): boolean {
  if (typeof input !== 'string') return false;
  const afm = input.trim();
  return /^\d{9}$/.test(afm);
}

