import { normalizeStayRequestPhone } from '@/lib/stayRequestPhone';

describe('stay-request phone normalization', () => {
  it('canonicalizes Greek local numbers for later privacy matching', () => {
    expect(normalizeStayRequestPhone('691 234 5678')).toBe('+306912345678');
  });

  it('preserves explicit international country codes', () => {
    expect(normalizeStayRequestPhone('+44 7700 900123')).toBe('+447700900123');
  });

  it('rejects numbers that cannot be represented as E.164', () => {
    expect(normalizeStayRequestPhone('123')).toBeNull();
  });
});
