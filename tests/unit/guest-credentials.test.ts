import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { portalTranslations } from '@/i18n/domains/portal';
import {
  addClaimCredentialIssues,
  addSignInCredentialIssues,
  guestCredentialMessages,
} from '@/lib/validation/guestCredentials';

const messages = guestCredentialMessages('en');
const GREEK = 'ΚαλημέραΚαλησπέραΚαληνύχταΕλλάδαΚυπαρισσία';

const claimCredentials = z.object({
  origin: z.enum(['GR', 'ABROAD']),
  phone: z.string(),
  password: z.string(),
}).superRefine((value, ctx) => addClaimCredentialIssues(ctx, value, messages));

const signInCredentials = z.object({ phone: z.string() })
  .superRefine((value, ctx) => addSignInCredentialIssues(ctx, value, messages));

function claimIssues(password: string, phone = '+30 691 234 5678', origin: 'GR' | 'ABROAD' = 'ABROAD') {
  const result = claimCredentials.safeParse({ origin, phone, password });
  return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

describe('guest credential messages', () => {
  it.each(['en', 'el'] as const)('are written for every guest-visible case in %s', (locale) => {
    const { phoneFormat, passwordTooLong, passwordTooWeak } = guestCredentialMessages(locale);
    const dictionary = portalTranslations[locale];

    expect(phoneFormat).toBe(dictionary.phoneHint);
    expect(phoneFormat).toContain('+30 69');
    expect(passwordTooLong).toContain('72');
    expect(passwordTooWeak).toContain('12345678');
    expect(new Set([phoneFormat, passwordTooLong, passwordTooWeak]).size).toBe(3);
  });

  it('differ between the languages', () => {
    const greek = guestCredentialMessages('el');
    expect(greek.phoneFormat).not.toBe(messages.phoneFormat);
    expect(greek.passwordTooLong).not.toBe(messages.passwordTooLong);
    expect(greek.passwordTooWeak).not.toBe(messages.passwordTooWeak);
    expect(greek.phoneFormat).toMatch(/\p{Script=Greek}/u);
  });
});

describe('password length in bytes', () => {
  it('accepts 72 bytes and refuses 73, because bcrypt ignores everything after byte 72', () => {
    const accepted = 'Zq7'.repeat(24);
    expect(Buffer.byteLength(accepted)).toBe(72);

    expect(claimIssues(accepted)).toEqual([]);
    expect(claimIssues(`${accepted}x`)).toEqual([{ path: 'password', message: messages.passwordTooLong }]);
  });

  it('counts bytes, not characters: 37 Greek letters are 74 bytes while 36 are 72', () => {
    const letters = [...GREEK];
    const thirtySix = letters.slice(0, 36).join('');
    const thirtySeven = letters.slice(0, 37).join('');
    expect(Buffer.byteLength(thirtySix)).toBe(72);
    expect(Buffer.byteLength(thirtySeven)).toBe(74);

    expect(claimIssues(thirtySix)).toEqual([]);
    expect(claimIssues(thirtySeven)).toEqual([{ path: 'password', message: messages.passwordTooLong }]);
  });

  it('counts the four bytes of an emoji', () => {
    const prefix = 'Zq7'.repeat(23);
    expect(Buffer.byteLength(`${prefix}😀`)).toBe(73);

    expect(claimIssues(`${prefix}😀`)).toEqual([{ path: 'password', message: messages.passwordTooLong }]);
  });

  it('reports a password that is both too long and repetitive as too long only', () => {
    expect(claimIssues('a'.repeat(100))).toEqual([{ path: 'password', message: messages.passwordTooLong }]);
  });
});

describe('trivially weak passwords', () => {
  it.each([
    ['one character repeated', 'aaaaaaaa'],
    ['one digit repeated', '11111111'],
    ['a rising run of digits', '12345678'],
    ['a falling run of digits', '87654321'],
    ['a rising run of letters', 'abcdefgh'],
    ['a rising run of capitals', 'ABCDEFGH'],
    ['a long run', '0123456789'],
    ['a run of Greek letters', 'αβγδεζηθ'],
  ])('refuses %s', (_label, password) => {
    expect(claimIssues(password)).toEqual([{ path: 'password', message: messages.passwordTooWeak }]);
  });

  it.each([
    ['as typed', '+30 691 234 5678'],
    ['in international form without separators', '+306912345678'],
    ['without the plus', '306912345678'],
    ['with the 00 prefix', '00306912345678'],
    ['without the country code', '6912345678'],
    ['with other separators', '(691) 234-5678'],
  ])('refuses the phone number itself %s', (_label, password) => {
    expect(claimIssues(password, '+30 691 234 5678')).toEqual([{ path: 'password', message: messages.passwordTooWeak }]);
  });

  it('refuses the Greek local form of the number for a Greek origin', () => {
    expect(claimIssues('6912345678', '6912345678', 'GR')).toEqual([{ path: 'password', message: messages.passwordTooWeak }]);
  });

  it('accepts passwords that only resemble these', () => {
    for (const password of [
      'qwertyui', // a keyboard pattern is not a character run
      'password', // no breach list
      'abcdefgz',
      '12345679',
      'aaaaaaab',
      '6912345679', // another number
      'call 6912345678', // not the number alone
      '6912345678!',
      '691234',
      'correct horse battery staple',
    ]) {
      expect(claimIssues(password), password).toEqual([]);
    }
  });

  it('judges the number the guest submitted, never an account', () => {
    expect(claimIssues('6912345678', '+49 151 1234567')).toEqual([]);
    expect(claimIssues('4915112345', '+49 151 1234567')).toEqual([]);
    expect(claimIssues('491511234567', '+49 151 1234567')).toEqual([{ path: 'password', message: messages.passwordTooWeak }]);
  });
});

describe('phone format', () => {
  it.each([
    ['a national number with a leading 0', '0151 1234567'],
    ['a national number with a leading 0 and no spaces', '01511234567'],
    ['letters', 'phone-number'],
    ['too few digits', '+30 123'],
    ['a plus in the middle', '30+6912345678'],
  ])('refuses %s for a claim, with the hint and no other detail', (_label, phone) => {
    expect(claimIssues('correct horse battery', phone)).toEqual([{ path: 'phone', message: messages.phoneFormat }]);
  });

  it.each([
    ['international with spaces', '+49 151 1234567'],
    ['international with the 00 prefix', '0049 151 1234567'],
    ['digits with the country code and no plus', '491511234567'],
  ])('accepts %s for a claim', (_label, phone) => {
    expect(claimIssues('correct horse battery', phone)).toEqual([]);
  });

  it('accepts the Greek ten-digit local number only for a Greek origin', () => {
    expect(claimIssues('correct horse battery', '6912345678', 'GR')).toEqual([]);
    expect(claimIssues('correct horse battery', '0691234567', 'GR')).toEqual([{ path: 'phone', message: messages.phoneFormat }]);
  });

  it.each(['0151 1234567', '01511234567', 'phone-number', '+30 123'])('refuses %s at sign-in, which reads the number as the lookup does', (phone) => {
    const result = signInCredentials.safeParse({ phone });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })))
      .toEqual([{ path: 'phone', message: messages.phoneFormat }]);
  });

  it.each(['+49 151 1234567', '6912345678', '306912345678', '0030 691 234 5678'])('accepts %s at sign-in', (phone) => {
    expect(signInCredentials.safeParse({ phone }).success).toBe(true);
  });

  it('adds no password issue at sign-in: only the claim sets a password', () => {
    expect(signInCredentials.safeParse({ phone: '+30 691 234 5678', password: '12345678' }).success).toBe(true);
  });
});
