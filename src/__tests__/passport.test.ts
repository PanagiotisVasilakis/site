// Vitest globals are enabled; no named imports needed.
import { validatePassport } from '@/lib/passport';
import rules from '@/config/passport.rules.json';

describe('Passport validation', () => {
  it('accepts defaults: 5–20 alphanumeric', () => {
    expect(validatePassport('AB123', {}).ok).toBe(true);
    expect(validatePassport('A1B2C3D4E5', {}).ok).toBe(true);
    expect(validatePassport('A'.repeat(20), {}).ok).toBe(true);
  });

  it('rejects symbols and out-of-range lengths', () => {
    expect(validatePassport('A@123', {}).ok).toBe(false);
    expect(validatePassport('abcd', {}).ok).toBe(false); // too short after uppercasing
    expect(validatePassport('A'.repeat(21), {}).ok).toBe(false); // too long
  });

  it('applies country overrides when provided', () => {
    expect(validatePassport('ABCDEF', { countryCode: 'GR', config: rules }).ok).toBe(true); // min 6
    expect(validatePassport('ABCDE', { countryCode: 'GR', config: rules }).ok).toBe(false); // too short for GR override
  });

  it('returns uppercase normalized value on success with clear error messages on failure', () => {
    const ok = validatePassport('ab123', {});
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toBe('AB123');

    const bad = validatePassport('a$123', {});
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('letters');
  });
});
