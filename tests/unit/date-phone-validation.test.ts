import { describe, expect, it } from 'vitest';

import { isGuestFormValid } from '@/components/guest/guestValidation';
import { normalizePhone } from '@/lib/phone';
import { wifiDisclosureWindow } from '@/lib/propertyTime';

describe('Wi-Fi disclosure window', () => {
  it('computes the Athens Wi-Fi disclosure window through UTC conversion', () => {
    const window = wifiDisclosureWindow({
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      endDate: new Date('2026-07-25T00:00:00.000Z'),
      checkInTime: '15:00',
      checkOutTime: '11:00',
      timeZone: 'Europe/Athens',
    });
    expect(window.revealAt.toISOString()).toBe('2026-07-19T12:00:00.000Z');
    expect(window.expiresAt.toISOString()).toBe('2026-07-25T08:00:00.000Z');
  });

  it('rejects invalid property wall-clock times', () => {
    expect(() => wifiDisclosureWindow({
      startDate: new Date('2030-01-01'),
      endDate: new Date('2030-01-02'),
      checkInTime: '25:00',
      checkOutTime: '11:00',
      timeZone: 'Europe/Athens',
    })).toThrow('Invalid property time');
  });
});

describe('phone and guest form validation', () => {
  it.each([
    ['2101234567', 'GR', '+302101234567'],
    [' 698-123-4567 ', 'GR', '+306981234567'],
    ['+15551234567', 'ABROAD', '+15551234567'],
    ['441234567890', undefined, '+441234567890'],
  ] as const)('normalizes %s to E.164', (input, origin, expected) => {
    expect(normalizePhone(input, origin)?.e164).toBe(expected);
  });

  it.each(['', '123', '+1', '++30698', 'abcd', '+03012345678'])('rejects invalid phone %s', (input) => {
    expect(normalizePhone(input, 'GR')).toBeNull();
  });

  const validCredentials = {
    origin: '' as const,
    claimToken: '',
    phone: '+306912345678',
    password: 'password',
    acceptTerms: false,
  };

  it('requires only valid credentials for sign in', () => {
    expect(isGuestFormValid('signin', validCredentials)).toBe(true);
    expect(isGuestFormValid('signin', { ...validCredentials, phone: 'short' })).toBe(false);
    expect(isGuestFormValid('signin', { ...validCredentials, password: 'short' })).toBe(false);
  });

  it('requires origin, claim token and explicit terms for activation', () => {
    const validSignup = {
      ...validCredentials,
      origin: 'GR' as const,
      claimToken: `claim_${'a'.repeat(43)}`,
      acceptTerms: true,
    };
    expect(isGuestFormValid('signup', validSignup)).toBe(true);
    expect(isGuestFormValid('signup', { ...validSignup, origin: '' })).toBe(false);
    expect(isGuestFormValid('signup', { ...validSignup, claimToken: 'too-short' })).toBe(false);
    expect(isGuestFormValid('signup', { ...validSignup, acceptTerms: false })).toBe(false);
  });
});
