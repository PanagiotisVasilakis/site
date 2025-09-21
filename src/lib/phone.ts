/** Phone normalization and validation for E.164.
 * Behavior:
 * - Strips spaces, dashes, parentheses.
 * - If origin === 'GR' and input matches 10 local digits (starting with 2,6,7,8,9 typical), prefix +30.
 * - If input starts with +, keep as is after stripping and validate E.164 length (8..15 total digits typical ITU range).
 * - If input is purely digits and 8..15 digits, treat as missing plus: return with '+' prefixed (international).
 * - Reject otherwise.
 */

export type Origin = 'GR' | 'ABROAD';

export function normalizePhone(input: string, origin?: Origin): { e164: string } | null {
  if (typeof input !== 'string') return null;
  // Remove common separators
  const raw = input.replace(/[\s\-()]/g, '');
  if (!raw) return null;

  // Greek local auto-prefix (+30) for 10-digit locals
  if (origin === 'GR' && /^\d{10}$/.test(raw)) {
    // Basic local sanity: leading 2 (landline) or 6/7/8/9 (mobiles vary); don't overfit
    const prefixed = `+30${raw}`;
    return isE164(prefixed) ? { e164: prefixed } : null;
  }

  // Already in international form
  if (raw.startsWith('+')) {
    return isE164(raw) ? { e164: raw } : null;
  }

  // If all digits and plausible length, assume international number missing '+'
  if (/^\d{8,15}$/.test(raw)) {
    const prefixed = `+${raw}`;
    return isE164(prefixed) ? { e164: prefixed } : null;
  }

  return null;
}

export function isE164(v: string): boolean {
  // E.164: + followed by 8 to 15 digits total
  return /^\+[1-9]\d{7,14}$/.test(v);
}
