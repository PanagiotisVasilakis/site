import { describe, it, expect } from 'vitest';
import { normalizePhone, isE164 } from '@/lib/phone';

describe('Phone normalization (E.164)', () => {
  it('normalizes Greek local 10-digit to +30 prefix', () => {
    expect(normalizePhone('2101234567', 'GR')?.e164).toBe('+302101234567'); // landline example
    expect(normalizePhone('  698-123-4567 ', 'GR')?.e164).toBe('+306981234567'); // mobile with separators
  });

  it('accepts already formatted E.164 numbers', () => {
    expect(normalizePhone('+306981234567', 'GR')?.e164).toBe('+306981234567');
    expect(isE164('+15551234567')).toBe(true);
  });

  it('adds + if missing for plausible international digits', () => {
    expect(normalizePhone('15551234567')?.e164).toBe('+15551234567');
    expect(normalizePhone('441234567890')?.e164).toBe('+441234567890');
  });

  it('rejects clearly invalid lengths or characters', () => {
    expect(normalizePhone('123', 'GR')).toBeNull();
    expect(normalizePhone('+1', 'GR')).toBeNull();
    expect(normalizePhone('++30698', 'GR')).toBeNull();
    expect(normalizePhone('abcd', 'GR')).toBeNull();
  });
});
