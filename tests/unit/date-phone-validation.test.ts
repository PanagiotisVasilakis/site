import { afterEach, describe, expect, it, vi } from 'vitest';

import { isGuestFormValid } from '@/components/guest/guestValidation';
import {
  dateRangeFromParams,
  dateRangeToParams,
  formatDateRange,
  getBlockedDates,
  getNights,
  validateDateRange,
} from '@/lib/dateUtils';
import { normalizePhone } from '@/lib/phone';
import { wifiDisclosureWindow } from '@/lib/propertyTime';
import { normalizeStayRequestPhone } from '@/lib/stayRequestPhone';

describe('date and booking validation', () => {
  afterEach(() => vi.useRealTimers());

  it('counts calendar nights across a DST boundary', () => {
    const from = new Date('2026-10-24T12:00:00+03:00');
    const to = new Date('2026-10-25T12:00:00+02:00');
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(25);
    expect(getNights({ from, to })).toBe(1);
  });

  it('never returns a negative night count', () => {
    expect(getNights({ from: new Date('2030-01-03'), to: new Date('2030-01-01') })).toBe(0);
    expect(getNights({})).toBe(0);
  });

  it('formats English and Greek date ranges', () => {
    const range = { from: new Date(2030, 8, 10), to: new Date(2030, 8, 12) };
    expect(formatDateRange(range, 'en')).toMatch(/Sep/i);
    expect(formatDateRange(range, 'el')).toMatch(/Σεπ/i);
    expect(formatDateRange({}, 'en')).toBe('');
  });

  it('round-trips valid date ranges through query params', () => {
    const params = dateRangeToParams({
      from: new Date(2030, 0, 2),
      to: new Date(2030, 0, 9),
    });
    expect(params.toString()).toBe('checkin=2030-01-02&checkout=2030-01-09');
    const parsed = dateRangeFromParams(params);
    expect(parsed.from?.getFullYear()).toBe(2030);
    expect(parsed.to?.getDate()).toBe(9);
  });

  it('rejects malformed query dates without throwing', () => {
    const result = dateRangeFromParams(new URLSearchParams('checkin=not-a-date&checkout=2030-13-99'));
    expect(result).toEqual({ from: undefined, to: undefined });
  });

  it('returns every validation failure in decision order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-10T12:00:00Z'));
    expect(validateDateRange({})).toEqual({ valid: false, error: 'Please select a check-in date' });
    expect(validateDateRange({ from: new Date('2030-01-09') })).toEqual({
      valid: false,
      error: 'Check-in date cannot be in the past',
    });
    expect(validateDateRange({ from: new Date('2030-01-11') })).toEqual({
      valid: false,
      error: 'Please select a check-out date',
    });
    expect(validateDateRange({ from: new Date('2030-01-12'), to: new Date('2030-01-11') }, 'el')).toEqual({
      valid: false,
      error: 'Η αναχώρηση πρέπει να είναι μετά την άφιξη',
    });
    expect(validateDateRange({ from: new Date('2030-01-11'), to: new Date('2030-02-20') })).toEqual({
      valid: false,
      error: 'Maximum stay is 30 nights',
    });
    expect(validateDateRange({ from: new Date('2030-01-11'), to: new Date('2030-01-12') })).toEqual({ valid: true });
    expect(getBlockedDates()).toEqual([]);
  });

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

  it('normalizes stay-request numbers using the property country', () => {
    expect(normalizeStayRequestPhone('695 123 4567')).toBe('+306951234567');
    expect(normalizeStayRequestPhone('invalid')).toBeNull();
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
