import {
  buildBookingLastNameTokenSearchValues,
  createBookingLastNameTokens,
  createBookingLastNameTokensFromStoredLegacyValues,
  isLegacyRawBookingLastNameToken,
  normalizeBookingLastName,
  normalizeBookingLastNameNoWs,
} from './bookingLastNameTokens';

describe('booking last-name lookup tokens', () => {
  beforeEach(() => {
    process.env.SECURITY_PEPPER = 'test-pepper-for-booking-token-tests';
  });

  it('normalizes case and whitespace for lookup', () => {
    expect(normalizeBookingLastName('  Van Der Meer  ')).toBe('van der meer');
    expect(normalizeBookingLastNameNoWs('  Van Der Meer  ')).toBe('vandermeer');
  });

  it('creates deterministic HMAC tokens instead of raw names', () => {
    const tokens = createBookingLastNameTokens('Papadopoulos');

    expect(tokens.lastNameToken).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.lastNameTokenNoWs).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.lastNameToken).not.toBe('papadopoulos');
  });

  it('includes legacy raw values in search candidates for backward compatibility', () => {
    const candidates = buildBookingLastNameTokenSearchValues('  Papa Dopoulos  ');

    expect(candidates).toContain('papa dopoulos');
    expect(candidates).toContain('papadopoulos');
    expect(candidates.filter((value) => /^[a-f0-9]{64}$/i.test(value))).toHaveLength(2);
  });

  it('detects and repairs legacy raw tokens', () => {
    expect(isLegacyRawBookingLastNameToken('papadopoulos')).toBe(true);
    expect(isLegacyRawBookingLastNameToken('a'.repeat(64))).toBe(false);

    const repaired = createBookingLastNameTokensFromStoredLegacyValues('Papa Dopoulos', 'papadopoulos');
    expect(repaired.lastNameToken).toMatch(/^[a-f0-9]{64}$/);
    expect(repaired.lastNameTokenNoWs).toMatch(/^[a-f0-9]{64}$/);
  });
});
