/** Passport validation utility
 * Defaults: 5–20 chars, uppercase letters A–Z and digits 0–9 only.
 * Future: per-country overrides driven by JSON config.
 */

interface PassportRules {
  minLength: number;
  maxLength: number;
  allowChars: RegExp; // character class for individual chars, e.g., /[A-Z0-9]/
  message?: string; // optional custom message
}

type PassportConfigByCountry = Record<string, {
  minLength?: number;
  maxLength?: number;
  allowChars?: string; // string form of regex class, e.g., "[A-Z0-9]"
  message?: string;
}>;

const defaultPassportRules: PassportRules = {
  minLength: 5,
  maxLength: 20,
  allowChars: /[A-Z0-9]/,
  message: 'Use 5–20 letters (A–Z) or numbers only',
};

function mergeRules(base: PassportRules, overrides?: Partial<PassportRules>): PassportRules {
  return {
    minLength: overrides?.minLength ?? base.minLength,
    maxLength: overrides?.maxLength ?? base.maxLength,
    allowChars: overrides?.allowChars ?? base.allowChars,
    message: overrides?.message ?? base.message,
  };
}

function rulesFromConfig(countryCode?: string, config?: PassportConfigByCountry): PassportRules {
  if (!countryCode || !config) return defaultPassportRules;
  const cc = countryCode.toUpperCase();
  const item = config[cc];
  if (!item) return defaultPassportRules;
  const allow = item.allowChars ? new RegExp(item.allowChars) : undefined;
  return mergeRules(defaultPassportRules, {
    minLength: item.minLength,
    maxLength: item.maxLength,
    allowChars: allow,
    message: item.message,
  });
}

export function validatePassport(input: string, opts?: { countryCode?: string; config?: PassportConfigByCountry }): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Passport number is required' };
  const rules = rulesFromConfig(opts?.countryCode, opts?.config);
  const raw = input.trim().toUpperCase();
  // Length checks
  if (raw.length < rules.minLength) return { ok: false, error: `Must be at least ${rules.minLength} characters` };
  if (raw.length > rules.maxLength) return { ok: false, error: `Must be at most ${rules.maxLength} characters` };
  // Charset check: all chars must match rules.allowChars
  for (const ch of raw) {
    if (!rules.allowChars.test(ch)) {
      return { ok: false, error: rules.message || 'Use letters and numbers only' };
    }
  }
  return { ok: true, value: raw };
}
