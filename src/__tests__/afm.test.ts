// Vitest globals are enabled; no named imports needed.
import { isValidAFM } from '@/lib/afm';

describe('AFM (Greek Tax ID) validation', () => {
  it('rejects non-numeric or wrong length', () => {
    expect(isValidAFM('')).toBe(false);
    expect(isValidAFM('123')).toBe(false);
    expect(isValidAFM('1234567890')).toBe(false);
    expect(isValidAFM('ABC123456')).toBe(false);
  });

  it('accepts exactly 9 digits', () => {
    expect(isValidAFM('123456789')).toBe(true);
    expect(isValidAFM('000000000')).toBe(true);
    expect(isValidAFM('999999999')).toBe(true);
  });

  it('rejects strings with non-numeric characters', () => {
    expect(isValidAFM('12345678A')).toBe(false);
    expect(isValidAFM('12345 789')).toBe(false);
    expect(isValidAFM('12345678-')).toBe(false);
  });
});
