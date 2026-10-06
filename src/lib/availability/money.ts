// Money is integer cents in CURRENCY. Parsing and formatting work on digit
// strings, never on floating-point euros.

import { CURRENCY } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';

const NUMBER_LOCALE: Record<Locale, string> = { en: 'en-US', el: 'el-GR' };

const WHOLE_EUROS = /^[0-9]+$/;
const FRACTION_CENTS = /^[0-9]{1,2}$/;

/**
 * An admin's euro amount as cents: '85' -> 8500, '85.50' or '85,50' -> 8550.
 * Only digits and one decimal separator with one or two decimals; no sign,
 * exponent or thousands separator. Returns null for anything else.
 */
export function parseEuroInputToCents(input: string): number | null {
  const parts = input.trim().split(/[.,]/);
  if (parts.length > 2) return null;
  const [whole, fraction = '00'] = parts;
  if (!WHOLE_EUROS.test(whole) || !FRACTION_CENTS.test(fraction)) return null;

  const euros = Number(whole);
  if (!Number.isSafeInteger(euros)) return null;
  const cents = euros * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 8550 -> '85,50 €' (el) or '€85.50' (en), from the exact decimal string '85.50'. */
export function formatCents(cents: number, locale: Locale): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('cents must be a safe integer');
  const magnitude = Math.abs(cents);
  const remainder = magnitude % 100;
  const euros = (magnitude - remainder) / 100;
  const decimal = `${cents < 0 ? '-' : ''}${euros}.${String(remainder).padStart(2, '0')}`;
  // Intl formats a decimal string exactly (ES2023); TypeScript types only
  // `${number}` literals, so the string built above from integers is asserted.
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { style: 'currency', currency: CURRENCY }).format(
    decimal as Intl.StringNumericLiteral,
  );
}

/** Like formatCents without the decimals of whole euros: 8000 -> '80 €' (el) or '€80' (en); 8550 -> '€85.50'. */
export function formatCentsShort(cents: number, locale: Locale): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('cents must be a safe integer');
  if (cents % 100 !== 0) return formatCents(cents, locale);
  // A safe integer divisible by 100 divides exactly.
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 })
    .format(cents / 100);
}
