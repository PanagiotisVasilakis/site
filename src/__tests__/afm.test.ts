import { describe, it, expect } from 'vitest';
import { isValidAFM, computeAfmCheckDigit } from '@/lib/afm';

describe('AFM (Greek Tax ID) validation', () => {
  it('rejects non-numeric or wrong length', () => {
    expect(isValidAFM('')).toBe(false);
    expect(isValidAFM('123')).toBe(false);
    expect(isValidAFM('1234567890')).toBe(false);
    expect(isValidAFM('ABC123456')).toBe(false);
  });

  it('validates checksum for generated AFM', () => {
    const base = '09425983'; // 8-digit base
    const check = computeAfmCheckDigit(base);
    const afm = base + String(check);
    expect(isValidAFM(afm)).toBe(true);
    // Tamper last digit
    const wrong = base + String((check + 1) % 10);
    expect(isValidAFM(wrong)).toBe(false);
  });

  it('accepts known valid AFMs and rejects nearby variants', () => {
    const bases = ['00000000', '12345678', '87654321'];
    for (const base of bases) {
      const check = computeAfmCheckDigit(base);
      const good = base + String(check);
      expect(isValidAFM(good)).toBe(true);
      const bad = base + String((check + 3) % 10);
      expect(isValidAFM(bad)).toBe(false);
    }
  });
});
