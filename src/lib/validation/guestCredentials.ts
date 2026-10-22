import type { z } from 'zod';

import type { Locale } from '@/i18n/config';
import { portalTranslations } from '@/i18n/domains/portal';
import { normalizePhone, phoneLookupCandidates, type Origin } from '@/lib/phone';

/**
 * bcrypt hashes only the first 72 bytes of a password and ignores the rest, so a longer password
 * would be silently truncated: two passwords that differ after byte 72 would be the same password.
 */
const GUEST_PASSWORD_MAX_BYTES = 72;

/** The longest country calling code (E.164): a password that is the number minus its code is the number. */
const MAX_COUNTRY_CODE_DIGITS = 3;

export type GuestCredentialMessages = Readonly<{
  phoneFormat: string;
  passwordTooLong: string;
  passwordTooWeak: string;
}>;

/** The messages of the guest sign-in and claim forms, in the language of the page the request comes from. */
export function guestCredentialMessages(locale: Locale): GuestCredentialMessages {
  const dictionary = portalTranslations[locale];
  return {
    phoneFormat: dictionary.phoneHint,
    passwordTooLong: dictionary.errors.passwordTooLong,
    passwordTooWeak: dictionary.errors.passwordTooWeak,
  };
}

function digitsOnly(value: string): string {
  let digits = '';
  for (const character of value) {
    if (character >= '0' && character <= '9') digits += character;
  }
  return digits;
}

/** One character repeated: aaaaaaaa, 11111111. */
function isRepeatedCharacter(characters: readonly string[]): boolean {
  return characters.every((character) => character === characters[0]);
}

/** Consecutive code points, all rising or all falling: 12345678, 87654321, abcdefgh. */
function isRun(characters: readonly string[]): boolean {
  const codes = characters.map((character) => character.codePointAt(0) ?? 0);
  const step = codes[1] - codes[0];
  return Math.abs(step) === 1 && codes.every((code, index) => index === 0 || code - codes[index - 1] === step);
}

function isPhoneSeparator(character: string): boolean {
  // The characters normalizePhone strips, and the + of an international number.
  return character.trim() === '' || '-()+'.includes(character);
}

/**
 * The password is the phone number: as typed, in international form, or without its country code.
 * Only a password made of digits and phone separators can be one.
 */
function isPhoneNumber(password: string, phone: string, origin: Origin | undefined): boolean {
  const digits = digitsOnly(password);
  if (!digits || [...password].some((character) => !isPhoneSeparator(character) && (character < '0' || character > '9'))) {
    return false;
  }
  if (digits === digitsOnly(phone)) return true;
  // The same number written another way: +30 691…, 0030 691…, or the Greek local form for a GR claim.
  const typed = normalizePhone(password, origin)?.e164;
  const submitted = normalizePhone(phone, origin)?.e164;
  if (typed !== undefined && typed === submitted) return true;
  const international = submitted?.slice(1);
  return international !== undefined
    && international.endsWith(digits)
    && digits.length >= international.length - MAX_COUNTRY_CODE_DIGITS;
}

/**
 * Trivially guessable passwords, and nothing more: no character classes, no breach list. These are
 * the values a person tries first against an account whose phone number they know.
 */
function isTriviallyWeakPassword(password: string, phone: string, origin: Origin | undefined): boolean {
  const characters = [...password];
  return characters.length >= 2
    && (isRepeatedCharacter(characters) || isRun(characters) || isPhoneNumber(password, phone, origin));
}

/**
 * Format checks that run before the sensitive rate limiter spends budget and before any database
 * work. They look at the submitted values only, never at an account, so they reveal nothing about
 * which phone numbers are registered.
 */
export function addSignInCredentialIssues(
  ctx: z.RefinementCtx,
  value: { phone: string },
  messages: GuestCredentialMessages,
): void {
  // The reading the sign-in lookup applies (phoneLookupCandidates): an empty list can never match an account.
  if (phoneLookupCandidates(value.phone).length === 0) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: messages.phoneFormat });
  }
}

/**
 * A claim sets the password of a new account, so it carries the strength rules that sign-in must
 * not: sign-in only compares against a stored hash, and a password accepted before keeps working.
 */
export function addClaimCredentialIssues(
  ctx: z.RefinementCtx,
  value: { origin: Origin; phone: string; password: string },
  messages: GuestCredentialMessages,
): void {
  // The reading consumeBookingClaimGrant applies (normalizePhone with the origin).
  if (normalizePhone(value.phone, value.origin) === null) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: messages.phoneFormat });
  }
  if (Buffer.byteLength(value.password, 'utf8') > GUEST_PASSWORD_MAX_BYTES) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: messages.passwordTooLong });
  } else if (isTriviallyWeakPassword(value.password, value.phone, value.origin)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: messages.passwordTooWeak });
  }
}
